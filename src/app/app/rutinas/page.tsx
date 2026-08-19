"use client";

import { use, useState } from "react";
import Link from "next/link";
import { CalendarPlus, ChevronDown, ChevronUp, Dumbbell, Pencil, Play, Trash2 } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { LibraryPanel } from "@/components/exercise/library-panel";
import { getExerciseInfo, useRogue } from "@/lib/store/rogue-store";
import { useWorkoutSession } from "@/lib/store/workout-session-store";
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/workout/types";
import type { WorkoutSession } from "@/lib/workout/types";
import { cn } from "@/lib/utils";

type EntrenoTab = "rutina" | "ejercicios" | "historial";

const ENTRENO_TABS: { id: EntrenoTab; label: string }[] = [
  { id: "rutina", label: "Rutina" },
  { id: "ejercicios", label: "Ejercicios" },
  { id: "historial", label: "Historial" },
];

function parseTab(value: string | undefined): EntrenoTab {
  if (value === "ejercicios") return "ejercicios";
  if (value === "historial") return "historial";
  return "rutina";
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
          <p className="text-sm font-semibold">Aún no tienes días de rutina</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crea tu primer día de entreno desde el editor.
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
                Este día no tiene ejercicios todavía.
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

function SessionCard({ session }: { session: WorkoutSession }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { deleteSession } = useRogue();

  const dateObj = new Date(session.dateISO);
  const dateStr = dateObj.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = dateObj.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Agrupar series por ejercicio manteniendo el orden de aparición
  const groupedExercises: {
    exerciseId: string;
    name: string;
    sets: { weightKg: number; reps: number }[];
  }[] = [];

  for (const set of session.sets) {
    let group = groupedExercises.find((g) => g.exerciseId === set.exerciseId);
    if (!group) {
      const info = getExerciseInfo(set.exerciseId);
      group = {
        exerciseId: set.exerciseId,
        name: info?.nombre || set.exerciseId,
        sets: [],
      };
      groupedExercises.push(group);
    }
    group.sets.push({ weightKg: set.weightKg, reps: set.reps });
  }

  // Volumen total calculado
  const totalVolumeKg = session.sets.reduce(
    (acc, set) => acc + set.weightKg * set.reps,
    0,
  );

  return (
    <PastelCard variant="neutral" className="flex flex-col gap-3">
      <div
        className="flex cursor-pointer items-start justify-between gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold">{session.dayLabel}</p>
            <span className="font-mono text-[10px] text-muted-foreground">
              {timeStr}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[11px] uppercase text-muted-foreground">
            {dateStr}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {session.durationSec !== undefined && (
            <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] font-medium text-muted-foreground">
              {Math.floor(session.durationSec / 60)} MIN
            </span>
          )}
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted"
            aria-label={expanded ? "Plegar detalle" : "Desplegar detalle"}
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </button>
        </div>
      </div>

      <div
        className="flex cursor-pointer items-center justify-between border-t border-border/40 pt-2.5 text-xs text-muted-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-1.5 font-mono text-[11px]">
          <Dumbbell className="size-3.5 opacity-70" />
          {groupedExercises.length} {groupedExercises.length === 1 ? "ejercicio" : "ejercicios"} · {session.sets.length} series
        </span>

        {totalVolumeKg > 0 && (
          <span className="font-mono text-[11px] font-medium text-foreground">
            {totalVolumeKg.toLocaleString("es-ES")} kg volcados
          </span>
        )}
      </div>

      {/* Vista Desplegada con todos los ejercicios, series y pesos */}
      {expanded && (
        <div className="mt-1 flex flex-col gap-3.5 border-t border-border/50 pt-3">
          <div className="flex flex-col gap-2.5">
            {groupedExercises.map((group, exIdx) => {
              const maxWeight = Math.max(...group.sets.map((s) => s.weightKg));
              return (
                <div
                  key={`${group.exerciseId}-${exIdx}`}
                  className="flex flex-col gap-1.5 rounded-2xl bg-black/5 p-3 dark:bg-white/5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">
                      {group.name}
                    </p>
                    {maxWeight > 0 && (
                      <span className="font-mono text-[10px] font-medium text-muted-foreground">
                        Máx. {maxWeight} kg
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1 sm:grid-cols-3">
                    {group.sets.map((set, setIdx) => (
                      <div
                        key={setIdx}
                        className="flex items-center justify-between rounded-xl border border-border/30 bg-background/70 px-2.5 py-1.5 font-mono text-[11px]"
                      >
                        <span className="text-muted-foreground/70">#{setIdx + 1}</span>
                        <span className="font-semibold text-foreground">
                          {set.weightKg > 0 ? `${set.weightKg} kg` : "Corporal"} × {set.reps}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end border-t border-border/40 pt-2">
            {confirmDelete ? (
              <div className="flex w-full items-center justify-between gap-2 rounded-xl bg-red-500/10 p-2 text-xs text-red-500">
                <span>¿Eliminar esta sesión?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => deleteSession(session.id)}
                    className="rounded-lg bg-red-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-600"
                  >
                    Sí, borrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg bg-muted px-3 py-1 text-xs font-medium text-foreground"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 font-mono text-[11px] font-medium text-muted-foreground transition-colors hover:text-red-500"
              >
                <Trash2 className="size-3.5" />
                Eliminar sesión
              </button>
            )}
          </div>
        </div>
      )}
    </PastelCard>
  );
}

function HistoryPanel() {
  const { sessions } = useRogue();

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <span className="font-mono text-xl opacity-30">0</span>
        </div>
        <div>
          <p className="text-sm font-semibold">No hay entrenamientos guardados</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tus sesiones completadas aparecerán aquí.
          </p>
        </div>
      </div>
    );
  }

  const sorted = [...sessions].sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((s) => (
        <SessionCard key={s.id} session={s} />
      ))}
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
            {tab === "rutina" && `${routineDays.length} DÍAS`}
            {tab === "ejercicios" && "BIBLIOTECA DE EJERCICIOS"}
            {tab === "historial" && "HISTORIAL DE ENTRENAMIENTOS"}
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

      {tab === "rutina" && <RoutinePanel />}
      {tab === "ejercicios" && <LibraryPanel />}
      {tab === "historial" && <HistoryPanel />}
    </div>
  );
}
