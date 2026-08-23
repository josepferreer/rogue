/**
 * Ejercicios personalizados en Supabase.
 *
 * Viven en la tabla `exercises` con `owner_id` (ver la migracion
 * 20260822_ejercicios_personalizados.sql). No es una tabla aparte porque
 * routine_exercises, workout_sets, exercise_notes y exercise_favorites tienen
 * FK a exercises(id): un ejercicio fuera de esa tabla no se podria usar en un
 * entreno ni en una rutina.
 */
import { grupoFromDb, grupoToDb } from "@/lib/exercises/custom";
import type { Exercise } from "@/lib/exercises/types";
import { createClient } from "./client";

type SupabaseClient = ReturnType<typeof createClient>;

type ExerciseRow = {
  id: string;
  nombre: string;
  grupo: string;
  equipo: string;
  dificultad: string;
  mecanica: string;
  musculos_primarios: string[] | null;
  musculos_secundarios: string[] | null;
  instrucciones: string[] | null;
  consejos: string[] | null;
};

const COLUMNS =
  "id, nombre, grupo, equipo, dificultad, mecanica, musculos_primarios, musculos_secundarios, instrucciones, consejos";

function rowToExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    nombre: row.nombre,
    grupo: grupoFromDb(row.grupo),
    equipo: row.equipo as Exercise["equipo"],
    dificultad: row.dificultad as Exercise["dificultad"],
    mecanica: row.mecanica as Exercise["mecanica"],
    musculosPrimarios: (row.musculos_primarios ??
      []) as Exercise["musculosPrimarios"],
    musculosSecundarios: (row.musculos_secundarios ??
      []) as Exercise["musculosSecundarios"],
    instrucciones: row.instrucciones ?? [],
    consejos: row.consejos ?? [],
    fuenteId: null,
    esPersonalizado: true,
  };
}

/** La RLS ya filtra por owner; el `.not(owner_id, is, null)` deja fuera el
 *  catalogo publico, que sale del dataset local y no hace falta traer. */
export async function listCustomExercises(
  supabase: SupabaseClient,
): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select(COLUMNS)
    .not("owner_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => rowToExercise(row as ExerciseRow));
}

/** supabase-js resuelve con { error } en vez de rechazar: sin este throw el
 *  formulario se cerraria como si hubiera guardado. */
export async function insertCustomExercise(
  supabase: SupabaseClient,
  userId: string,
  exercise: Exercise,
): Promise<Exercise> {
  const { error } = await supabase.from("exercises").insert({
    id: exercise.id,
    owner_id: userId,
    nombre: exercise.nombre,
    // FK a muscle_groups(id), que son minusculas.
    grupo: grupoToDb(exercise.grupo),
    equipo: exercise.equipo,
    dificultad: exercise.dificultad,
    mecanica: exercise.mecanica,
    musculos_primarios: exercise.musculosPrimarios,
    musculos_secundarios: exercise.musculosSecundarios,
    instrucciones: exercise.instrucciones,
    consejos: exercise.consejos,
    fuente_id: null,
  });
  if (error) {
    // Indice unico (owner_id, lower(nombre)) de la migracion.
    if (error.code === "23505") {
      throw new Error(`Ya tienes un ejercicio llamado "${exercise.nombre}".`);
    }
    throw error;
  }
  return exercise;
}

/** Las FK son `on delete restrict`: si el ejercicio ya se uso en un entreno o
 *  en una rutina, Postgres rechaza el borrado. Preferimos eso a arrastrar el
 *  historial del usuario por delante. */
export async function deleteCustomExercise(
  supabase: SupabaseClient,
  exerciseId: string,
): Promise<void> {
  const { error } = await supabase
    .from("exercises")
    .delete()
    .eq("id", exerciseId);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "No puedes borrarlo: ya lo has usado en un entreno o en una rutina.",
      );
    }
    throw error;
  }
}
