"use client";

import Link from "next/link";
import { Pencil, Play } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { getExerciseInfo, useRogue } from "@/lib/store/rogue-store";
import { cn } from "@/lib/utils";

export default function RutinasPage() {
  const { routineDays, todayDay } = useRogue();

  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rutinas</h1>
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            {routineDays.length} DÍAS
          </p>
        </div>
        <Link
          href="/rutinas/editor"
          className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3.5" />
          Editar
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {routineDays.map((day) => {
          const isToday = day.id === todayDay.id;
          return (
            <PastelCard
              key={day.id}
              variant={isToday ? "lilac" : "neutral"}
              className="flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold">{day.label}</p>
                    {isToday && (
                      <span className="rounded-full bg-black/10 px-2 py-0.5 font-mono text-[10px] font-medium dark:bg-white/15">
                        HOY
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-xs opacity-70">
                    {day.focus}
                  </p>
                </div>
                {isToday && (
                  <Link
                    href="/entrenar"
                    aria-label="Empezar entreno"
                    className="flex size-10 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  >
                    <Play className="size-4" />
                  </Link>
                )}
              </div>

              <div className="flex flex-col divide-y divide-black/5 dark:divide-white/10">
                {day.exercises.map((ex) => (
                  <div
                    key={ex.exerciseId}
                    className="flex items-center justify-between py-2"
                  >
                    <span
                      className={cn(
                        "text-sm",
                        isToday ? "" : "text-foreground/90",
                      )}
                    >
                      {getExerciseInfo(ex.exerciseId).nombre}
                    </span>
                    <span className="font-mono text-xs opacity-60">
                      {ex.sets}x{ex.reps}
                    </span>
                  </div>
                ))}
              </div>
            </PastelCard>
          );
        })}
      </div>


    </div>
  );
}
