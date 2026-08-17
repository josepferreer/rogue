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
  /** Lo que está pasando AHORA MISMO (entreno abierto, ruta grabándose). */
  | "live"
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

/* ————————————————— Sesión EN CURSO (contexto en vivo) —————————————————
 *
 * Un entreno abierto en el mini-player y una ruta grabándose por GPS existen
 * SOLO en el cliente: sus datos no llegan a Supabase hasta que la sesión
 * termina (la ruta vuelca progreso cada 30 s, pero sin los segundos finales ni
 * el estado de pausa). Por eso el móvil adjunta este snapshot en cada turno:
 * sin él, preguntarle a NOA "¿cómo llevo el entreno?" a mitad de serie la
 * dejaba mirando el historial, es decir, respondiendo sobre AYER.
 *
 * Es entrada NO confiable (viene del cliente): el servidor la valida y la
 * recorta en `live/snapshot.ts` antes de que la vea ninguna tool.
 */

/** Marca rápida que el usuario pone a un ejercicio durante la sesión. */
export type NoaLiveFlag = "subir" | "bajar" | "ok";

/** Una serie del entreno en curso. `weightKg` SIEMPRE en kg (el cliente
 *  convierte desde la unidad de la sesión antes de mandarlo). */
export interface NoaLiveSet {
  reps: number;
  weightKg: number;
  done: boolean;
}

export interface NoaLiveExercise {
  exerciseId: string;
  /** Nombre legible, ya resuelto por el cliente (tiene el catálogo en memoria). */
  name: string;
  plannedSets: number;
  plannedReps: number;
  sets: NoaLiveSet[];
  /** Flag/nota que el usuario está poniendo AHORA (aún sin guardar). */
  flag?: NoaLiveFlag;
  note?: string;
}

export interface NoaLiveWorkout {
  dayLabel: string;
  focus?: string;
  /** Segundos desde que empezó (tiempo real, incluye descansos). */
  elapsedSec: number;
  /** Segundos que le quedan de descanso; 0 = no está descansando. */
  restRemainingSec: number;
  exercises: NoaLiveExercise[];
}

/**
 * Ruta en curso. NO lleva coordenadas a propósito: igual que el módulo cardio,
 * la polilínea es el dato más sensible del usuario (empieza y acaba en su casa)
 * y no hace falta para razonar sobre el ritmo. Lo que viaja es una serie
 * tiempo→distancia, de la que el servidor deriva velocidades y tramos.
 */
export interface NoaLiveCardio {
  paused: boolean;
  distanceKm: number;
  durationSec: number;
  /** Está siguiendo una ruta guardada (modo repetir). */
  followingRoute: boolean;
  /** Serie remuestreada a intervalo fijo: `[segundos, kmAcumulados]`. */
  samples: [number, number][];
}

export interface NoaLiveContext {
  workout?: NoaLiveWorkout;
  cardio?: NoaLiveCardio;
}

/**
 * Contexto que reciben los handlers de las tools de datos. `supabase` ya viene
 * autenticado con la sesión del usuario: cualquier query hereda su RLS, así que
 * una tool no puede leer datos de otro usuario aunque Gemini lo pidiera.
 */
export interface NoaToolContext {
  userId: string;
  supabase: SupabaseClient;
  now: Date;
  /**
   * Lo que el usuario tiene EN CURSO en el móvil ahora mismo (ver
   * `NoaLiveContext`). Solo lo sabe el cliente: un entreno abierto o una ruta
   * grabándose viven en sus stores y no están en Supabase hasta que terminan.
   * `undefined` = no hay nada en marcha (o el cliente no lo mandó).
   */
  live?: NoaLiveContext;
  /**
   * Día de HOY en la zona horaria del USUARIO (YYYY-MM-DD). Lo aporta el cliente
   * en la petición; si falta, el engine cae a la fecha del servidor. Úsalo para
   * cualquier "hoy" en vez de derivarlo de `now`: el servidor corre en UTC
   * (Vercel) y `now` daría el día equivocado de madrugada.
   */
  today: string;
  locale: string;
}

/**
 * Acción de cliente: canal "híbrido". El servidor la devuelve y el móvil la
 * ejecuta contra el store / router / Capacitor correcto. Es una LISTA BLANCA
 * cerrada y tipada: un `type` desconocido se ignora, nunca se ejecuta como
 * código. Versionada para poder evolucionarla sin romper historiales.
 */
export const CLIENT_ACTION_VERSION = 1 as const;

/**
 * Partes de la app que el cliente sabe recargar. Cuando NOA escribe en el
 * servidor, los stores del móvil no se enteran: sin esto, registrabas una
 * comida y el diario seguía enseñando los datos viejos hasta recargar la app.
 */
export type NoaRefetchScope = "nutrition" | "training" | "cardio" | "profile";

export type NoaClientAction =
  | { type: "navigate"; path: string }
  | { type: "refetch"; scope: NoaRefetchScope }
  | { type: "openModal"; modal: string; props?: Record<string, unknown> }
  | { type: "startWorkout"; routineDayId?: string }
  /** Cierra la sesion abierta en el mini-player y la guarda en el historial. */
  | { type: "finishWorkout" }
  /**
   * Registra un entreno YA hecho directamente en el historial, sin pasar por el
   * mini-player. Soporta dos formatos por ejercicio:
   * - Simple: sets + reps + weightKg (todas las series iguales).
   * - Detallado: setDetails[] con {reps, weightKg} por cada serie individual.
   */
  | {
      type: "logWorkout";
      dayLabel: string;
      exercises: {
        exerciseId: string;
        /** Usado si todas las series son iguales. */
        sets?: number;
        reps?: number;
        weightKg?: number;
        /** Usado cuando cada serie tiene peso/reps distintos. */
        setDetails?: { reps: number; weightKg: number }[];
      }[];
      durationSec?: number;
    }
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

  /**
   * Parte de la app a recargar tras ejecutar esta tool con éxito. Solo tiene
   * sentido en writes: el servidor ya ha cambiado los datos y el cliente debe
   * releerlos para que la pantalla no mienta.
   */
  refetch?: NoaRefetchScope;

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
