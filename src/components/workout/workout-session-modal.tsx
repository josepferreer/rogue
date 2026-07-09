"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Minimize2,
  Plus,
  Repeat2,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { RankBadge } from "@/components/ui/rank-badge";
import { PastelCard } from "@/components/ui/pastel-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ExerciseSelectorModal } from "@/components/routines/exercise-selector-modal";
import { getExerciseInfo, useRogue } from "@/lib/store/rogue-store";
import { useWorkoutSession } from "@/lib/store/workout-session-store";
import { getDivisionLabel, getRankTier } from "@/lib/ranks";
import { formatWeight } from "@/lib/units";
import { cn } from "@/lib/utils";

export function WorkoutSessionModal() {
  const { preferences } = useRogue();
  const {
    active,
    minimized,
    phase,
    day,
    rows,
    result,
    restUntil,
    restRemaining,
    restTotal,
    doneCount,
    totalCount,
    minimize,
    close,
    updateSet,
    toggleDone,
    addSet,
    removeSet,
    replaceExercise,
    skipRest,
    finish,
  } = useWorkoutSession();

  // Ejercicio que se esta sustituyendo (abre el selector).
  const [swapForExId, setSwapForExId] = useState<string | null>(null);
  // Confirmacion antes de descartar la sesion activa.
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!active || minimized || !day) return null;

  // ── Resumen de sesion completada ──────────────────────────────────────────
  if (phase === "done" && result) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full flex-1 flex-col gap-5 overflow-y-auto px-5 pb-6 pt-10 md:max-w-2xl">
          <div className="flex flex-col items-center gap-2 pt-4 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Trophy className="size-8" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              Sesion completada
            </h1>
            <p className="text-sm text-muted-foreground">
              {day.label} · {result.session.sets.length} series registradas
            </p>
          </div>

          {result.rankChanges.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                RANGO SUBE
              </p>
              {result.rankChanges.map((c) => {
                const after = c.after;
                if (!after.ranked) return null;
                const tier = getRankTier(after.tier);
                return (
                  <PastelCard
                    key={c.muscle}
                    variant="lilac"
                    className="flex items-center gap-3"
                  >
                    <RankBadge
                      tier={after.tier}
                      division={after.division}
                      size="sm"
                    />
                    <div>
                      <p className="text-sm font-semibold">{c.muscle}</p>
                      <p className="font-mono text-xs opacity-80">
                        {c.newlyRanked ? "Primer rango · " : "Sube a "}
                        {tier.label} {getDivisionLabel(tier, after.division)}
                      </p>
                    </div>
                  </PastelCard>
                );
              })}
            </div>
          )}

          {result.prs.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                MARCAS PERSONALES
              </p>
              {result.prs.map((pr) => (
                <PastelCard
                  key={pr.exerciseId}
                  variant="neutral"
                  className="flex items-center justify-between"
                >
                  <span className="text-sm">{pr.nombre}</span>
                  <span className="font-mono text-sm text-muted-foreground">
                    1RM {formatWeight(pr.est1RM, preferences.unit)} {preferences.unit}
                  </span>
                </PastelCard>
              ))}
            </div>
          )}

          {result.rankChanges.length === 0 && result.prs.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Sesion guardada. Sigue asi para subir de rango.
            </p>
          )}
        </div>

        <div className="mx-auto w-full shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:max-w-2xl">
          <button
            type="button"
            onClick={close}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-4 text-sm font-medium text-accent-foreground transition-transform active:scale-[0.99]"
          >
            Volver al inicio
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Sesion activa ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      <header className="mx-auto flex w-full shrink-0 items-center justify-between px-4 py-2 pt-10 md:max-w-2xl">
        <button
          type="button"
          onClick={() => (doneCount > 0 ? setConfirmDiscard(true) : close())}
          aria-label="Descartar entreno"
          className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
        >
          <X className="size-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">{day.label}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {doneCount}/{totalCount} series
          </p>
        </div>
        <button
          type="button"
          onClick={minimize}
          aria-label="Minimizar entreno"
          className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
        >
          <Minimize2 className="size-5" />
        </button>
      </header>

      <div className="mx-auto flex w-full flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-2 md:max-w-2xl">
        {day.exercises.map((ex) => {
          const info = getExerciseInfo(ex.exerciseId);
          return (
            <div
              key={ex.exerciseId}
              className="rounded-3xl border border-border bg-surface p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {info.nombre}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {info.grupo}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSwapForExId(ex.exerciseId)}
                    aria-label={`Cambiar ${info.nombre}`}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
                  >
                    <Repeat2 className="size-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {(rows[ex.exerciseId] ?? []).map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Eliminar serie ${i + 1}`}
                      onClick={() => removeSet(ex.exerciseId, i)}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-95"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <label className="flex flex-1 items-center gap-1 rounded-xl bg-muted/60 px-3 py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={s.weightKg}
                        onChange={(e) =>
                          updateSet(ex.exerciseId, i, { weightKg: e.target.value })
                        }
                        placeholder="0"
                        className="w-full bg-transparent text-sm outline-none"
                      />
                      <span className="text-xs text-muted-foreground">
                        {preferences.unit}
                      </span>
                    </label>
                    <label className="flex flex-1 items-center gap-1 rounded-xl bg-muted/60 px-3 py-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.reps}
                        onChange={(e) =>
                          updateSet(ex.exerciseId, i, { reps: e.target.value })
                        }
                        placeholder="0"
                        className="w-full bg-transparent text-sm outline-none"
                      />
                      <span className="text-xs text-muted-foreground">reps</span>
                    </label>
                    <button
                      type="button"
                      aria-label="Completar serie"
                      onClick={() => toggleDone(ex.exerciseId, i, ex.restSec)}
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors active:scale-95",
                        s.done
                          ? "border-foreground bg-accent text-accent-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      <Check className="size-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addSet(ex.exerciseId)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground active:scale-[0.99]"
              >
                <Plus className="size-3.5" />
                Añadir serie
              </button>
            </div>
          );
        })}
      </div>

      <div className="mx-auto flex w-full shrink-0 flex-col gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:max-w-2xl">
        {restUntil !== null && (
          <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-surface/90 px-4 py-2.5 backdrop-blur-xl">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Descanso</span>
              <span className="font-mono font-medium">{restRemaining}s</span>
              <button
                type="button"
                onClick={skipRest}
                className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Saltar
              </button>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{
                  width: `${restTotal ? (restRemaining / restTotal) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          disabled={doneCount === 0}
          onClick={finish}
          className="mx-auto flex w-full max-w-sm items-center justify-center gap-2 rounded-full bg-accent py-4 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-40"
        >
          Finalizar entreno
          <Check className="size-4" />
        </button>
      </div>

      <ExerciseSelectorModal
        open={swapForExId !== null}
        onClose={() => setSwapForExId(null)}
        excludeIds={day.exercises.map((e) => e.exerciseId)}
        onSelect={(newEx) => {
          if (swapForExId) replaceExercise(swapForExId, newEx.id);
          setSwapForExId(null);
        }}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title="¿Descartar entreno?"
        description={`Perderas las ${doneCount} series completadas de esta sesion.`}
        confirmLabel="Descartar"
        onConfirm={() => {
          setConfirmDiscard(false);
          close();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
