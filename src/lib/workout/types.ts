import type { ExerciseCategory } from "@/lib/exercises/types";

export type Sex = "hombre" | "mujer";

export type Profile = {
  onboarded: boolean;
  /** Identificador unico elegido al registrarse (login alternativo, no editable a cualquier valor: se valida formato y unicidad). */
  username: string;
  name: string;
  sex: Sex;
  bodyweightKg: number;
  heightCm: number;
  goal: string;
};

export type WeightUnit = "kg" | "lb";

/** Cual de los dos identificadores se muestra en saludos/cabeceras. */
export type DisplayNameSource = "name" | "username";

/** Ajustes del usuario (persisten junto al resto del estado). */
export type Preferences = {
  unit: WeightUnit;
  displayNameSource: DisplayNameSource;
  /** Recordatorio diario de la sesion que toca. */
  notifyReminders: boolean;
  /** Aviso (vibracion/notificacion) al terminar el descanso entre series. */
  notifyRestEnd: boolean;
  /** Resumen semanal de progreso. */
  notifyWeeklySummary: boolean;
};

/** Nombre o username segun la preferencia del usuario, con fallback. */
export function getDisplayName(profile: Profile, preferences: Preferences): string {
  const preferred =
    preferences.displayNameSource === "username" ? profile.username : profile.name;
  return preferred || profile.name || profile.username || "Atleta";
}

/** Un ejercicio dentro de un dia de rutina. */
export type RoutineExercise = {
  exerciseId: string;
  sets: number;
  reps: number;
  restSec: number;
  /** Peso sugerido de partida (kg); 0 = peso corporal. */
  suggestedKg: number;
};

export type RoutineDay = {
  id: string;
  label: string;
  focus: string;
  exercises: RoutineExercise[];
};

export type Routine = {
  name: string;
  days: RoutineDay[];
};

/** Una serie efectivamente registrada en una sesion. */
export type LoggedSet = {
  exerciseId: string;
  /** Categoria del ejercicio (para mostrar tags de historial), no la region de rango. */
  grupo: ExerciseCategory;
  weightKg: number;
  reps: number;
};

export type WorkoutSession = {
  id: string;
  dateISO: string;
  dayLabel: string;
  sets: LoggedSet[];
};
