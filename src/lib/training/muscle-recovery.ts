/**
 * Recuperacion muscular: cuanto hace que trabajaste cada musculo y si ya esta
 * listo para volver a darle.
 *
 * MODELO: dias (horas, en realidad) desde la ultima vez. Nada de estimar fatiga
 * por volumen o intensidad: esos coeficientes habria que inventarselos, y
 * acabarian dando recomendaciones que el usuario no se cree. Aqui todo lo que
 * sale se puede explicar con una frase: "hace 40 h que no tocas dorsal y le
 * pones 72". Los umbrales son EDITABLES desde ajustes, que es lo que convierte
 * un numero inventado por mi en un numero tuyo.
 *
 * De donde salen los musculos: la serie guardada solo trae `exerciseId` y el
 * grupo grueso (Pecho, Espalda...). Los 17 musculos finos salen de cruzar ese
 * id con el catalogo (`musculosPrimarios` / `musculosSecundarios`). O sea que
 * NO hace falta tocar la base de datos: el historial que ya tienes vale.
 *
 * OJO: esto no resucita el sistema de rangos musculares que se borro el
 * 05/08/2026 (ver CONTEXT.md). No hay tiers, ni divisiones, ni MUSCLE_TO_GROUP:
 * solo fechas y el catalogo de ejercicios.
 */

import { MUSCLE_LABELS, type MuscleId } from "@/lib/exercises/types";
import type { WorkoutSession } from "@/lib/workout/types";

/**
 * Horas de descanso por defecto, por tamano del musculo. Son un punto de
 * partida razonable, no una verdad: el usuario los ajusta.
 */
export const DEFAULT_RECOVERY_HOURS: Record<MuscleId, number> = {
  // Grandes: mueven mucha carga y tardan mas en recuperarse.
  pectoral: 72,
  dorsal: 72,
  "espalda-media": 72,
  cuadriceps: 72,
  isquiotibiales: 72,
  gluteo: 72,
  // Medianos.
  deltoide: 48,
  trapecio: 48,
  lumbar: 48,
  aductores: 48,
  abductores: 48,
  abdominales: 48,
  oblicuos: 48,
  // Pequenos: aguantan mas frecuencia.
  biceps: 36,
  triceps: 36,
  antebrazo: 36,
  gemelos: 36,
};

/**
 * Lo que cuenta un musculo trabajado como SECUNDARIO frente a uno primario.
 * El press de banca castiga el triceps, pero no como un dia de triceps: pide
 * la mitad de descanso. Es el unico coeficiente del modulo, y esta aqui suelto
 * a proposito para que se vea.
 */
const SECONDARY_FACTOR = 0.5;

export type MuscleState = "listo" | "casi" | "descansando";

export type MuscleRecovery = {
  muscle: MuscleId;
  label: string;
  /** Ultima vez que se trabajo (como primario o secundario). null = nunca. */
  lastTrainedISO: string | null;
  /** Horas transcurridas desde `lastTrainedISO`. null si nunca. */
  hoursSince: number | null;
  /** Horas de descanso configuradas para este musculo. */
  recoveryHours: number;
  /** Horas que faltan para estar listo. 0 si ya lo esta. */
  hoursLeft: number;
  /** 0..1 de recuperacion. 1 = listo (nunca entrenado tambien es 1). */
  ratio: number;
  state: MuscleState;
  /** Series que lo trabajaron la ultima vez que se toco. */
  setsLastTime: number;
  /** La ultima vez fue solo como musculo secundario. */
  lastWasSecondaryOnly: boolean;
};

/** Devuelve los musculos de un ejercicio; el catalogo lo inyecta quien llama. */
export type ExerciseMuscles = (exerciseId: string) => {
  primary: MuscleId[];
  secondary: MuscleId[];
};

const MS_PER_HOUR = 3_600_000;

/** Por debajo de esto queda poco: se muestra como "casi listo". */
const ALMOST_RATIO = 0.75;

export function computeMuscleRecovery(
  sessions: WorkoutSession[],
  musclesOf: ExerciseMuscles,
  options: {
    /** Ahora, en ms. Se inyecta para poder testear y para no romper SSR. */
    now: number;
    /** Umbrales del usuario; lo que falte cae a DEFAULT_RECOVERY_HOURS. */
    recoveryHours?: Partial<Record<MuscleId, number>>;
  },
): MuscleRecovery[] {
  const { now, recoveryHours } = options;

  /** Ultimo estimulo de cada musculo, separando primario de secundario. */
  const ultimo = new Map<
    MuscleId,
    { primaryMs: number | null; secondaryMs: number | null; sets: number; ms: number }
  >();

  for (const session of sessions) {
    const ms = new Date(session.dateISO).getTime();
    if (!Number.isFinite(ms)) continue; // fecha corrupta: la sesion no cuenta

    // Series que tocan cada musculo EN ESTA sesion.
    const seriesPorMusculo = new Map<MuscleId, { sets: number; primary: boolean }>();
    for (const set of session.sets) {
      const { primary, secondary } = musclesOf(set.exerciseId);
      for (const m of primary) {
        const prev = seriesPorMusculo.get(m);
        seriesPorMusculo.set(m, { sets: (prev?.sets ?? 0) + 1, primary: true });
      }
      for (const m of secondary) {
        const prev = seriesPorMusculo.get(m);
        seriesPorMusculo.set(m, {
          sets: (prev?.sets ?? 0) + 1,
          primary: prev?.primary ?? false,
        });
      }
    }

    for (const [m, info] of seriesPorMusculo) {
      const prev = ultimo.get(m);
      const primaryMs = info.primary
        ? Math.max(prev?.primaryMs ?? -Infinity, ms)
        : (prev?.primaryMs ?? null);
      const secondaryMs = !info.primary
        ? Math.max(prev?.secondaryMs ?? -Infinity, ms)
        : (prev?.secondaryMs ?? null);
      // `sets` y `ms` describen la sesion MAS RECIENTE que toco el musculo.
      const esMasReciente = !prev || ms >= prev.ms;
      ultimo.set(m, {
        primaryMs: Number.isFinite(primaryMs) ? primaryMs : null,
        secondaryMs: Number.isFinite(secondaryMs) ? secondaryMs : null,
        sets: esMasReciente ? info.sets : prev.sets,
        ms: esMasReciente ? ms : prev.ms,
      });
    }
  }

  return (Object.keys(DEFAULT_RECOVERY_HOURS) as MuscleId[])
    .map((muscle) => {
      const horas = recoveryHours?.[muscle] ?? DEFAULT_RECOVERY_HOURS[muscle];
      const reg = ultimo.get(muscle);

      if (!reg || (reg.primaryMs === null && reg.secondaryMs === null)) {
        return {
          muscle,
          label: MUSCLE_LABELS[muscle],
          lastTrainedISO: null,
          hoursSince: null,
          recoveryHours: horas,
          hoursLeft: 0,
          ratio: 1,
          state: "listo" as MuscleState,
          setsLastTime: 0,
          lastWasSecondaryOnly: false,
        };
      }

      // Cada estimulo tiene su propio "listo a partir de": el secundario pide
      // menos. Manda el que termine mas tarde.
      const listoPrimario =
        reg.primaryMs !== null ? reg.primaryMs + horas * MS_PER_HOUR : -Infinity;
      const listoSecundario =
        reg.secondaryMs !== null
          ? reg.secondaryMs + horas * SECONDARY_FACTOR * MS_PER_HOUR
          : -Infinity;
      const listoEn = Math.max(listoPrimario, listoSecundario);

      const ultimoMs = Math.max(reg.primaryMs ?? -Infinity, reg.secondaryMs ?? -Infinity);
      const hoursSince = (now - ultimoMs) / MS_PER_HOUR;
      const hoursLeft = Math.max(0, (listoEn - now) / MS_PER_HOUR);
      // El total de espera para ESTE estimulo, para que el ratio sea honesto.
      const esperaTotal = Math.max(1 / 60, (listoEn - ultimoMs) / MS_PER_HOUR);
      const ratio = Math.max(0, Math.min(1, 1 - hoursLeft / esperaTotal));

      return {
        muscle,
        label: MUSCLE_LABELS[muscle],
        lastTrainedISO: new Date(ultimoMs).toISOString(),
        hoursSince: Math.max(0, hoursSince),
        recoveryHours: horas,
        hoursLeft,
        ratio,
        state: (ratio >= 1 ? "listo" : ratio >= ALMOST_RATIO ? "casi" : "descansando") as MuscleState,
        setsLastTime: reg.sets,
        lastWasSecondaryOnly: reg.primaryMs === null,
      };
    })
    .sort((a, b) => a.ratio - b.ratio || a.label.localeCompare(b.label));
}
