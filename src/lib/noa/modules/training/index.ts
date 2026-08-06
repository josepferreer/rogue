import "server-only";
import type { NoaToolContext, ToolDef, ToolModule } from "@/lib/noa/types";
import { getExercises } from "@/lib/exercises/repo";
import { EXERCISE_CATEGORIES } from "@/lib/exercises/types";
import { WEEKDAY_LABELS } from "@/lib/workout/types";

/**
 * Módulo TRAINING — entrenamientos.
 *
 * Lectura:  getWorkoutHistory, getTrainingSummary, getRoutine, searchExercise
 * Cliente:  startWorkout (abre el mini-player)
 * Escritura: saveRoutine (vía rpc `save_routine`, con confirmación)
 *
 * `save_routine` REEMPLAZA la rutina semanal entera de forma atómica, así que
 * `saveRoutine` recibe el estado completo de días. Para modificaciones
 * incrementales NOA debe llamar antes a `getRoutine` y reenviar los días que
 * quiera conservar; el Action Gate enseña el resultado antes de guardar.
 */

const getWorkoutHistory: ToolDef = {
  name: "getWorkoutHistory",
  description:
    "Devuelve las últimas sesiones de entrenamiento del usuario (fecha, día y duración). Úsala para preguntas sobre entrenos recientes o adherencia.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Cuántas sesiones devolver (por defecto 10, máx. 50).",
      },
    },
  },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const limit = clampInt(args.limit, 10, 1, 50);
    const { data, error } = await ctx.supabase
      .from("workout_sessions")
      .select("id, day_label, date, duration_sec")
      .order("date", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { sessions: data ?? [] };
  },
};

const getTrainingSummary: ToolDef = {
  name: "getTrainingSummary",
  description:
    "Resumen agregado de entrenamiento (volumen, frecuencia, etc.) calculado en Postgres. Úsala para progreso general, no para una sesión concreta.",
  parameters: { type: "object", properties: {} },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(_args, ctx: NoaToolContext) {
    const { data, error } = await ctx.supabase.rpc("workout_stats");
    if (error) throw new Error(error.message);
    return { summary: data };
  },
};

const getRoutine: ToolDef = {
  name: "getRoutine",
  description:
    "Devuelve la rutina semanal actual del usuario: sus días (con etiqueta, foco, días de la semana) y los ejercicios de cada uno. Llámala SIEMPRE antes de modificar la rutina, para no borrar días existentes.",
  parameters: { type: "object", properties: {} },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(_args, ctx: NoaToolContext) {
    const { data: routines, error: rErr } = await ctx.supabase
      .from("routines")
      .select("id, name")
      .order("created_at")
      .limit(1);
    if (rErr) throw new Error(rErr.message);
    const routine = routines?.[0];
    if (!routine) return { routine: null };

    const { data: days, error: dErr } = await ctx.supabase
      .from("routine_days")
      .select("id, label, focus, weekdays, position")
      .eq("routine_id", routine.id)
      .order("position");
    if (dErr) throw new Error(dErr.message);

    const dayIds = (days ?? []).map((d) => d.id as string);
    const { data: exs, error: eErr } = dayIds.length
      ? await ctx.supabase
          .from("routine_exercises")
          .select("routine_day_id, exercise_id, sets, reps, rest_sec, suggested_kg, position")
          .in("routine_day_id", dayIds)
          .order("position")
      : { data: [], error: null };
    if (eErr) throw new Error(eErr.message);

    const byDay = new Map<string, unknown[]>();
    for (const e of exs ?? []) {
      const list = byDay.get(e.routine_day_id as string) ?? [];
      list.push({
        exerciseId: e.exercise_id,
        sets: e.sets,
        reps: e.reps,
        restSec: e.rest_sec,
        suggestedKg: e.suggested_kg,
      });
      byDay.set(e.routine_day_id as string, list);
    }

    return {
      routine: {
        routineId: routine.id,
        name: routine.name,
        days: (days ?? []).map((d) => ({
          id: d.id,
          label: d.label,
          focus: d.focus,
          weekdays: d.weekdays,
          exercises: byDay.get(d.id as string) ?? [],
        })),
      },
    };
  },
};

const searchExercise: ToolDef = {
  name: "searchExercise",
  description:
    "Busca ejercicios en el catálogo por nombre y/o grupo muscular. Devuelve sus identificadores reales (id), necesarios para añadirlos a una rutina. Úsala para resolver nombres antes de guardar.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Texto a buscar en el nombre." },
      grupo: {
        type: "string",
        enum: [...EXERCISE_CATEGORIES],
        description: "Filtra por grupo muscular.",
      },
      limit: { type: "integer", description: "Máximo de resultados (def. 8)." },
    },
  },
  module: "training",
  kind: "read",
  sensitivity: "safe",
  async handler(args) {
    const grupo =
      typeof args.grupo === "string" &&
      (EXERCISE_CATEGORIES as readonly string[]).includes(args.grupo)
        ? (args.grupo as (typeof EXERCISE_CATEGORIES)[number])
        : undefined;
    const query = typeof args.query === "string" ? args.query : undefined;
    const limit = clampInt(args.limit, 8, 1, 20);

    const list = await getExercises({ query, grupo });
    return {
      exercises: list.slice(0, limit).map((e) => ({
        id: e.id,
        nombre: e.nombre,
        grupo: e.grupo,
        equipo: e.equipo,
        dificultad: e.dificultad,
        mecanica: e.mecanica,
      })),
    };
  },
};

const startWorkout: ToolDef = {
  name: "startWorkout",
  description:
    "Inicia una sesión de entrenamiento en la app (abre el mini-player). Opcionalmente para un día de rutina concreto.",
  parameters: {
    type: "object",
    properties: {
      routineDayId: {
        type: "string",
        description: "Id del día de rutina a iniciar; omítelo para entreno libre.",
      },
    },
  },
  module: "training",
  kind: "client-action",
  sensitivity: "confirm",
  toAction(args) {
    return {
      type: "startWorkout",
      routineDayId:
        typeof args.routineDayId === "string" ? args.routineDayId : undefined,
    };
  },
};

/** Forma de un día tal como lo espera `save_routine` (y esta tool). */
interface RoutineDayInput {
  id?: string;
  label: string;
  focus?: string;
  weekdays: number[];
  exercises: {
    exerciseId: string;
    sets?: number;
    reps?: number;
    restSec?: number;
    suggestedKg?: number;
  }[];
}

const saveRoutine: ToolDef = {
  name: "saveRoutine",
  description:
    "Guarda la rutina semanal COMPLETA (la reemplaza entera). Cada día lleva label, focus, weekdays (0=domingo … 6=sábado) y exercises con exerciseId (de searchExercise). Para modificar sin perder días, llama antes a getRoutine e incluye TODOS los días que quieras conservar.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nombre de la rutina (opcional)." },
      days: {
        type: "array",
        description: "Días de la semana con sus ejercicios.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Nombre del día (p.ej. «Empuje»)." },
            focus: { type: "string", description: "Foco (p.ej. «Pecho y tríceps»)." },
            weekdays: {
              type: "array",
              items: { type: "integer" },
              description: "Días de la semana (0=domingo … 6=sábado).",
            },
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  exerciseId: { type: "string" },
                  sets: { type: "integer" },
                  reps: { type: "integer" },
                  restSec: { type: "integer" },
                  suggestedKg: { type: "number" },
                },
                required: ["exerciseId"],
              },
            },
          },
          required: ["label", "weekdays", "exercises"],
        },
      },
    },
    required: ["days"],
  },
  module: "training",
  kind: "write",
  sensitivity: "confirm",
  summarize(args) {
    const days = Array.isArray(args.days) ? (args.days as RoutineDayInput[]) : [];
    const lines = days.map((d) => {
      const wd = (d.weekdays ?? []).map((n) => WEEKDAY_LABELS[n] ?? "?").join("");
      const n = d.exercises?.length ?? 0;
      return `• ${wd || "sin día"} · ${d.label} (${n} ej.)`;
    });
    return `Guardar tu rutina con ${days.length} día(s):\n${lines.join("\n")}`;
  },
  async handler(args, ctx: NoaToolContext) {
    if (!Array.isArray(args.days)) throw new Error("Faltan los días de la rutina.");
    const name = typeof args.name === "string" ? args.name : null;
    const { data, error } = await ctx.supabase.rpc("save_routine", {
      p_routine_id: null,
      p_name: name,
      p_days: args.days,
    });
    if (error) throw new Error(error.message);
    return { saved: true, result: data };
  },
};

/** Snapshot compacto para el Context Builder cuando el turno es de training. */
async function contextProvider(ctx: NoaToolContext) {
  const { data } = await ctx.supabase
    .from("workout_sessions")
    .select("day_label, date")
    .order("date", { ascending: false })
    .limit(1);
  return { training: { ultimaSesion: data?.[0] ?? null } };
}

export const trainingModule: ToolModule = {
  id: "training",
  tools: [
    getWorkoutHistory,
    getTrainingSummary,
    getRoutine,
    searchExercise,
    startWorkout,
    saveRoutine,
  ],
  intentKeywords: [
    "entreno",
    "entrenar",
    "entrenamiento",
    "rutina",
    "ejercicio",
    "serie",
    "series",
    "repeticion",
    "pecho",
    "espalda",
    "pierna",
    "biceps",
    "triceps",
    "hombro",
    "gym",
  ],
  contextProvider,
};

/** Entero acotado con valor por defecto, para args que vienen de Gemini. */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
