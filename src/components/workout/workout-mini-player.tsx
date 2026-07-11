"use client";

import { Clock, Dumbbell, ListChecks } from "lucide-react";
import { useCardio } from "@/lib/store/cardio-store";
import { useWorkoutSession } from "@/lib/store/workout-session-store";
import { formatDuration } from "@/lib/utils";

export function WorkoutMiniPlayer() {
  const { active, minimized, day, elapsedSec, doneCount, totalCount, maximize } =
    useWorkoutSession();
  const cardio = useCardio();

  if (!active || !minimized || !day) return null;

  // Si el reproductor de cardio tambien esta minimizado, subimos el nuestro
  // para que no se solapen.
  const bothMinimized = cardio.isTracking && cardio.isMinimized;
  const bottom = bothMinimized
    ? "bottom-[calc(env(safe-area-inset-bottom)+148px)] md:bottom-[112px]"
    : "bottom-[calc(env(safe-area-inset-bottom)+80px)] md:bottom-6";

  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  return (
    <button
      onClick={maximize}
      className={`absolute inset-x-4 z-30 flex items-center gap-3 rounded-2xl border border-border bg-background/80 px-4 py-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-transform active:scale-[0.98] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)] md:inset-x-auto md:left-auto md:right-6 md:w-96 ${bottom}`}
    >
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15">
        <Dumbbell className="size-4 text-accent" />
        <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-accent">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-75" />
        </span>
      </div>

      <div className="flex flex-1 items-center justify-between">
        <div className="flex flex-col items-start">
          <span className="flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground">
            <Clock className="size-3" />
            <span className="tabular-nums">{formatDuration(elapsedSec)}</span>
          </span>
          <span className="text-sm font-semibold">{day.label}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ListChecks className="size-3.5" />
          <span className="font-mono text-sm font-medium text-foreground">
            {doneCount}/{totalCount}
          </span>
        </div>
      </div>

      <div className="ml-1 rounded-lg bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
        Abrir
      </div>

      {/* Barra de progreso inferior */}
      <span
        className="absolute inset-x-4 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-muted"
        aria-hidden
      >
        <span
          className="block h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </span>
    </button>
  );
}
