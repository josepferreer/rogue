import "server-only";
import type {
  NoaModule,
  NoaResponse,
  NoaToolContext,
  NoaTurn,
} from "@/lib/noa/types";
import { createClient } from "@/lib/supabase/server";
import { ToolRegistry } from "@/lib/noa/registry";
import { ALL_MODULES } from "@/lib/noa/modules";
import { analyzeIntent } from "@/lib/noa/intent/analyzer";
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
}

export async function runNoa(input: RunNoaInput): Promise<NoaResponse> {
  const supabase = await createClient();
  const ctx: NoaToolContext = {
    userId: input.userId,
    supabase,
    now: new Date(),
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
  const tools = registry.select(intent.modules);

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

  // 3. Context Builder: snapshot compacto de los módulos en scope.
  const snapshot = await buildContext(registry, intent.modules, ctx);
  const contextBlock = renderContextBlock(snapshot);

  // 3b. Personalidad: SOLO forma (tono, cercanía, longitud). Se inserta entre
  // las reglas base y el contexto, y su último párrafo vuelve a fijar que no
  // puede saltarse una herramienta ni tocar un dato. Si falla la lectura, se
  // usan los valores por defecto: nunca bloquea la conversación.
  const { personality, profileName } = await getUserPersonality(supabase, input.userId);
  const personalityBlock = renderPersonalityBlock(personality, profileName);

  const system = [SYSTEM_BASE, personalityBlock, contextBlock]
    .filter(Boolean)
    .join("\n\n");

  // 4. Conversación en formato Gemini (historial + turno actual).
  const contents: GeminiContent[] = [
    ...(input.history ?? []).map((t) => ({
      role: (t.role === "assistant" ? "model" : "user") as GeminiContent["role"],
      parts: [{ text: t.content }],
    })),
    { role: "user", parts: [{ text: input.message }] },
  ];

  // 5. Bucle de razonamiento + ejecución de tools.
  const loop = await runGeminiLoop({ apiKey, system, contents, tools, ctx });

  return {
    reply: loop.reply,
    actions: loop.actions,
    pending: loop.pending,
    meta: {
      modules: intent.modules,
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
export interface RunNoaConfirmInput {
  userId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export async function runNoaConfirm(input: RunNoaConfirmInput): Promise<NoaResponse> {
  const supabase = await createClient();
  const ctx: NoaToolContext = {
    userId: input.userId,
    supabase,
    now: new Date(),
    locale: "es-ES",
  };

  const meta = {
    modules: [] as NoaModule[],
    usedTools: [input.toolName],
    iterations: 0,
  };
  const tool = registry.get(input.toolName);
  if (!tool || tool.kind === "read") {
    return { reply: "No reconozco esa acción.", actions: [], pending: [], meta };
  }

  const outcome = await runTool(tool, input.args, ctx);
  switch (outcome.status) {
    case "result":
      return { reply: "Hecho ✅", actions: [], pending: [], meta };
    case "action":
      return { reply: "Hecho ✅", actions: [outcome.action], pending: [], meta };
    case "error":
      return {
        reply: `No se pudo completar: ${outcome.message}`,
        actions: [],
        pending: [],
        meta,
      };
    default:
      return { reply: "…", actions: [], pending: [], meta };
  }
}
