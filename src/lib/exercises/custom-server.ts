import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grupoFromDb } from "./custom";
import { getExerciseMuscles } from "./repo";
import type { Exercise, MuscleId } from "./types";

/**
 * Ejercicios personalizados EN SERVIDOR.
 *
 * `repo.ts` mantiene el catalogo en un global de modulo que rellena
 * `CustomExercisesProvider`, y ese provider es un componente CLIENTE. En el
 * proceso de servidor (Server Components, rutas API, tools de NOA) ese global
 * NUNCA contiene los ejercicios propios del usuario, asi que cualquier lookup
 * por id devuelve null y cualquier consulta de musculos devuelve listas vacias.
 *
 * Eso rompia dos cosas de forma silenciosa:
 *   - la ficha /app/biblioteca/[id] daba 404 para todo ejercicio propio;
 *   - el mapa de calor de NOA no contaba ni una serie hecha con ellos, pese a
 *     que la tool `createCustomExercise` le promete al usuario justo lo
 *     contrario ("Contara para tu mapa de calor").
 *
 * Estas funciones cierran ese hueco leyendo de Supabase con la sesion en curso.
 */

const COLUMNS =
  "id, nombre, grupo, equipo, dificultad, mecanica, musculos_primarios, musculos_secundarios, instrucciones, consejos";

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToExercise(row: any): Exercise {
  return {
    id: row.id,
    nombre: row.nombre,
    grupo: grupoFromDb(row.grupo),
    equipo: row.equipo,
    dificultad: row.dificultad,
    mecanica: row.mecanica,
    musculosPrimarios: row.musculos_primarios ?? [],
    musculosSecundarios: row.musculos_secundarios ?? [],
    instrucciones: row.instrucciones ?? [],
    consejos: row.consejos ?? [],
    fuenteId: null,
    esPersonalizado: true,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Un ejercicio propio por id. La RLS ya limita a los del usuario en sesion. */
export async function getCustomExerciseById(
  supabase: SupabaseClient,
  id: string,
): Promise<Exercise | null> {
  const { data, error } = await supabase
    .from("exercises")
    .select(COLUMNS)
    .eq("id", id)
    .not("owner_id", "is", null)
    .maybeSingle();
  if (error || !data) return null;
  try {
    return rowToExercise(data);
  } catch {
    return null;
  }
}

export async function listCustomExercises(
  supabase: SupabaseClient,
  userId: string,
): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select(COLUMNS)
    .eq("owner_id", userId);
  if (error || !data) return [];
  return data.flatMap((row) => {
    try {
      return [rowToExercise(row)];
    } catch {
      return [];
    }
  });
}

/**
 * Resolvedor de musculos que cubre catalogo publico + ejercicios propios.
 * Misma firma que `getExerciseMuscles`, para poder pasarlo tal cual a
 * `computeMuscleRecovery` sin tocar el motor de recuperacion.
 */
export async function buildMuscleResolver(
  supabase: SupabaseClient,
  userId: string,
): Promise<(id: string) => { primary: MuscleId[]; secondary: MuscleId[] }> {
  const propios = await listCustomExercises(supabase, userId);
  const byId = new Map(propios.map((e) => [e.id, e]));
  return (id: string) => {
    const propio = byId.get(id);
    if (propio) {
      return {
        primary: propio.musculosPrimarios,
        secondary: propio.musculosSecundarios,
      };
    }
    return getExerciseMuscles(id);
  };
}
