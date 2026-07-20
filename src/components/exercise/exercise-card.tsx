import Link from "next/link";
import { ChevronRight, Clock, Heart } from "lucide-react";
import { ExerciseThumb } from "./exercise-media";
import { getExerciseImages } from "@/lib/exercises/repo";
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  type Exercise,
} from "@/lib/exercises/types";
import { cn } from "@/lib/utils";

export type ExerciseBadge = "favorito" | "reciente";

export function ExerciseCard({
  exercise,
  badge,
}: {
  exercise: Exercise;
  badge?: ExerciseBadge;
}) {
  const [thumb] = getExerciseImages(exercise);

  return (
    <Link
      href={`/app/biblioteca/${exercise.id}`}
      className="relative flex items-center gap-3 rounded-3xl border border-border bg-surface p-3 transition-colors hover:bg-muted/60 active:bg-muted"
    >
      {badge && (
        <span
          className={cn(
            "absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
            badge === "favorito"
              ? "bg-rank-maestro/15 text-rank-maestro"
              : "bg-muted text-muted-foreground",
          )}
        >
          {badge === "favorito" ? (
            <Heart className="size-2.5 fill-current" />
          ) : (
            <Clock className="size-2.5" />
          )}
          {badge === "favorito" ? "Favorito" : "Reciente"}
        </span>
      )}
      <ExerciseThumb src={thumb} alt={exercise.nombre} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", badge && "pr-20")}>
          {exercise.nombre}
        </p>
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
