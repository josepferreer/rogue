import { RANK_TIERS, type MuscleGroup, type RankId } from "./ranks";
import { MUSCLE_TO_GROUP, type MuscleId } from "./exercises/types";
import type { Sex, WorkoutSession } from "./workout/types";

/**
 * Motor de rangos POR MUSCULO. Cada musculo granular rankea de forma
 * independiente y de dos maneras segun como se entrene:
 *  - Modo fuerza: si tiene trabajo PRIMARIO con carga -> fuerza relativa
 *    (mejor 1RM estimado / peso corporal) vs estandares del musculo.
 *  - Modo volumen: si solo recibe trabajo secundario o de peso corporal ->
 *    volumen efectivo (series ponderadas por contribucion) en una ventana.
 * El trabajo secundario cuenta a media (0.4); un musculo sin trabajo primario
 * no puede alcanzar los rangos altos por si solo. El rango de grupo es el
 * promedio de sus musculos (solo para el resumen).
 *
 * Las tablas son una primera version SIN calibrar con datos reales.
 */

export const MIN_SESSIONS_TO_RANK = 2;
const SECONDARY_CONTRIB = 0.4;
const VOLUME_WINDOW_WEEKS = 6;
const VOLUME_WINDOW_MS = VOLUME_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000;

const ALL_MUSCLES = Object.keys(MUSCLE_TO_GROUP) as MuscleId[];

/** Info de un ejercicio necesaria para atribuir trabajo a cada musculo. */
export type ExerciseMuscles = {
  primarios: MuscleId[];
  secundarios: MuscleId[];
};
export type MuscleLookup = (exerciseId: string) => ExerciseMuscles | null;

/** 1RM estimado con Epley, capado a 12 reps (pierde fiabilidad por encima). */
export function estimate1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}

/** Ratio 1RM/peso corporal para entrar en cada tier (hombres), por musculo. */
const MUSCLE_BOUNDARIES: Record<MuscleId, number[]> = {
  pectoral: [0.4, 0.7, 1.0, 1.3, 1.6, 1.9],
  dorsal: [0.4, 0.7, 1.0, 1.3, 1.6, 1.9],
  "espalda-media": [0.4, 0.7, 1.0, 1.3, 1.6, 1.9],
  lumbar: [0.7, 1.1, 1.5, 1.9, 2.3, 2.7],
  trapecio: [0.5, 0.9, 1.3, 1.7, 2.1, 2.5],
  deltoide: [0.3, 0.45, 0.6, 0.75, 0.9, 1.05],
  biceps: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
  triceps: [0.25, 0.4, 0.55, 0.7, 0.85, 1.0],
  antebrazo: [0.15, 0.25, 0.35, 0.45, 0.55, 0.65],
  cuadriceps: [0.7, 1.1, 1.5, 1.9, 2.3, 2.7],
  isquiotibiales: [0.5, 0.9, 1.3, 1.7, 2.1, 2.5],
  gemelos: [0.8, 1.3, 1.8, 2.3, 2.8, 3.3],
  gluteo: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
  aductores: [0.3, 0.5, 0.7, 0.9, 1.1, 1.3],
  abductores: [0.3, 0.5, 0.7, 0.9, 1.1, 1.3],
  abdominales: [0.2, 0.35, 0.5, 0.65, 0.8, 0.95],
  oblicuos: [0.2, 0.35, 0.5, 0.65, 0.8, 0.95],
};

const MUSCLE_SEX_FACTOR: Record<MuscleId, number> = {
  pectoral: 0.68,
  dorsal: 0.68,
  "espalda-media": 0.68,
  lumbar: 0.72,
  trapecio: 0.68,
  deltoide: 0.68,
  biceps: 0.65,
  triceps: 0.65,
  antebrazo: 0.65,
  cuadriceps: 0.8,
  isquiotibiales: 0.8,
  gemelos: 0.85,
  gluteo: 0.85,
  aductores: 0.8,
  abductores: 0.8,
  abdominales: 0.7,
  oblicuos: 0.7,
};

/** Series efectivas semanales para entrar en cada tier (modo volumen). */
const VOLUME_BOUNDARIES = [1, 3, 6, 10, 14, 18];

export type RankValue = { tier: RankId; division: number; progress: number };

/** Mapea un valor a tier/division/progreso segun una tabla de umbrales. */
function rankFromValue(b: number[], v: number): RankValue {
  if (v < b[0]) return { tier: RANK_TIERS[0].id, division: 1, progress: 0 };
  if (v >= b[5]) {
    const top = RANK_TIERS[RANK_TIERS.length - 1];
    return { tier: top.id, division: top.divisions, progress: 100 };
  }
  let t = 0;
  for (let i = 0; i < 5; i++) if (v >= b[i]) t = i;
  const frac = Math.max(0, Math.min(0.9999, (v - b[t]) / (b[t + 1] - b[t])));
  const tier = RANK_TIERS[t];
  const division = Math.min(tier.divisions, Math.floor(frac * tier.divisions) + 1);
  const progress = Math.round((frac * tier.divisions - (division - 1)) * 100);
  return { tier: tier.id, division, progress };
}

/** Posicion global de un rango en la escala completa (0 = Bronce I, ~16 = tope). */
const CUMULATIVE = (() => {
  const cum: number[] = [];
  let acc = 0;
  for (const tier of RANK_TIERS) {
    cum.push(acc);
    acc += tier.divisions;
  }
  return { cum, total: acc };
})();

function rankToScale(value: RankValue): number {
  const i = RANK_TIERS.findIndex((t) => t.id === value.tier);
  return CUMULATIVE.cum[i] + (value.division - 1) + value.progress / 100;
}

function scaleToRank(scale: number): RankValue {
  const s = Math.max(0, Math.min(CUMULATIVE.total - 0.0001, scale));
  let i = 0;
  for (let k = 0; k < RANK_TIERS.length; k++) {
    if (s >= CUMULATIVE.cum[k]) i = k;
  }
  const tier = RANK_TIERS[i];
  const within = s - CUMULATIVE.cum[i];
  const division = Math.min(tier.divisions, Math.floor(within) + 1);
  const progress = Math.round((within - (division - 1)) * 100);
  return { tier: tier.id, division, progress };
}

/** Orden global de un rango, para comparar si sube o baja. */
export function rankScore(value: RankValue): number {
  return Math.round(rankToScale(value) * 1000);
}

export type ComputedMuscleRank =
  | { muscle: MuscleId; group: MuscleGroup; ranked: false; sessions: number }
  | ({
      muscle: MuscleId;
      group: MuscleGroup;
      ranked: true;
      mode: "fuerza" | "volumen";
      sessions: number;
    } & RankValue);

export function computeMuscleRanks(
  sessions: WorkoutSession[],
  bodyweightKg: number,
  sex: Sex,
  lookup: MuscleLookup,
): ComputedMuscleRank[] {
  const now = Date.now();

  return ALL_MUSCLES.map((muscle) => {
    const group = MUSCLE_TO_GROUP[muscle];
    let bestPrimary1RM = 0;
    let hasLoadedPrimary = false;
    let effectiveWindow = 0;
    const workSessions = new Set<string>();

    for (const session of sessions) {
      const recent = now - new Date(session.dateISO).getTime() <= VOLUME_WINDOW_MS;
      let contributed = false;

      for (const set of session.sets) {
        const info = lookup(set.exerciseId);
        if (!info) continue;
        const isPrimary = info.primarios.includes(muscle);
        const isSecondary = info.secundarios.includes(muscle);
        if (!isPrimary && !isSecondary) continue;

        contributed = true;
        const contrib = isPrimary ? 1 : SECONDARY_CONTRIB;
        if (recent) effectiveWindow += contrib;

        if (isPrimary && set.weightKg > 0) {
          hasLoadedPrimary = true;
          const oneRm = estimate1RM(set.weightKg, set.reps);
          if (oneRm > bestPrimary1RM) bestPrimary1RM = oneRm;
        }
      }

      if (contributed) workSessions.add(session.id);
    }

    const sessionsCount = workSessions.size;
    if (sessionsCount < MIN_SESSIONS_TO_RANK) {
      return { muscle, group, ranked: false, sessions: sessionsCount };
    }

    if (hasLoadedPrimary && bodyweightKg > 0) {
      const factor = sex === "hombre" ? 1 : MUSCLE_SEX_FACTOR[muscle];
      const boundaries = MUSCLE_BOUNDARIES[muscle].map((v) => v * factor);
      const rel = bestPrimary1RM / bodyweightKg;
      return {
        muscle,
        group,
        ranked: true,
        mode: "fuerza",
        sessions: sessionsCount,
        ...rankFromValue(boundaries, rel),
      };
    }

    const weekly = effectiveWindow / VOLUME_WINDOW_WEEKS;
    return {
      muscle,
      group,
      ranked: true,
      mode: "volumen",
      sessions: sessionsCount,
      ...rankFromValue(VOLUME_BOUNDARIES, weekly),
    };
  });
}

export type ComputedRank =
  | { muscle: MuscleGroup; ranked: false; sessions: number }
  | ({ muscle: MuscleGroup; ranked: true; sessions: number } & RankValue);

const GROUPS = Object.values(MUSCLE_TO_GROUP).filter(
  (g, i, arr) => arr.indexOf(g) === i,
) as MuscleGroup[];

/** Agrega los rangos de musculo a rango de grupo (promedio de la escala). */
export function aggregateToGroups(
  muscleRanks: ComputedMuscleRank[],
): ComputedRank[] {
  return GROUPS.map((group) => {
    const members = muscleRanks.filter((m) => m.group === group);
    const ranked = members.filter((m) => m.ranked) as Extract<
      ComputedMuscleRank,
      { ranked: true }
    >[];
    const sessions = members.reduce((max, m) => Math.max(max, m.sessions), 0);

    if (ranked.length === 0) {
      return { muscle: group, ranked: false, sessions };
    }

    const avgScale =
      ranked.reduce((sum, m) => sum + rankToScale(m), 0) / ranked.length;
    return {
      muscle: group,
      ranked: true,
      sessions,
      ...scaleToRank(avgScale),
    };
  });
}

/** Rangos de grupo (resumen), derivados de los rangos por musculo. */
export function computeRanks(
  sessions: WorkoutSession[],
  bodyweightKg: number,
  sex: Sex,
  lookup: MuscleLookup,
): ComputedRank[] {
  return aggregateToGroups(
    computeMuscleRanks(sessions, bodyweightKg, sex, lookup),
  );
}
