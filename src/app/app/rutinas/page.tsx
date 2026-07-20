"use client";

import { use, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Pencil, Play } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { LibraryPanel } from "@/components/exercise/library-panel";
import { getExerciseInfo, useRogue } from "@/lib/store/rogue-store";
import { useWorkoutSession } from "@/lib/store/workout-session-store";
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/workout/types";
import { cn } from "@/lib/utils";

type EntrenoTab = "rutina" | "ejercicios";

const ENTRENO_TABS: { id: EntrenoTab; label: string }[] = [
  { id: "rutina", label: "Rutina" },
  { id: "ejercicios", label: "Ejercicios" },
];

function parseTab(value: string | undefined): EntrenoTab {
  return value === "ejercicios" ? "ejercicios" : "rutina";
}

function RoutinePanel() {
  const { routineDays, todayDays } = useRogue();
  const { start: startWorkout } = useWorkoutSession();
  const todayIds = new Set(todayDays.map((d) => d.id));

  if (routineDays.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface py-12 text-center">
        <CalendarPlus className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold">Aun no tienes dias de rutina</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crea tu primer dia de entreno desde el editor.
          </p>
        </div>
        <Link
          href="/app/rutinas/editor"
          className="mt-1 flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
        >
          <Pencil className="size-3.5" />
          Crear rutina
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {routineDays.map((day) => {
        const isToday = todayIds.has(day.id);
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
                <div className="mt-2 flex gap-1">
                  {WEEKDAY_ORDER.map((wd) => (
                    <span
                      key={wd}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-[10px] font-medium",
                        day.weekdays.includes(wd)
                          ? "bg-black/15 dark:bg-white/25"
                          : "text-muted-foreground/50",
                      )}
                    >
                      {WEEKDAY_LABELS[wd]}
                    </span>
                  ))}
                </div>
              </div>
              {day.exercises.length > 0 && (
                <button
                  type="button"
                  onClick={() => startWorkout(day)}
                  aria-label={`Empezar ${day.label}`}
                  className="flex size-10 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                >
                  <Play className="size-4" />
                </button>
              )}
            </div>

            {day.exercises.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">
                Este dia no tiene ejercicios todavia.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-black/5 dark:divide-white/10">
                {day.exercises.map((ex) => (
                  <div
                    key={ex.exerciseId}
                    className="flex items-center justify-between py-2"
                  >
                    <span
                      className={cn("text-sm", isToday ? "" : "text-foreground/90")}
                    >
                      {getExerciseInfo(ex.exerciseId).nombre}
                    </span>
                    <span className="font-mono text-xs opacity-60">
                      {ex.sets}x{ex.reps}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PastelCard>
        );
      })}
    </div>
  );
}

export default function EntrenoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { routineDays } = useRogue();

  // Pestana inicial via URL (?tab=ejercicios, usado por la home y el redirect
  // de /biblioteca). Toggle local como override ligado al valor de la URL: si
  // la URL cambia (p.ej. tocar "Entreno" en la barra), manda la URL — sin
  // efectos de sincronizacion. Mismo patron que el perfil.
  const urlTab = parseTab(use(searchParams).tab);
  const [override, setOverride] = useState<{ base: EntrenoTab; tab: EntrenoTab } | null>(null);
  const tab = override && override.base === urlTab ? override.tab : urlTab;
  const setTab = (next: EntrenoTab) => setOverride({ base: urlTab, tab: next });

  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entreno</h1>
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            {tab === "rutina"
              ? `${routineDays.length} DÍAS`
              : "BIBLIOTECA DE EJERCICIOS"}
          </p>
        </div>
        {tab === "rutina" && (
          <Link
            href="/app/rutinas/editor"
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3.5" />
            Editar
          </Link>
        )}
      </div>

      <div className="flex rounded-full bg-muted p-1">
        {ENTRENO_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-full py-2 text-xs font-medium transition-colors",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "rutina" ? <RoutinePanel /> : <LibraryPanel />}
    </div>
  );
}
