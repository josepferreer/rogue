/**
 * Contexto EN VIVO — saneado y límites.
 *
 * El snapshot de la sesión en curso lo arma el móvil (`client/live-snapshot.ts`)
 * y llega en el cuerpo de la petición, así que es entrada NO confiable: podría
 * venir con 50.000 series, textos de un megabyte o números basura. Este fichero
 * es la aduana — todo lo que entre en `ctx.live` ha pasado por aquí.
 *
 * Es puro (sin Supabase, sin `server-only`): lo importa el servidor para
 * validar y el cliente para conocer los mismos topes al construirlo.
 */
import type {
  NoaLiveCardio,
  NoaLiveContext,
  NoaLiveExercise,
  NoaLiveFlag,
  NoaLiveSet,
  NoaLiveWorkout,
} from "@/lib/noa/types";

/** Topes duros. Generosos para un uso real, ridículos para un abuso. */
export const LIVE_LIMITS = {
  exercises: 40,
  setsPerExercise: 30,
  /** Muestras de la ruta. ~200 puntos bastan para ver alternancias de un
   *  minuto en una carrera de dos horas, y ocupan unos 4 KB. */
  samples: 220,
  text: 300,
} as const;

const FLAGS: readonly NoaLiveFlag[] = ["subir", "bajar", "ok"];

export function parseLiveContext(raw: unknown): NoaLiveContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as { workout?: unknown; cardio?: unknown };
  const workout = parseWorkout(src.workout);
  const cardio = parseCardio(src.cardio);
  if (!workout && !cardio) return undefined;
  return { ...(workout ? { workout } : {}), ...(cardio ? { cardio } : {}) };
}

function parseWorkout(raw: unknown): NoaLiveWorkout | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const w = raw as Record<string, unknown>;
  const dayLabel = text(w.dayLabel);
  if (!dayLabel) return undefined;

  const rawExercises = Array.isArray(w.exercises) ? w.exercises : [];
  const exercises: NoaLiveExercise[] = [];
  for (const item of rawExercises.slice(0, LIVE_LIMITS.exercises)) {
    const ex = parseExercise(item);
    if (ex) exercises.push(ex);
  }

  return {
    dayLabel,
    focus: text(w.focus) || undefined,
    elapsedSec: int(w.elapsedSec, 0, 0, 86_400),
    restRemainingSec: int(w.restRemainingSec, 0, 0, 3_600),
    exercises,
  };
}

function parseExercise(raw: unknown): NoaLiveExercise | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const e = raw as Record<string, unknown>;
  const exerciseId = text(e.exerciseId);
  if (!exerciseId) return undefined;

  const rawSets = Array.isArray(e.sets) ? e.sets : [];
  const sets: NoaLiveSet[] = rawSets
    .slice(0, LIVE_LIMITS.setsPerExercise)
    .map((s): NoaLiveSet => {
      const set = (s ?? {}) as Record<string, unknown>;
      return {
        reps: int(set.reps, 0, 0, 500),
        weightKg: round(clamp(number(set.weightKg), 0, 1_000), 2),
        done: set.done === true,
      };
    });

  const flag = FLAGS.find((f) => f === e.flag);
  return {
    exerciseId,
    name: text(e.name) || exerciseId,
    plannedSets: int(e.plannedSets, sets.length, 0, 50),
    plannedReps: int(e.plannedReps, 0, 0, 500),
    sets,
    ...(flag ? { flag } : {}),
    ...(text(e.note) ? { note: text(e.note) } : {}),
  };
}

function parseCardio(raw: unknown): NoaLiveCardio | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;

  const rawSamples = Array.isArray(c.samples) ? c.samples : [];
  const samples: [number, number][] = [];
  for (const item of rawSamples.slice(0, LIVE_LIMITS.samples)) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const tSec = number(item[0]);
    const km = number(item[1]);
    if (!Number.isFinite(tSec) || !Number.isFinite(km)) continue;
    // Monótona en ambos ejes: una muestra que retrocede es basura, no un dato.
    const prev = samples[samples.length - 1];
    if (prev && (tSec < prev[0] || km < prev[1])) continue;
    samples.push([round(clamp(tSec, 0, 86_400), 1), round(clamp(km, 0, 500), 4)]);
  }

  return {
    paused: c.paused === true,
    distanceKm: round(clamp(number(c.distanceKm), 0, 500), 3),
    durationSec: int(c.durationSec, 0, 0, 86_400),
    followingRoute: c.followingRoute === true,
    samples,
  };
}

// —— utilidades ——

function text(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, LIVE_LIMITS.text) : "";
}

function number(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(clamp(n, min, max));
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** ¿Hay algo realmente en marcha? Un snapshot vacío no debe abrir el módulo. */
export function hasLiveWorkout(live: NoaLiveContext | undefined): boolean {
  return Boolean(live?.workout && live.workout.exercises.length > 0);
}

export function hasLiveCardio(live: NoaLiveContext | undefined): boolean {
  return Boolean(live?.cardio);
}
