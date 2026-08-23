"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  Clock,
  GripVertical,
  Minimize2,
  Plus,
  Repeat2,
  ThumbsUp,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PastelCard } from "@/components/ui/pastel-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { usePresence } from "@/lib/use-presence";
import { ExerciseSelectorModal } from "@/components/routines/exercise-selector-modal";
import { getExerciseInfo, useRogue } from "@/lib/store/rogue-store";
import { useWorkoutSession } from "@/lib/store/workout-session-store";
import { useBackButton } from "@/lib/use-back-button";
import { formatWeight } from "@/lib/units";
import { cn, formatDuration } from "@/lib/utils";

/**
 * Tarjeta de ejercicio arrastrable dentro de la sesion activa.
 *
 * El arrastre va por un "grip" dedicado (setActivatorNodeRef), no por toda la
 * tarjeta: dentro hay inputs numericos, checks y chips, y arrastrar desde
 * cualquier punto haria imposible usarlos. `touch-none` en el grip es lo que
 * da arrastre tactil real en movil.
 */
function SortableExercise({
  id,
  children,
}: {
  id: string;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handle = (
    <span
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Arrastra para reordenar el ejercicio"
      title="Arrastra para reordenar"
      className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </span>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-3xl border bg-surface p-4",
        isDragging
          ? "z-10 border-foreground/40 shadow-drag"
          : "border-border",
      )}
    >
      {children(handle)}
    </div>
  );
}

export function WorkoutSessionModal() {
  const { preferences } = useRogue();
  const {
    active,
    minimized,
    phase,
    day,
    rows,
    unit,
    result,
    restUntil,
    restRemaining,
    restTotal,
    elapsedSec,
    doneCount,
    totalCount,
    minimize,
    close,
    updateSet,
    toggleDone,
    addSet,
    removeSet,
    replaceExercise,
    reorderExercises,
    addExercise,
    noteDrafts,
    setExerciseFlag,
    setExerciseNote,
    reminders,
    dismissReminders,
    skipRest,
    adjustRest,
    finish,
  } = useWorkoutSession();

  // Aviso de descanso terminado. Como con la hoja del producto escaneado: al
  // descartarlo la lista se vacia, y durante la animacion de salida el panel
  // seguiria en pantalla pero sin nada dentro. Se conserva la ultima lista no
  // vacia para pintarla mientras se va.
  const { mounted: avisoMontado, state: avisoEstado } = usePresence(reminders.length > 0);
  const [avisosVisibles, setAvisosVisibles] = useState(reminders);
  if (reminders.length > 0 && reminders !== avisosVisibles) setAvisosVisibles(reminders);

  // Ejercicio que se esta sustituyendo (abre el selector).
  const [swapForExId, setSwapForExId] = useState<string | null>(null);
  // El selector esta abierto para ANADIR un ejercicio imprevisto (no sustituir).
  const [addingExercise, setAddingExercise] = useState(false);
  // Confirmacion antes de descartar la sesion activa.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { notify } = useToast();

  // Finalizar puede rechazar (series marcadas pero sin repeticiones validas).
  // Antes no ocurria nada al pulsar y el usuario acababa descartando el entreno.
  const handleFinish = () => {
    const outcome = finish();
    if (!outcome.ok && outcome.reason === "sin-reps") {
      notify(
        "Ninguna serie completada tiene repeticiones. Rellenalas antes de finalizar.",
        "error",
      );
    }
  };

  // Mismo umbral de 6px que el editor de rutinas: evita que un toque en un
  // input o en el check de serie se interprete como arrastre.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorderExercises(String(active.id), String(over.id));
  };

  // "Atrás" (APK/PWA) minimiza el entreno en vez de sacar la app al home.
  useBackButton(active && !minimized && !!day, minimize);

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
            {result.session.durationSec !== undefined && (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-mono text-xs tabular-nums text-muted-foreground">
                <Clock className="size-3.5" />
                {formatDuration(result.session.durationSec)}
              </p>
            )}
          </div>

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

          {result.prs.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Sesion guardada. Sigue asi.
            </p>
          )}
        </div>

        <div className="mx-auto w-full shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:max-w-2xl">
          <Button fullWidth size="lg" onClick={close}>
            Volver al inicio
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Sesion activa ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
      {avisoMontado && avisosVisibles.length > 0 && (
        <div
          className="overlay-anim absolute inset-0 z-30 flex items-center justify-center bg-background/85 p-6 backdrop-blur-sm"
          data-state={avisoEstado}
        >
          <div
            className="dialog-anim w-full max-w-sm rounded-3xl border border-border bg-surface p-5"
            data-state={avisoEstado}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Bell className="size-4" />
              </span>
              <p className="text-base font-semibold">Recordatorio</p>
            </div>
            <div className="flex flex-col gap-2">
              {avisosVisibles.map((r) => (
                <div
                  key={r.exerciseId}
                  className="rounded-2xl bg-muted/60 px-3 py-2.5 text-sm"
                >
                  <p className="font-medium">{r.exerciseName}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    La última vez marcaste{" "}
                    <span className="font-medium text-foreground">
                      {r.flag === "subir" ? "subir peso" : "bajar peso"}
                    </span>
                    {r.weightKg !== null && (
                      <>
                        {" "}
                        ({formatWeight(r.weightKg, preferences.unit)}{" "}
                        {preferences.unit})
                      </>
                    )}
                    .
                  </p>
                </div>
              ))}
            </div>
            <Button fullWidth onClick={dismissReminders} className="mt-4">
              Entendido
              <Check className="size-4" />
            </Button>
          </div>
        </div>
      )}
      <header className="mx-auto flex w-full shrink-0 items-center justify-between px-4 py-2 pt-10 md:max-w-2xl">
        <button
          type="button"
          onClick={() => setConfirmDiscard(true)}
          aria-label="Descartar entreno"
          className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
        >
          <X className="size-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">{day.label}</p>
          <p className="flex items-center justify-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="size-3" />
              {formatDuration(elapsedSec)}
            </span>
            <span aria-hidden>·</span>
            <span>
              {doneCount}/{totalCount} series
            </span>
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

      <div className="mx-auto flex w-full flex-1 flex-col gap-4 overflow-y-auto px-5 pb-40 pt-2 md:max-w-2xl">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={day.exercises.map((e) => e.exerciseId)}
            strategy={verticalListSortingStrategy}
          >
            {day.exercises.map((ex) => {
              const info = getExerciseInfo(ex.exerciseId);
              return (
                <SortableExercise key={ex.exerciseId} id={ex.exerciseId}>
                  {(handle) => (
                    <>
              <div className="mb-3 flex items-center justify-between gap-2">
                {handle}
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {info.nombre}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="font-mono text-xs text-muted-foreground">
                    {info.grupo}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSwapForExId(ex.exerciseId)}
                    aria-label={`Cambiar ${info.nombre}`}
                    className="flex size-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
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
                      className="flex size-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-95"
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
                        value={s.weight}
                        onChange={(e) =>
                          updateSet(ex.exerciseId, i, { weight: e.target.value })
                        }
                        placeholder="0"
                        className="w-full bg-transparent text-sm outline-none"
                      />
                      <span className="text-xs text-muted-foreground">{unit}</span>
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

              <div className="mt-3 border-t border-border pt-3">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { flag: "subir", label: "Subir peso", Icon: TrendingUp },
                      { flag: "bajar", label: "Bajar", Icon: TrendingDown },
                      { flag: "ok", label: "OK", Icon: ThumbsUp },
                    ] as const
                  ).map(({ flag, label, Icon }) => {
                    const chipActive = noteDrafts[ex.exerciseId]?.flag === flag;
                    return (
                      <button
                        key={flag}
                        type="button"
                        onClick={() => setExerciseFlag(ex.exerciseId, flag)}
                        aria-pressed={chipActive}
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors active:scale-95",
                          chipActive
                            ? "border-foreground bg-accent text-accent-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3" />
                        {label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={noteDrafts[ex.exerciseId]?.text ?? ""}
                  onChange={(e) => setExerciseNote(ex.exerciseId, e.target.value)}
                  placeholder="Nota (opcional)"
                  className="mt-2 w-full rounded-xl bg-muted/60 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
                    </>
                  )}
                </SortableExercise>
              );
            })}
          </SortableContext>
        </DndContext>

        {/* Ejercicio imprevisto: se anade solo a este entreno, la rutina base
            se queda como esta. */}
        <button
          type="button"
          onClick={() => setAddingExercise(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-3xl border border-dashed border-border py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground active:scale-[0.99]"
        >
          <Plus className="size-4" />
          Añadir ejercicio
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto flex w-full flex-col gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:max-w-2xl">
        {restUntil !== null && (
          <div className="pointer-events-auto mx-auto w-full max-w-sm rounded-2xl border border-border bg-surface/90 px-4 py-2.5 backdrop-blur-xl">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Descanso</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => adjustRest(-15)}
                  aria-label="Restar 15 segundos"
                  className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground hover:text-foreground active:scale-95"
                >
                  −15
                </button>
                <span className="w-10 text-center font-mono font-medium tabular-nums">
                  {restRemaining}s
                </span>
                <button
                  type="button"
                  onClick={() => adjustRest(15)}
                  aria-label="Sumar 15 segundos"
                  className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground hover:text-foreground active:scale-95"
                >
                  +15
                </button>
              </div>
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
        <Button
          fullWidth
          disabled={doneCount === 0}
          onClick={handleFinish}
          className="pointer-events-auto mx-auto max-w-sm py-4"
        >
          Finalizar entreno
          <Check className="size-4" />
        </Button>
      </div>

      <ExerciseSelectorModal
        open={swapForExId !== null || addingExercise}
        onClose={() => {
          setSwapForExId(null);
          setAddingExercise(false);
        }}
        excludeIds={day.exercises.map((e) => e.exerciseId)}
        onSelect={(newEx) => {
          if (swapForExId) replaceExercise(swapForExId, newEx.id);
          else if (addingExercise) addExercise(newEx.id);
          setSwapForExId(null);
          setAddingExercise(false);
        }}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title="¿Descartar entreno?"
        description={
          doneCount > 0
            ? `Perderas las ${doneCount} series completadas y no se guardara ningun registro de este entrenamiento.`
            : "No se guardara ningun registro de este entrenamiento."
        }
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
