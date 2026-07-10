import Link from "next/link";
import { ExerciseThumb } from "./exercise-media";
import { getExerciseImages } from "@/lib/exercises/repo";
import type { Exercise } from "@/lib/exercises/types";

/** Tarjeta compacta para tiras horizontales (favoritos/recientes). */
export function ExerciseMiniCard({ exercise }: { exercise: Exercise }) {
  const [thumb] = getExerciseImages(exercise);

  return (
    <Link
      href={`/biblioteca/${exercise.id}`}
      className="flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface p-2.5 text-center hover:bg-muted/60"
    >
      <ExerciseThumb src={thumb} alt={exercise.nombre} className="size-16" />
      <p className="line-clamp-2 text-xs font-medium leading-tight">
        {exercise.nombre}
      </p>
    </Link>
  );
}
