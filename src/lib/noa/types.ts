/**
 * NOA — tipos del núcleo Tool-First.
 *
 * NOA es el agente (vive en Rogue). Gemini es solo el motor de razonamiento:
 * recibe EXCLUSIVAMENTE `{ name, description, parameters }` de cada tool y los
 * resultados en JSON. Nunca ve Supabase, tablas, SQL, handlers ni módulos.
 *
 * Toda la lógica de negocio queda del lado de Rogue, detrás de las tools.
 *
 * Este fichero es seguro para cliente y servidor: solo importa TIPOS
 * (el import de SupabaseClient se borra en compilación). No metas aquí nada
 * que arrastre `next/headers`, `server-only` ni un cliente real.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Módulos de Rogue expuestos como conjuntos de herramientas. Añadir uno NO
 *  toca el núcleo: se registra en `modules/index.ts`. */
export type NoaModule =
  | "training"
  | "nutrition"
  | "cardio"
  | "heatmap"
  | "statistics"
  | "profile"
  | "calendar"
  | "notifications"
  | "library"
  | "settings";

/**
 * - `read`  → lee datos. Se autoejecuta en el servidor bajo la RLS del usuario.
 * - `write` → escribe datos. Pasa por la cola persistente (`SyncOp`) y, si es
 *             `confirm`, por el Action Gate antes de ejecutarse.
 * - `client-action` → no se ejecuta en el servidor: produce una acción tipada
 *             que ejecuta el móvil (abrir mini-player, GPS, navegar…).
 */
export type ToolKind = "read" | "write" | "client-action";

/** `confirm` ⇒ requiere un "sí" del usuario antes de ejecutar (writes y
 *  acciones de cliente con efecto). `safe` se ejecuta sin preguntar. */
export type ToolSensitivity = "safe" | "confirm";

/** JSON Schema laxo. Es lo único de la tool que ve Gemini (junto a name+desc). */
export type JsonSchema = Record<string, unknown>;

/**
 * Contexto que reciben los handlers de las tools de datos. `supabase` ya viene
 * autenticado con la sesión del usuario: cualquier query hereda su RLS, así que
 * una tool no puede leer datos de otro usuario aunque Gemini lo pidiera.
 */
export interface NoaToolContext {
  userId: string;
  supabase: SupabaseClient;
  now: Date;
  locale: string;
}

/**
 * Acción de cliente: canal "híbrido". El servidor la devuelve y el móvil la
 * ejecuta contra el store / router / Capacitor correcto. Es una LISTA BLANCA
 * cerrada y tipada: un `type` desconocido se ignora, nunca se ejecuta como
 * código. Versionada para poder evolucionarla sin romper historiales.
 */
export const CLIENT_ACTION_VERSION = 1 as const;

export type NoaClientAction =
  | { type: "navigate"; path: string }
  | { type: "openModal"; modal: string; props?: Record<string, unknown> }
  | { type: "startWorkout"; routineDayId?: string }
  | { type: "startCardio" }
  | {
      type: "scheduleLocalNotification";
      id: string;
      title: string;
      body: string;
      atISO: string;
    }
  | { type: "cancelLocalNotification"; id: string }
  | { type: "prefillForm"; form: string; values: Record<string, unknown> }
  | { type: "highlight"; target: string };

/**
 * Definición declarativa de una herramienta.
 *   - Campos "visibles": lo único que se serializa hacia Gemini.
 *   - Campos "internos": nunca salen del servidor.
 */
export interface ToolDef<
  Args extends Record<string, unknown> = Record<string, unknown>,
  Result = unknown,
> {
  // —— visible para Gemini ——
  name: string;
  description: string;
  /** JSON Schema de los argumentos que Gemini rellena. */
  parameters: JsonSchema;

  // —— solo NOA (nunca sale al modelo) ——
  module: NoaModule;
  kind: ToolKind;
  sensitivity: ToolSensitivity;
  /** Permisos requeridos; reservado para gating fino más adelante. */
  scopes?: string[];
  /** JSON Schema del resultado, para un contexto predecible. */
  returns?: JsonSchema;

  /** Data tools (`read`/`write`): ejecución en servidor. */
  handler?: (args: Args, ctx: NoaToolContext) => Promise<Result>;
  /** Client-action tools: traduce args → acción tipada para el móvil. */
  toAction?: (args: Args) => NoaClientAction;
  /**
   * Resumen legible para la tarjeta de confirmación (Action Gate). Si falta, se
   * usa `description`. Clave en writes destructivos: deja ver al usuario el
   * resultado exacto (p.ej. la rutina completa que se va a guardar).
   */
  summarize?: (args: Args) => string;
}

/** Un módulo autocontenido. Registrar uno nuevo es añadirlo a `ALL_MODULES`. */
export interface ToolModule {
  id: NoaModule;
  tools: ToolDef[];
  /** Palabras clave para el pre-filtro determinista del Intent Analyzer. */
  intentKeywords: string[];
  /** Precarga opcional de un snapshot compacto antes de llamar a Gemini. */
  contextProvider?: (ctx: NoaToolContext) => Promise<Record<string, unknown>>;
}

/** Acción propuesta que espera confirmación del usuario (Action Gate). */
export interface NoaProposedAction {
  id: string;
  toolName: string;
  /** Resumen en lenguaje natural para el usuario ("Voy a añadir…"). */
  summary: string;
  /** Args originales, para reejecutar la tool tras el "sí". */
  args: Record<string, unknown>;
  /** Presente si la tool es de cliente. */
  action?: NoaClientAction;
}

/** Respuesta del engine hacia la UI. Forma fija del canal híbrido. */
export interface NoaResponse {
  reply: string;
  /** Acciones a ejecutar YA en el móvil (safe). */
  actions: NoaClientAction[];
  /** Acciones que esperan confirmación. */
  pending: NoaProposedAction[];
  meta: {
    modules: NoaModule[];
    usedTools: string[];
    iterations: number;
    /** Falta la key de Gemini del usuario: la UI invita a Ajustes. */
    missingKey?: boolean;
  };
}

/** Un turno de la conversación tal como lo guarda/relee la UI. */
export interface NoaTurn {
  role: "user" | "assistant";
  content: string;
}
