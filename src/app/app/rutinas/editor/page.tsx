"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Info,
  Minus,
  Plus,
  Trash2,
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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRogue, getExerciseInfo } from "@/lib/store/rogue-store";
import { DEMO_EXERCISES, EXERCISE_IMG_BASE } from "@/lib/exercises/repo";
import { ExerciseSelectorModal } from "@/components/routines/exercise-selector-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  type RoutineDay,
  type RoutineExercise,
} from "@/lib/workout/types";
import type { Exercise } from "@/lib/exercises/types";
import { cn } from "@/lib/utils";

// Mapa id → ejercicio completo para acceso O(1)
const EX_MAP = new Map(DEMO_EXERCISES.map((e) => [e.id, e]));

function genId() {
  return Math.random().toString(36).slice(2, 8);
}

export default function ConstructorPage() {
  const router = useRouter();
  const { routineDays, saveRoutine } = useRogue();

  // Deep clone para edicion local
  const [days, setDays] = useState<RoutineDay[]>(() =>
    routineDays.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e })) }))
  );
  const [expandedDay, setExpandedDay] = useState<string>(days[0]?.id ?? "");
  const [selectorForDay, setSelectorForDay] = useState<string | null>(null);
  // Dia pendiente de confirmacion antes de borrarlo.
  const [confirmRemoveDay, setConfirmRemoveDay] = useState<RoutineDay | null>(null);

  // --- Reordenar días (arrastrar y soltar la tarjeta completa) ---
  const sensors = useSensors(
    // Pequeño umbral para no disparar el arrastre en un simple toque/scroll.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDays((prev) => {
      const from = prev.findIndex((d) => d.id === active.id);
      const to = prev.findIndex((d) => d.id === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  }, []);

  // --- Helpers de días ---
  const updateDay = useCallback((id: string, patch: Partial<RoutineDay>) => {
    setDays((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const addDay = () => {
    const id = genId();
    const newDay: RoutineDay = {
      id,
      label: "Nuevo día",
      focus: "Musculo principal",
      weekdays: [],
      exercises: [],
    };
    setDays((prev) => [...prev, newDay]);
    setExpandedDay(id);
  };

  const removeDay = (id: string) => {
    setDays((prev) => prev.filter((d) => d.id !== id));
  };

  // --- Helpers de ejercicios ---
  const addExercise = (dayId: string, ex: Exercise) => {
    const newEx: RoutineExercise = {
      exerciseId: ex.id,
      sets: 3,
      reps: 10,
      restSec: 90,
      suggestedKg: 0,
    };
    updateDay(dayId, {
      exercises: [
        ...(days.find((d) => d.id === dayId)?.exercises ?? []),
        newEx,
      ],
    });
  };

  const removeExercise = (dayId: string, exId: string) => {
    const day = days.find((d) => d.id === dayId)!;
    updateDay(dayId, { exercises: day.exercises.filter((e) => e.exerciseId !== exId) });
  };

  const patchExercise = (
    dayId: string,
    exId: string,
    patch: Partial<RoutineExercise>
  ) => {
    const day = days.find((d) => d.id === dayId)!;
    updateDay(dayId, {
      exercises: day.exercises.map((e) =>
        e.exerciseId === exId ? { ...e, ...patch } : e
      ),
    });
  };

  // Reordena los ejercicios dentro de un dia (arrastrar y soltar).
  const reorderExercises = (dayId: string, activeExId: string, overExId: string) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const from = d.exercises.findIndex((e) => e.exerciseId === activeExId);
        const to = d.exercises.findIndex((e) => e.exerciseId === overExId);
        if (from === -1 || to === -1) return d;
        return { ...d, exercises: arrayMove(d.exercises, from, to) };
      }),
    );
  };

  const handleSave = () => {
    saveRoutine(days);
    router.push("/app/rutinas");
  };

  return (
    <div className="flex flex-col gap-5 pt-2 pb-28">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          aria-label="Cancelar"
          className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-base font-semibold">Constructor</h1>
        <button
          onClick={handleSave}
          aria-label="Guardar"
          className="flex size-10 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90"
        >
          <Check className="size-5" />
        </button>
      </div>

      {/* Lista de días */}
      <DndContext
        id="routine-days-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={days.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-3">
            {days.map((day) => (
              <SortableDay
                key={day.id}
                day={day}
                isOpen={expandedDay === day.id}
                canRemove={days.length > 1}
                onToggle={() =>
                  setExpandedDay((cur) => (cur === day.id ? "" : day.id))
                }
                onUpdate={(patch) => updateDay(day.id, patch)}
                onPatchExercise={(exId, patch) =>
                  patchExercise(day.id, exId, patch)
                }
                onRemoveExercise={(exId) => removeExercise(day.id, exId)}
                onReorderExercises={(activeExId, overExId) =>
                  reorderExercises(day.id, activeExId, overExId)
                }
                onAddExercise={() => setSelectorForDay(day.id)}
                onRemoveDay={() => setConfirmRemoveDay(day)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Añadir día */}
      <button
        onClick={addDay}
        className="rounded-3xl border border-dashed border-border py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        + Añadir día
      </button>

      {/* Modal selector */}
      <ExerciseSelectorModal
        open={selectorForDay !== null}
        onClose={() => setSelectorForDay(null)}
        excludeIds={
          selectorForDay
            ? (days.find((d) => d.id === selectorForDay)?.exercises.map((e) => e.exerciseId) ?? [])
            : []
        }
        onSelect={(ex) => {
          if (selectorForDay) addExercise(selectorForDay, ex);
          setSelectorForDay(null);
        }}
      />

      <ConfirmDialog
        open={confirmRemoveDay !== null}
        title={`¿Eliminar "${confirmRemoveDay?.label}"?`}
        description={
          confirmRemoveDay && confirmRemoveDay.exercises.length > 0
            ? `Se perderan sus ${confirmRemoveDay.exercises.length} ejercicios configurados.`
            : undefined
        }
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (confirmRemoveDay) removeDay(confirmRemoveDay.id);
          setConfirmRemoveDay(null);
        }}
        onCancel={() => setConfirmRemoveDay(null)}
      />
    </div>
  );
}

// ── Día ordenable (tarjeta completa arrastrable) ─────────────────────────────
function SortableDay({
  day,
  isOpen,
  canRemove,
  onToggle,
  onUpdate,
  onPatchExercise,
  onRemoveExercise,
  onReorderExercises,
  onAddExercise,
  onRemoveDay,
}: {
  day: RoutineDay;
  isOpen: boolean;
  canRemove: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<RoutineDay>) => void;
  onPatchExercise: (exId: string, patch: Partial<RoutineExercise>) => void;
  onRemoveExercise: (exId: string) => void;
  onReorderExercises: (activeExId: string, overExId: string) => void;
  onAddExercise: () => void;
  onRemoveDay: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: day.id });

  // DnD anidado para reordenar los ejercicios de este dia. Sensores propios
  // (independientes del DnD de dias); mismo umbral de 6px para no disparar el
  // arrastre al tocar los steppers.
  const exerciseSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleExerciseDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorderExercises(String(active.id), String(over.id));
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-3xl border bg-surface overflow-hidden",
        isDragging
          ? "z-10 border-foreground/40 shadow-[0_16px_40px_-12px_rgba(23,24,28,0.35)]"
          : "border-border",
      )}
    >
      {/* Día header */}
      <div className="flex w-full items-center gap-1 px-4 py-4">
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Arrastra para reordenar el día"
          title="Arrastra para reordenar"
          className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </span>
        <button
          type="button"
          className="flex flex-1 items-center gap-2 py-0 text-left"
          onClick={onToggle}
        >
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold">{day.label}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {day.exercises.length} ejercicios · {day.focus}
            </p>
          </div>
          {isOpen ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Contenido expandido */}
      {isOpen && (
        <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-4">
          {/* Nombre y enfoque */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] text-muted-foreground">
                NOMBRE
              </label>
              <input
                value={day.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] text-muted-foreground">
                ENFOQUE
              </label>
              <input
                value={day.focus}
                onChange={(e) => onUpdate({ focus: e.target.value })}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
              />
            </div>
          </div>

          {/* Dias de la semana */}
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] text-muted-foreground">
              DIAS DE LA SEMANA
            </label>
            <div className="flex gap-1.5">
              {WEEKDAY_ORDER.map((wd) => {
                const active = day.weekdays.includes(wd);
                return (
                  <button
                    key={wd}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onUpdate({
                        weekdays: active
                          ? day.weekdays.filter((d) => d !== wd)
                          : [...day.weekdays, wd],
                      })
                    }
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full text-xs font-medium transition-colors",
                      active
                        ? "bg-foreground text-background"
                        : "border border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {WEEKDAY_LABELS[wd]}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sin dias marcados: solo disponible como entreno libre.
            </p>
          </div>

          {/* Ejercicios */}
          <div className="flex flex-col gap-2">
            {day.exercises.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Sin ejercicios todavía
              </p>
            )}
            <DndContext
              id={`day-${day.id}-exercises-dnd`}
              sensors={exerciseSensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleExerciseDragEnd}
            >
              <SortableContext
                items={day.exercises.map((e) => e.exerciseId)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2">
                  {day.exercises.map((ex) => (
                    <ExerciseRow
                      key={ex.exerciseId}
                      ex={ex}
                      onChange={(patch) => onPatchExercise(ex.exerciseId, patch)}
                      onRemove={() => onRemoveExercise(ex.exerciseId)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Botones */}
          <div className="flex items-center gap-2">
            <button
              onClick={onAddExercise}
              className="flex-1 rounded-2xl border border-dashed border-border py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              + Añadir ejercicio
            </button>
            {canRemove && (
              <button
                onClick={onRemoveDay}
                aria-label="Eliminar dia"
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fila de ejercicio ───────────────────────────────────────────────────────
function ExerciseRow({
  ex,
  onChange,
  onRemove,
}: {
  ex: RoutineExercise;
  onChange: (patch: Partial<RoutineExercise>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { nombre } = getExerciseInfo(ex.exerciseId);
  const exercise = EX_MAP.get(ex.exerciseId);
  const img0 = exercise ? `${EXERCISE_IMG_BASE}/${exercise.fuenteId}/0.jpg` : null;
  const img1 = exercise ? `${EXERCISE_IMG_BASE}/${exercise.fuenteId}/1.jpg` : null;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ex.exerciseId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-2xl border bg-background overflow-hidden",
        isDragging
          ? "z-10 border-foreground/40 shadow-[0_12px_30px_-12px_rgba(23,24,28,0.35)]"
          : "border-border",
      )}
    >
      {/* Fila principal */}
      <div className="flex items-center gap-1 px-2 pt-3">
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Arrastra para reordenar el ejercicio"
          title="Arrastra para reordenar"
          className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </span>
        <p className="flex-1 text-sm font-medium leading-tight">{nombre}</p>
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex size-10 items-center justify-center rounded-full transition-colors",
            expanded ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          )}
          title="Más info"
        >
          <Info className="size-3.5" />
        </button>
        <button
          onClick={onRemove}
          aria-label={`Quitar ${nombre}`}
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Panel expandible — preview animado + instrucciones */}
      {expanded && exercise && (
        <div className="mt-2 border-t border-border mx-3 pt-2 pb-1">
          {/* Animación alternando los 2 frames */}
          {img0 && img1 && (
            <div className="relative mx-auto mb-3 aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted">
              <Image
                src={img0}
                alt={`${nombre} inicio`}
                fill
                className="object-cover [animation:ex-frame_1.2s_step-end_infinite]"
                unoptimized
              />
              <Image
                src={img1}
                alt={`${nombre} fin`}
                fill
                className="object-cover opacity-0 [animation:ex-frame-alt_1.2s_step-end_infinite]"
                unoptimized
              />
            </div>
          )}
          {/* Instrucciones */}
          {exercise.instrucciones.length > 0 && (
            <ol className="flex flex-col gap-1 pb-1">
              {exercise.instrucciones.map((step, i) => (
                <li key={i} className="flex gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono font-bold text-foreground">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Steppers */}
      <div className="flex items-center gap-3 px-3 pb-3 pt-2">
        <Stepper
          label="Series"
          value={ex.sets}
          min={1}
          max={10}
          onChange={(v) => onChange({ sets: v })}
        />
        <Stepper
          label="Reps"
          value={ex.reps}
          min={1}
          max={30}
          onChange={(v) => onChange({ reps: v })}
        />
      </div>
    </div>
  );
}


function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex size-10 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-95"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="w-8 text-center font-mono text-sm font-medium">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex size-10 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-95"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
