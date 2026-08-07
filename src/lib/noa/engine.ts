import "server-only";
import type {
  NoaClientAction,
  NoaModule,
  NoaRefetchScope,
  NoaResponse,
  NoaToolContext,
  NoaTurn,
} from "@/lib/noa/types";
import { createClient } from "@/lib/supabase/server";
import { ToolRegistry } from "@/lib/noa/registry";
import { ALL_MODULES } from "@/lib/noa/modules";
import { analyzeIntent } from "@/lib/noa/intent/analyzer";
import { routeModules } from "@/lib/noa/intent/router";
import { buildContext, renderContextBlock } from "@/lib/noa/context/builder";
import { getUserGeminiKey } from "@/lib/noa/keys";
import { getUserPersonality, renderPersonalityBlock } from "@/lib/noa/personality";
import { runGeminiLoop } from "@/lib/noa/gemini/loop";
import { runTool } from "@/lib/noa/executor";
import type { GeminiContent } from "@/lib/noa/gemini/client";

/**
 * NOA Engine — orquestador. Cablea los 8 pasos:
 *   guard → intent → registry → context → Gemini loop → executor → gate → armar.
 *
 * El guard (auth + rate limit) va en la route; aquí se asume `userId` ya
 * validado. Gemini vive SOLO dentro del loop; nunca ve Supabase.
 */

// El registro es inmutable: se construye una vez por proceso.
const registry = new ToolRegistry(ALL_MODULES);

const SYSTEM_BASE = [
  "Eres NOA, el asistente de la app de fitness Rogue. Respondes en español,",
  "en tono cercano y directo. Trabajas SIEMPRE con herramientas: cualquier dato",
  "sobre el usuario (entrenos, comidas, progreso…) lo obtienes llamando a una",
  "herramienta, NUNCA lo inventes ni lo supongas. Si no hay herramienta para algo,",
  "dilo con claridad. Para modificar datos, propón la acción y deja que el usuario",
  "confirme. No conoces la base de datos ni escribes SQL: solo usas herramientas.",
].join(" ");

export interface RunNoaInput {
  userId: string;
  message: string;
  /** Historial de la conversación (sin el turno actual). */
  history?: NoaTurn[];
  /** Día de hoy en la tz del usuario (YYYY-MM-DD), aportado por el cliente. */
  clientToday?: string;
}

/** Fecha del servidor como YYYY-MM-DD (fallback si el cliente no la manda). */
function serverToday(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Usa la fecha local del cliente si es válida; si no, la del servidor. */
function resolveToday(clientToday: string | undefined, now: Date): string {
  return typeof clientToday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(clientToday)
    ? clientToday
    : serverToday(now);
}

/** System prompt = reglas base + personalidad (solo forma) + contexto precargado
 *  de los módulos en scope. Si la personalidad falla al leerse, se usan valores
 *  por defecto: nunca bloquea la conversación. */
async function buildSystemPrompt(
  ctx: NoaToolContext,
  modules: NoaModule[],
): Promise<string> {
  const snapshot = await buildContext(registry, modules, ctx);
  const contextBlock = renderContextBlock(snapshot);
  const { personality, profileName } = await getUserPersonality(
    ctx.supabase,
    ctx.userId,
  );
  const personalityBlock = renderPersonalityBlock(personality, profileName);
  return [SYSTEM_BASE, personalityBlock, contextBlock].filter(Boolean).join("\n\n");
}

/** Convierte el historial de la UI al formato de Gemini (turnos de solo texto). */
function historyToContents(history: NoaTurn[] | undefined): GeminiContent[] {
  return (history ?? []).map((t) => ({
    role: (t.role === "assistant" ? "model" : "user") as GeminiContent["role"],
    parts: [{ text: t.content }],
  }));
}

export async function runNoa(input: RunNoaInput): Promise<NoaResponse> {
  const supabase = await createClient();
  const now = new Date();
  const ctx: NoaToolContext = {
    userId: input.userId,
    supabase,
    now,
    today: resolveToday(input.clientToday, now),
    locale: "es-ES",
  };

  // 1. Intent → módulos relevantes. Se arrastra el contexto del último turno
  // del usuario para que un follow-up sin palabras clave ("guárdala", "y el
  // otro brazo?") herede los módulos de lo que se estaba hablando.
  const lastUserMsg = [...(input.history ?? [])]
    .reverse()
    .find((t) => t.role === "user")?.content;
  const recentModules = lastUserMsg
    ? analyzeIntent(lastUserMsg, registry.modules()).modules
    : [];
  const intent = analyzeIntent(input.message, registry.modules(), recentModules);

  // 2. BYOK: sin clave, NOA no llama a Gemini.
  const apiKey = await getUserGeminiKey(supabase, input.userId);
  if (!apiKey) {
    return {
      reply:
        "Para usar NOA configura tu clave de Gemini en Ajustes. Es gratuita y solo tú la ves.",
      actions: [],
      pending: [],
      meta: {
        modules: intent.modules,
        usedTools: [],
        iterations: 0,
        missingKey: true,
      },
    };
  }

  // 2b. Etapa 2 del Intent Analyzer: si las palabras clave no dieron nada
  // ("¿cómo lo llevo?"), se le pregunta a Gemini qué módulos hacen falta antes
  // de responder a ciegas. Solo en ese caso: cuesta una llamada.
  const modules = intent.general
    ? await routeModules(input.message, registry.modules(), apiKey)
    : intent.modules;
  const tools = registry.select(modules);

  // 3. System prompt: reglas base + personalidad (solo forma) + contexto
  // precargado de los módulos en scope.
  const system = await buildSystemPrompt(ctx, modules);

  // 4. Conversación en formato Gemini (historial + turno actual).
  const contents: GeminiContent[] = [
    ...historyToContents(input.history),
    { role: "user", parts: [{ text: input.message }] },
  ];

  // 5. Bucle de razonamiento + ejecución de tools.
  const loop = await runGeminiLoop({ apiKey, system, contents, tools, ctx });

  return {
    reply: loop.reply,
    actions: loop.actions,
    pending: loop.pending,
    meta: {
      modules,
      usedTools: loop.usedTools,
      iterations: loop.iterations,
    },
  };
}

/**
 * Ejecuta una acción YA confirmada por el usuario (el "sí" del Action Gate).
 * Salta el gate a propósito: la confirmación es la autorización. Corre bajo la
 * RLS del usuario, igual que el resto.
 */
/** Una acción confirmada por el usuario (parte de un plan). */
export interface ConfirmAction {
  toolName: string;
  args: Record<string, unknown>;
}

export interface RunNoaConfirmInput {
  userId: string;
  /** Acciones confirmadas (una o varias: un "plan"). Se ejecutan en orden de
   *  dependencia, no en el orden en que llegan. */
  actions: ConfirmAction[];
  /** Conversación previa, para poder REANUDAR el plan tras confirmar. */
  history?: NoaTurn[];
  /** Día de hoy en la tz del usuario (YYYY-MM-DD), aportado por el cliente. */
  clientToday?: string;
}

/**
 * Orden de ejecución de un plan: lo que otras acciones necesitan va primero.
 * Un alimento existe antes que el plato que lo usa; la despensa antes que el
 * menú; y limpiar la semana antes de registrar las comidas nuevas.
 */
const CONFIRM_ORDER: Record<string, number> = {
  savePantryFood: 1,
  savePantryDish: 2,
  setNutritionGoals: 2,
  saveRoutine: 2,
  clearMealEntries: 3,
  addMealEntries: 4,
};
const orderOf = (toolName: string): number => CONFIRM_ORDER[toolName] ?? 5;

interface ExecutedStep {
  tool: string;
  ok: boolean;
  error?: string;
}

/** Resumen humano de un plan ejecutado (cuando NOA no aporta texto propio). */
function summarizeBatch(steps: ExecutedStep[]): string {
  const fails = steps.filter((s) => !s.ok);
  if (fails.length === 0) return "Hecho ✅";
  const okN = steps.length - fails.length;
  return `Hecho ${okN}/${steps.length}. No se pudo: ${fails
    .map((f) => `${f.tool} (${f.error ?? "error"})`)
    .join(", ")}.`;
}

/** Nota para que NOA continúe/cierre el plan tras ejecutarlo. */
function resumeBatchNote(steps: ExecutedStep[]): string {
  const lista = steps
    .map((s) => (s.ok ? `${s.tool} OK` : `${s.tool} FALLÓ (${s.error ?? "error"})`))
    .join("; ");
  return [
    `[sistema] El usuario ha confirmado un plan. Ejecutado: ${lista}.`,
    "Si el plan ya está completo, resúmelo al usuario en una sola frase breve y",
    "NO llames a más herramientas. Si quedaba algún paso pendiente, continúa",
    "proponiendo la siguiente acción.",
  ].join(" ");
}

export async function runNoaConfirm(input: RunNoaConfirmInput): Promise<NoaResponse> {
  const supabase = await createClient();
  const now = new Date();
  const ctx: NoaToolContext = {
    userId: input.userId,
    supabase,
    now,
    today: resolveToday(input.clientToday, now),
    locale: "es-ES",
  };

  // Orden de dependencia (estable): alimentos → platos → vaciar → menú.
  const actions = [...input.actions].sort((a, b) => orderOf(a.toolName) - orderOf(b.toolName));

  const executedActions: NoaClientAction[] = [];
  const refetchScopes = new Set<NoaRefetchScope>();
  const modules = new Set<NoaModule>();
  const steps: ExecutedStep[] = [];

  for (const a of actions) {
    const tool = registry.get(a.toolName);
    if (!tool || tool.kind === "read") {
      steps.push({ tool: a.toolName, ok: false, error: "acción no reconocida" });
      continue;
    }
    modules.add(tool.module);
    const outcome = await runTool(tool, a.args, ctx);
    if (outcome.status === "result") {
      if (outcome.refetch?.type === "refetch") refetchScopes.add(outcome.refetch.scope);
      steps.push({ tool: a.toolName, ok: true });
    } else if (outcome.status === "action") {
      executedActions.push(outcome.action);
      steps.push({ tool: a.toolName, ok: true });
    } else if (outcome.status === "error") {
      steps.push({ tool: a.toolName, ok: false, error: outcome.message });
    }
  }
  for (const scope of refetchScopes) executedActions.push({ type: "refetch", scope });

  const scopeModules = [...modules];

  // REANUDAR: se re-entra en el bucle con lo ejecutado, para que NOA cierre el
  // plan (o proponga un paso que faltara). Aquí vivía el bug de "limpia pero no
  // añade": antes se ejecutaba una sola acción y el plan moría.
  const apiKey = await getUserGeminiKey(supabase, input.userId);
  if (!apiKey) {
    return {
      reply: summarizeBatch(steps),
      actions: executedActions,
      pending: [],
      meta: { modules: scopeModules, usedTools: steps.map((s) => s.tool), iterations: 0 },
    };
  }

  const system = await buildSystemPrompt(ctx, scopeModules);
  const contents: GeminiContent[] = [
    ...historyToContents(input.history),
    { role: "user", parts: [{ text: resumeBatchNote(steps) }] },
  ];
  const loop = await runGeminiLoop({
    apiKey,
    system,
    contents,
    tools: registry.select(scopeModules),
    ctx,
  });

  return {
    reply: loop.reply || summarizeBatch(steps),
    actions: [...executedActions, ...loop.actions],
    pending: loop.pending,
    meta: {
      modules: scopeModules,
      usedTools: [...steps.map((s) => s.tool), ...loop.usedTools],
      iterations: loop.iterations,
    },
  };
}
