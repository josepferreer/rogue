import type { MuscleGroup } from "@/lib/ranks";
import exercisesData from "@/data/exercises.es.json";
import type {
  DifficultyId,
  EquipmentId,
  Exercise,
  ExerciseFilters,
} from "./types";

/**
 * Fachada de acceso a datos de ejercicios.
 *
 * Hoy lee del dataset local (modo demo). Cuando haya credenciales de
 * Supabase, estas funciones pasaran a consultar la tabla `exercises`
 * sin que la UI cambie (misma firma async).
 */

const EXERCISES = exercisesData as Exercise[];

/** Base de las imagenes de free-exercise-db (dominio publico). */
export const EXERCISE_IMG_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

/** URLs de los 2 frames (inicio/fin del movimiento) de un ejercicio. */
export function getExerciseImages(exercise: Exercise): [string, string] {
  return [
    `${EXERCISE_IMG_BASE}/${exercise.fuenteId}/0.jpg`,
    `${EXERCISE_IMG_BASE}/${exercise.fuenteId}/1.jpg`,
  ];
}

/** Minusculas y sin tildes, para busqueda tolerante a acentos. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function filterExercises(
  exercises: Exercise[],
  filters: ExerciseFilters,
): Exercise[] {
  const query = filters.query ? normalize(filters.query) : "";
  return exercises.filter((exercise) => {
    if (filters.grupo && exercise.grupo !== filters.grupo) return false;
    if (filters.equipo && exercise.equipo !== filters.equipo) return false;
    if (filters.dificultad && exercise.dificultad !== filters.dificultad)
      return false;
    if (query && !normalize(exercise.nombre).includes(query)) return false;
    return true;
  });
}

export async function getExercises(
  filters: ExerciseFilters = {},
): Promise<Exercise[]> {
  return filterExercises(EXERCISES, filters);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  return EXERCISES.find((exercise) => exercise.id === id) ?? null;
}

export async function getAllExerciseIds(): Promise<string[]> {
  return EXERCISES.map((exercise) => exercise.id);
}

/** Numero de ejercicios por grupo muscular (para chips/contador). */
export function countByGroup(
  exercises: Exercise[],
): Partial<Record<MuscleGroup, number>> {
  const counts: Partial<Record<MuscleGroup, number>> = {};
  for (const exercise of exercises) {
    counts[exercise.grupo] = (counts[exercise.grupo] ?? 0) + 1;
  }
  return counts;
}

/** Equipos presentes en el dataset, para no pintar filtros vacios. */
export function availableEquipment(exercises: Exercise[]): EquipmentId[] {
  return [...new Set(exercises.map((exercise) => exercise.equipo))];
}

export function availableDifficulties(exercises: Exercise[]): DifficultyId[] {
  return [...new Set(exercises.map((exercise) => exercise.dificultad))];
}

/** Export sincrono solo para uso interno (listado client-side en modo demo). */
export const DEMO_EXERCISES = EXERCISES;
