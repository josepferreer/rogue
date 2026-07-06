import type { Exercise } from "./types";

/**
 * Stats de demo por ejercicio, deterministas a partir del id para que la
 * UI parezca viva sin backend. Se sustituiran por workout_logs de Supabase
 * cuando llegue el punto 3 del roadmap.
 */

function hashCode(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export type ExerciseSession = {
  fecha: string;
  series: number;
  reps: number;
  pesoKg: number;
  volumenKg: number;
};

export type ExerciseStats = {
  /** null cuando el ejercicio es de peso corporal sin lastre. */
  oneRmKg: number | null;
  mejorSerie: string;
  volumen4SemanasKg: number;
  sesiones30Dias: number;
  historial: ExerciseSession[];
};

/** Peso base "creible" segun el equipo del ejercicio. */
function baseWeight(exercise: Exercise, seed: number): number {
  switch (exercise.equipo) {
    case "barra":
      return 50 + (seed % 45);
    case "barra-z":
      return 25 + (seed % 20);
    case "mancuernas":
      return 12 + (seed % 18);
    case "maquina":
      return 40 + (seed % 40);
    case "polea":
      return 20 + (seed % 30);
    case "kettlebell":
      return 12 + (seed % 12);
    default:
      return 0;
  }
}

export function getMockExerciseStats(exercise: Exercise): ExerciseStats {
  const seed = hashCode(exercise.id);
  const bodyweight = exercise.equipo === "peso-corporal";
  const peso = baseWeight(exercise, seed);
  const reps = 6 + (seed % 6);

  const historial: ExerciseSession[] = Array.from({ length: 5 }, (_, i) => {
    const dayOffset = 2 + i * 4 + ((seed >> i) % 3);
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - dayOffset);
    const sesionPeso = bodyweight
      ? 0
      : Math.max(5, peso - i * 2 - ((seed >> (i + 2)) % 4));
    const sesionReps = reps + ((seed >> i) % 3);
    const series = 3 + ((seed >> (i + 1)) % 2);
    return {
      fecha: new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "short",
      }).format(fecha),
      series,
      reps: sesionReps,
      pesoKg: sesionPeso,
      volumenKg: bodyweight ? 0 : series * sesionReps * sesionPeso,
    };
  });

  // 1RM estimado con Epley: peso * (1 + reps / 30)
  const oneRmKg = bodyweight ? null : Math.round(peso * (1 + reps / 30));

  return {
    oneRmKg,
    mejorSerie: bodyweight
      ? `${reps + 4} reps`
      : `${peso} kg x ${reps}`,
    volumen4SemanasKg: historial.reduce((sum, s) => sum + s.volumenKg, 0),
    sesiones30Dias: historial.length,
    historial,
  };
}
