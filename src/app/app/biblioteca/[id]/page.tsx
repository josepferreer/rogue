import { notFound } from "next/navigation";
import { ExerciseDetailView } from "@/components/exercise/exercise-detail-view";
import { isCustomExerciseId } from "@/lib/exercises/custom";
import { getCustomExerciseById } from "@/lib/exercises/custom-server";
import { getAllExerciseIds, getExerciseById } from "@/lib/exercises/repo";
import { createClient } from "@/lib/supabase/server";
import type { Exercise } from "@/lib/exercises/types";

type PageProps = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  const ids = await getAllExerciseIds();
  return ids.map((id) => ({ id }));
}

/**
 * El catalogo publico sale del dataset local, pero los ejercicios propios del
 * usuario solo estan en Supabase: el global de `repo.ts` lo rellena un provider
 * CLIENTE, asi que en servidor nunca los tiene y esta ficha daba 404 para todos.
 */
async function resolveExercise(id: string): Promise<Exercise | null> {
  const publico = await getExerciseById(id);
  if (publico) return publico;
  if (!isCustomExerciseId(id)) return null;
  try {
    const supabase = await createClient();
    return await getCustomExerciseById(supabase, id);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const exercise = await resolveExercise(id);
  // Sin el sufijo: el layout raiz ya aplica la plantilla "%s · Rogue"
  // (layout.tsx:24), asi que ponerlo aqui daba "... · Rogue · Rogue".
  return { title: exercise ? exercise.nombre : "Ejercicio" };
}

export default async function ExercisePage({ params }: PageProps) {
  const { id } = await params;
  const exercise = await resolveExercise(id);
  if (!exercise) notFound();

  return <ExerciseDetailView exercise={exercise} />;
}
