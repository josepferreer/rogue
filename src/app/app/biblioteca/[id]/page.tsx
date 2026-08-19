import { notFound } from "next/navigation";
import { ExerciseDetailView } from "@/components/exercise/exercise-detail-view";
import {
  getAllExerciseIds,
  getExerciseById,
} from "@/lib/exercises/repo";

type PageProps = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  const ids = await getAllExerciseIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const exercise = await getExerciseById(id);
  return { title: exercise ? `${exercise.nombre} · Rogue` : "Ejercicio" };
}

export default async function ExercisePage({ params }: PageProps) {
  const { id } = await params;
  const exercise = await getExerciseById(id);
  if (!exercise) notFound();

  return <ExerciseDetailView exercise={exercise} />;
}
