"use client";

import { toKg } from "@/lib/units";
import { haversineM } from "@/lib/cardio/clean-trace";
import { LIVE_LIMITS } from "@/lib/noa/live/snapshot";
import type { Coordinate } from "@/lib/store/cardio-store";
import type {
  NoaLiveCardio,
  NoaLiveContext,
  NoaLiveExercise,
  NoaLiveFlag,
  NoaLiveWorkout,
} from "@/lib/noa/types";
import type {
  ExerciseNoteFlag,
  RoutineDay,
  WeightUnit,
} from "@/lib/workout/types";
import type { NoteDraft, SetState } from "@/lib/store/workout-session-store";

/**
 * Snapshot de la sesión EN CURSO que el móvil adjunta a cada turno de NOA.
 *
 * Un entreno abierto y una ruta grabándose viven solo en los stores del
 * cliente: el servidor no los ve hasta que terminan. Sin esto, preguntarle a
 * NOA a mitad de entreno la dejaba respondiendo desde el historial, o sea,
 * sobre lo de la semana pasada.
 *
 * Dos reglas de las que no se sale:
 *  - Los pesos van SIEMPRE en kg (se convierten desde la unidad de la sesión).
 *  - No viajan coordenadas. De la ruta sale una serie tiempo→distancia, que es
 *    lo único que hace falta para razonar sobre el ritmo; la traza es el dato
 *    más sensible del usuario y se queda en el dispositivo (misma decisión que
 *    en el módulo `cardio`).
 */

/** Estado del entreno tal como lo expone `useWorkoutSession`. */
export interface LiveWorkoutInput {
  active: boolean;
  phase: "active" | "done";
  day: RoutineDay | null;
  rows: Record<string, SetState[]>;
  unit: WeightUnit;
  elapsedSec: number;
  restRemaining: number;
  noteDrafts: Record<string, NoteDraft>;
}

/** Estado del cardio tal como lo expone `useCardio`. */
export interface LiveCardioInput {
  isTracking: boolean;
  isPaused: boolean;
  distanceKm: number;
  durationSec: number;
  coordinates: Coordinate[];
  followRoute: Coordinate[];
}

export function buildLiveContext(input: {
  workout: LiveWorkoutInput;
  cardio: LiveCardioInput;
  /** Nombre legible del ejercicio (el cliente tiene el catálogo en memoria). */
  exerciseName: (exerciseId: string) => string;
}): NoaLiveContext | undefined {
  const workout = buildWorkout(input.workout, input.exerciseName);
  const cardio = buildCardio(input.cardio);
  if (!workout && !cardio) return undefined;
  return { ...(workout ? { workout } : {}), ...(cardio ? { cardio } : {}) };
}

function buildWorkout(
  w: LiveWorkoutInput,
  exerciseName: (id: string) => string,
): NoaLiveWorkout | undefined {
  // `phase === "done"` es la pantalla de resumen: el entreno ya está guardado y
  // vive en el historial, así que dejaría de ser "en curso".
  if (!w.active || w.phase !== "active" || !w.day) return undefined;

  const exercises: NoaLiveExercise[] = w.day.exercises
    .slice(0, LIVE_LIMITS.exercises)
    .map((ex) => {
      const rows = (w.rows[ex.exerciseId] ?? []).slice(0, LIVE_LIMITS.setsPerExercise);
      const draft = w.noteDrafts[ex.exerciseId];
      return {
        exerciseId: ex.exerciseId,
        name: exerciseName(ex.exerciseId),
        plannedSets: ex.sets,
        plannedReps: ex.reps,
        sets: rows.map((s) => ({
          reps: Math.round(Number(s.reps) || 0),
          // Los números de `rows` están escritos en la unidad ACTIVA de la
          // sesión, no en la preferencia actual: convertir con otra cosa
          // mandaría 100 lb como si fueran 100 kg.
          weightKg: round(toKg(Number(s.weight) || 0, w.unit), 2),
          done: s.done,
        })),
        ...(draft?.flag ? { flag: toLiveFlag(draft.flag) } : {}),
        ...(draft?.text.trim() ? { note: draft.text.trim().slice(0, LIVE_LIMITS.text) } : {}),
      };
    });

  return {
    dayLabel: w.day.label,
    focus: w.day.focus || undefined,
    elapsedSec: Math.round(w.elapsedSec),
    restRemainingSec: Math.round(w.restRemaining),
    exercises,
  };
}

function toLiveFlag(flag: ExerciseNoteFlag): NoaLiveFlag {
  return flag;
}

function buildCardio(c: LiveCardioInput): NoaLiveCardio | undefined {
  if (!c.isTracking) return undefined;
  return {
    paused: c.isPaused,
    distanceKm: round(c.distanceKm, 3),
    durationSec: Math.round(c.durationSec),
    followingRoute: c.followRoute.length > 0,
    samples: buildSamples(c.coordinates),
  };
}

/**
 * Velocidad imposible a pie (28,8 km/h): un tramo así es un salto del sensor,
 * no movimiento. Mismos umbrales que `cleanTrace` y que el propio store, para
 * que la distancia de las muestras no se separe de la que ve el usuario.
 */
const MAX_SPEED_MPS = 8;
const MAX_JUMP_M = 80;

/**
 * Un hueco mayor que esto no es estar parado: es una pausa, un túnel o la app
 * suspendida. El tramo se salta ENTERO —ni su tiempo ni su distancia—, que es
 * lo único coherente:
 *  - Contando el tiempo, media hora de parón en un bar salía como "parado
 *    30 min" y hundía el ritmo medio de la ruta.
 *  - Contando solo la distancia (lo que hacía antes), reaparecer 500 m más
 *    allá metía medio kilómetro con cero segundos: el ritmo se disparaba. Con
 *    una pausa de 20 min, 11 km/h reales salían como 16,5.
 *
 * Efecto secundario asumido: los km de la serie pueden quedar por debajo de
 * `distanceKm`. No importa — la distancia que se enseña al usuario va aparte y
 * es la del store; esta serie existe solo para razonar sobre el RITMO.
 */
const GAP_SEC = 90;

/** Nunca menos de 5 s entre muestras: por debajo solo se muestrea ruido GPS. */
const MIN_STEP_SEC = 5;

/**
 * Coordenadas → serie `[segundos, kmAcumulados]` remuestreada a intervalo fijo.
 * El intervalo se estira con la duración para no pasar del tope de muestras:
 * una carrera de dos horas viaja con la misma resolución relativa que una de
 * veinte minutos, y en ambos casos ocupa unos pocos KB.
 */
function buildSamples(coordinates: Coordinate[]): [number, number][] {
  if (coordinates.length < 2) return [];

  // 1. Acumulado real, descartando saltos y sin contar el tiempo de las pausas.
  const pts: { t: number; km: number }[] = [];
  let km = 0;
  let t = 0;
  let last: Coordinate | null = null;
  for (const cur of coordinates) {
    if (!last) {
      last = cur;
      pts.push({ t: 0, km: 0 });
      continue;
    }
    const distM = haversineM(last, cur);
    const dtSec = (cur.timestamp - last.timestamp) / 1000;
    // Un punto sin coordenadas o sin timestamp válidos envenena el acumulado
    // (todo lo que venga después sale NaN). Se descarta y no se avanza.
    if (!Number.isFinite(distM) || !Number.isFinite(dtSec)) continue;
    const outlier = dtSec > 0 ? distM / dtSec > MAX_SPEED_MPS : distM > MAX_JUMP_M;
    if (outlier) continue; // el punto no avanza ni distancia ni tiempo
    // Hueco: se reengancha en el punto nuevo sin contar nada del tramo.
    if (dtSec > GAP_SEC || dtSec < 0) {
      last = cur;
      continue;
    }
    t += dtSec;
    km += distM / 1000;
    last = cur;
    pts.push({ t: round(t, 1), km: round(km, 4) });
  }

  const total = pts[pts.length - 1]?.t ?? 0;
  if (pts.length < 2 || !Number.isFinite(total) || total <= 0) return [];

  // 2. Rejilla uniforme, interpolando el acumulado en cada corte.
  const step = Math.max(MIN_STEP_SEC, Math.ceil(total / (LIVE_LIMITS.samples - 1)));
  const out: [number, number][] = [];
  let i = 0;
  for (let time = 0; time <= total; time += step) {
    while (i < pts.length - 2 && pts[i + 1].t < time) i++;
    const a = pts[i];
    const b = pts[i + 1] ?? a;
    const span = b.t - a.t;
    const ratio = span > 0 ? Math.min(1, Math.max(0, (time - a.t) / span)) : 0;
    out.push([round(time, 1), round(a.km + (b.km - a.km) * ratio, 4)]);
  }
  // El último punto real siempre entra: es donde está el usuario ahora mismo, y
  // es justo el tramo por el que pregunta ("¿cómo voy AHORA?").
  const lastPt = pts[pts.length - 1];
  if (out.length > 0 && out[out.length - 1][0] < lastPt.t) {
    out.push([round(lastPt.t, 1), lastPt.km]);
  }
  return out;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
