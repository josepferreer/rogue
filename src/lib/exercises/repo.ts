import exercisesData from "@/data/exercises.es.json";
import type {
  DifficultyId,
  EquipmentId,
  Exercise,
  ExerciseCategory,
  ExerciseFilters,
  MuscleId,
} from "./types";

/**
 * Fachada de acceso a datos de ejercicios.
 *
 * Hoy lee del dataset local (modo demo). Cuando haya credenciales de
 * Supabase, estas funciones pasaran a consultar la tabla `exercises`
 * sin que la UI cambie (misma firma async).
 */

const EXERCISES = exercisesData as Exercise[];

/**
 * Base de las imagenes de ejercicios.
 *
 * Por defecto apunta al repositorio original de free-exercise-db (dominio
 * publico), pero raw.githubusercontent.com NO es un CDN: aplica limitacion de
 * tasa, no garantiza disponibilidad y puede cortar trafico masivo. Con una beta
 * publica real, el dia que GitHub limite se queda la biblioteca entera en
 * blanco.
 *
 * Define NEXT_PUBLIC_EXERCISE_IMG_BASE apuntando a tu propio bucket (ver
 * scripts/mirror-exercise-images.mjs, que copia los assets a Supabase Storage)
 * para servirlas desde tu dominio. La estructura de rutas es la misma:
 * {base}/{fuenteId}/0.jpg y {base}/{fuenteId}/1.jpg.
 */
export const EXERCISE_IMG_BASE =
  process.env.NEXT_PUBLIC_EXERCISE_IMG_BASE ??
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

/** URLs de los 2 frames (inicio/fin del movimiento) de un ejercicio o variante. */
export function getExerciseImages(exercise: Exercise | { fuenteId: string } | string): [string, string] {
  const fuenteId = typeof exercise === "string" ? exercise : exercise.fuenteId;
  return [
    `${EXERCISE_IMG_BASE}/${fuenteId}/0.jpg`,
    `${EXERCISE_IMG_BASE}/${fuenteId}/1.jpg`,
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

/** Indice por id. El mapa de calor muscular resuelve un ejercicio POR SERIE
 *  (miles de llamadas al pintar el historial), y un `find` lineal sobre 200
 *  ejercicios en cada una se nota. */
const BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

export async function getExerciseById(id: string): Promise<Exercise | null> {
  return BY_ID.get(id) ?? null;
}

/** Musculos de un ejercicio. Sincrono a proposito: lo usa el calculo de
 *  recuperacion muscular, que es una funcion pura sobre todo el historial. */
export function getExerciseMuscles(id: string): {
  primary: MuscleId[];
  secondary: MuscleId[];
} {
  const exercise = BY_ID.get(id);
  return {
    primary: exercise?.musculosPrimarios ?? [],
    secondary: exercise?.musculosSecundarios ?? [],
  };
}

export async function getAllExerciseIds(): Promise<string[]> {
  return EXERCISES.map((exercise) => exercise.id);
}

/** Numero de ejercicios por categoria (para chips/contador). */
export function countByGroup(
  exercises: Exercise[],
): Partial<Record<ExerciseCategory, number>> {
  const counts: Partial<Record<ExerciseCategory, number>> = {};
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
