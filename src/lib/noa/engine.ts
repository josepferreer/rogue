import "server-only";
import type {
  NoaClientAction,
  NoaLiveContext,
  NoaModule,
  NoaRefetchScope,
  NoaResponse,
  NoaToolContext,
  NoaTurn,
} from "@/lib/noa/types";
import { hasLiveCardio, hasLiveWorkout } from "@/lib/noa/live/snapshot";
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

/**
 * Regla anti-alucinación. Va aparte de SYSTEM_BASE por lo específica que es:
 * el fallo que corrige es real y grave (ver `capabilityIndex`), no teórico.
 *
 * Sin esto, un turno cuyo módulo no entró en scope acababa con NOA diciendo
 * "¡hecho, ya lo tienes registrado!" sin haber llamado a nada.
 */
const SYSTEM_HONESTY = [
  "REGLA INVIOLABLE — nunca digas que has hecho algo si no lo has hecho:",
  "- Un cambio SOLO existe si has llamado a la herramienta correspondiente y el",
  "  usuario ha confirmado la tarjeta. Tu texto no guarda, no borra y no programa nada.",
  "- Prohibido responder «hecho», «ya está registrado», «lo he guardado» o similar",
  "  si en ese turno no hubo llamada a herramienta. Es el peor fallo posible: el",
  "  usuario se queda tranquilo creyendo que sus datos están a salvo y no lo están.",
  "- Si la herramienta que necesitas NO está entre las disponibles de este turno,",
  "  mira el INVENTARIO: si existe en otro módulo, dile al usuario que se lo repita",
  "  nombrando el tema (p. ej. «dímelo otra vez empezando por “entreno:”») para que",
  "  pueda cargarla. Si no existe en ningún módulo, di claramente que la app no sabe",
  "  hacer eso todavía y ofrece la alternativa manual.",
  "- Ante la duda, prefiere quedarte corto: es mejor un «no puedo» que una mentira.",
].join("\n");

/**
 * Inventario completo de capacidades. NOA debe conocer la app ENTERA aunque el
 * turno solo cargue unos módulos: así distingue "no puedo hacerlo aquí" (existe,
 * mal enrutado) de "la app no sabe hacer eso" (no existe).
 */
function renderCapabilityBlock(available: string[]): string {
  return [
    "INVENTARIO DE LA APP (todo lo que NOA sabe hacer, por módulo):",
    registry.capabilityIndex(),
    "",
    available.length > 0
      ? `HERRAMIENTAS DISPONIBLES ESTE TURNO (las únicas que puedes llamar ahora): ${available.join(", ")}`
      : "ESTE TURNO NO TIENES NINGUNA HERRAMIENTA DISPONIBLE: no puedes leer ni modificar datos. Responde solo con lo que sepas de la conversación y, si te piden algo de la app, pide al usuario que lo reformule nombrando el tema.",
  ].join("\n");
}

export interface RunNoaInput {
  userId: string;
  message: string;
  /** Historial de la conversación (sin el turno actual). */
  history?: NoaTurn[];
  /** Día de hoy en la tz del usuario (YYYY-MM-DD), aportado por el cliente. */
  clientToday?: string;
  clientNowISO?: string;
  /** Sesión en curso en el móvil (entreno abierto / ruta grabándose), ya
   *  saneada por la route. */
  live?: NoaLiveContext;
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

/**
 * Bloque con el instante actual del usuario para el system prompt.
 *
 * Sin esto el modelo NO recibia la hora por ningun lado (`ctx.today` solo lo
 * usan las tools internamente), asi que inventaba tanto la fecha como la hora:
 * un "avisame en 5 minutos" salia con una hora arbitraria. Se le da el ISO con
 * offset ya montado para que pueda copiar la zona horaria tal cual en los
 * `atISO` de los recordatorios.
 */
const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/**
 * Día de la semana de una fecha ISO. Se calcula del trozo YYYY-MM-DD y en UTC:
 * el día de la semana de una fecha de calendario es el mismo en cualquier zona,
 * y así no depende de en qué huso corra el servidor.
 */
function weekdayOf(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : DIAS_SEMANA[d.getUTCDay()];
}

function renderNowBlock(clientNowISO: string | undefined, fallback: Date): string {
  const iso = isValidLocalISO(clientNowISO) ? clientNowISO : fallback.toISOString();
  const dia = weekdayOf(iso);
  return [
    `MOMENTO ACTUAL DEL USUARIO: ${iso}`,
    // El día de la semana va DADO, no deducido. Un modelo no sabe convertir
    // fecha -> día fiablemente: con la misma fecha decía unas veces "martes" y
    // otras "lunes", y encima suena seguro al decirlo.
    ...(dia ? [`DÍA DE LA SEMANA: ${dia}`] : []),
    "Esa es la hora LOCAL del usuario, con su offset. Es tu única fuente de verdad para el tiempo:",
    "- Calcula siempre desde ahí lo relativo («en 5 minutos», «esta tarde», «mañana»).",
    "- Los `atISO` que generes van en esa misma hora local y con ese mismo offset.",
    "- El día de la semana es el de arriba: NO lo deduzcas de la fecha.",
    "- Nunca digas que no sabes qué hora es, ni la deduzcas de otra cosa.",
  ].join("\n");
}

/**
 * Módulos que impone tener algo EN CURSO.
 *
 * El Intent Analyzer mira lo que el usuario ESCRIBE, y a mitad de entreno se
 * escribe poquísimo: "¿voy bien?", "¿y ahora?", "¿subo?". Ninguna de esas
 * frases casa una palabra clave, así que el turno acababa en el router o en
 * conversación general y NOA respondía a ciegas teniendo la sesión delante.
 *
 * Con una sesión abierta, lo que está haciendo el usuario es mejor señal que lo
 * que teclea: se fuerza `live` y su módulo de dominio (para poder cruzar con el
 * historial), y se conserva lo que el intent hubiera acertado por su cuenta.
 */
function liveModules(live: NoaLiveContext | undefined): NoaModule[] {
  const out: NoaModule[] = [];
  if (hasLiveWorkout(live)) out.push("live", "training");
  if (hasLiveCardio(live)) {
    if (!out.includes("live")) out.push("live");
    out.push("cardio");
  }
  return out;
}

/**
 * Aviso en cabecera del system prompt. El contexto precargado ya lleva los
 * números, pero sin una instrucción explícita el modelo tiraba de
 * `getWorkoutHistory` —el pasado— para responder sobre el presente.
 */
function renderLiveBlock(live: NoaLiveContext | undefined): string {
  const lines: string[] = [];
  if (hasLiveWorkout(live)) {
    lines.push(
      `HAY UN ENTRENO EN CURSO ahora mismo («${live?.workout?.dayLabel}»), abierto en la app.`,
      "Para CUALQUIER pregunta sobre cómo va, qué le queda, si sube el peso o cómo",
      "compara con otras veces, llama a getActiveWorkout. Esa tool ya te trae el",
      "estado de hoy junto con lo que hizo la última vez en cada ejercicio, su",
      "récord y sus notas: no uses getWorkoutHistory para hablar del entreno de ahora.",
    );
  }
  if (hasLiveCardio(live)) {
    lines.push(
      "HAY UNA RUTA GRABÁNDOSE ahora mismo con el GPS.",
      "Para cualquier pregunta sobre el ritmo, la distancia, si va rápido o lento, o",
      "en qué tramos ha corrido y en cuáles ha andado, llama a getActiveCardio. Trae",
      "el análisis ya hecho (tramos, splits por km, tendencia y su ritmo habitual):",
      "no uses getCardioHistory para hablar de la ruta de ahora.",
    );
  }
  // Sin sesión abierta hay que decirlo: el INVENTARIO enseña getActiveWorkout y
  // getActiveCardio siempre, y sin esta línea NOA pedía al usuario que
  // reformulara la pregunta para "cargar" unas tools que no le servirían de nada.
  if (lines.length === 0) {
    return [
      "NO hay ninguna sesión en curso: ni entreno abierto ni ruta grabándose.",
      "getActiveWorkout y getActiveCardio no aplican en este turno; si te preguntan",
      "por «el entreno» o «la ruta» se refieren a los del historial.",
    ].join("\n");
  }
  lines.push(
    "El usuario está EN MEDIO de esto: responde corto y al grano, sin párrafos",
    "largos ni listas interminables. Si el análisis viene marcado como poco",
    "fiable o faltan datos, dilo en una línea en vez de rellenar.",
  );
  return lines.join("\n");
}

/** ISO 8601 con offset (2026-08-08T19:23:45+02:00) o en Z. */
function isValidLocalISO(v: string | undefined): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
    Number.isFinite(new Date(v).getTime())
  );
}

/** System prompt = reglas base + personalidad (solo forma) + contexto precargado
 *  de los módulos en scope. Si la personalidad falla al leerse, se usan valores
 *  por defecto: nunca bloquea la conversación. */
async function buildSystemPrompt(
  ctx: NoaToolContext,
  modules: NoaModule[],
  clientNowISO?: string,
): Promise<string> {
  const snapshot = await buildContext(registry, modules, ctx);
  const contextBlock = renderContextBlock(snapshot);
  const { personality, profileName } = await getUserPersonality(
    ctx.supabase,
    ctx.userId,
  );
  const personalityBlock = renderPersonalityBlock(personality, profileName);
  const nowBlock = renderNowBlock(clientNowISO, ctx.now);
  const capabilityBlock = renderCapabilityBlock(
    registry.select(modules).map((t) => t.name),
  );
  // Antes que el inventario: si el usuario está a mitad de serie o corriendo,
  // eso manda sobre cualquier otra cosa que pudiera responder.
  const liveBlock = renderLiveBlock(ctx.live);
  return [
    SYSTEM_BASE,
    SYSTEM_HONESTY,
    personalityBlock,
    nowBlock,
    liveBlock,
    capabilityBlock,
    contextBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
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
    live: input.live,
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
  //
  // Con una sesión en curso el router se salta: ya sabemos de qué habla el
  // usuario (lo tiene entre manos), y sería pagar una llamada para acertar
  // menos que la propia app.
  const forced = liveModules(input.live);
  const routed =
    intent.general && forced.length === 0
      ? await routeModules(input.message, registry.modules(), apiKey)
      : intent.modules;
  // `live` sin sesión abierta no aporta nada: sus tools solo sabrían decir
  // "no hay nada en curso", así que se cae del scope aunque el router la pida.
  // Los forzados van primero: si hay que recortar, lo que se cae es lo que el
  // intent adivinó, nunca lo que el usuario tiene entre manos. El tope sube a 5
  // (de los 4 del analyzer) para que la sesión en curso no desplace al dominio
  // que el mensaje sí acertó.
  const modules = [...new Set([...forced, ...routed])]
    .filter((m) => m !== "live" || forced.includes("live"))
    .slice(0, 5);
  const tools = registry.select(modules);

  // 3. System prompt: reglas base + personalidad (solo forma) + contexto
  // precargado de los módulos en scope.
  const system = await buildSystemPrompt(ctx, modules, input.clientNowISO);

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
  clientNowISO?: string;
  /** Sesión en curso, para que el turno reanudado siga sabiendo qué pasa. */
  live?: NoaLiveContext;
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
    live: input.live,
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

  // Con sesión en curso, el turno reanudado conserva las tools del directo:
  // tras confirmar algo a mitad de entreno, lo siguiente que pregunte el
  // usuario sigue siendo sobre lo que tiene abierto.
  const scopeModules = [...new Set([...modules, ...liveModules(input.live)])];

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

  const system = await buildSystemPrompt(ctx, scopeModules, input.clientNowISO);
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
