import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ExerciseThumb } from "./exercise-media";
import { getExerciseImages } from "@/lib/exercises/repo";
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  type Exercise,
} from "@/lib/exercises/types";

export function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const [thumb] = getExerciseImages(exercise);

  return (
    <Link
      href={`/biblioteca/${exercise.id}`}
      className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3 transition-colors hover:bg-muted/60 active:bg-muted"
    >
      <ExerciseThumb src={thumb} alt={exercise.nombre} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{exercise.nombre}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {exercise.grupo} · {EQUIPMENT_LABELS[exercise.equipo]}
        </p>
        <p className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground">
          {DIFFICULTY_LABELS[exercise.dificultad].toUpperCase()}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
