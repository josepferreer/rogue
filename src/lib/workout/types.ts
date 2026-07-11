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
  /**
   * Dias de la semana en los que toca este entreno (convencion de
   * Date.getDay(): 0=domingo, 1=lunes ... 6=sabado). Vacio = sin dia fijo
   * (solo accesible como "entreno libre"). Un dia de la semana sin ningun
   * RoutineDay asignado es un dia de descanso.
   */
  weekdays: number[];
  exercises: RoutineExercise[];
};

export type Routine = {
  name: string;
  days: RoutineDay[];
};

/** Etiquetas de los dias de la semana en orden lunes->domingo (getDay()). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_LABELS: Record<number, string> = {
  0: "D",
  1: "L",
  2: "M",
  3: "X",
  4: "J",
  5: "V",
  6: "S",
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
  /** Duracion real de la sesion en segundos (inicio -> finalizar, incluye
   *  descansos y pausas). Opcional: sesiones antiguas pueden no tenerla. */
  durationSec?: number;
};
