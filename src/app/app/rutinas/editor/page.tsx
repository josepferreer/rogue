"use client";

import { useState, useCallback, useEffect } from "react";
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
import { getExerciseByIdSync, getExerciseImages } from "@/lib/exercises/repo";
import { ExerciseSelectorModal } from "@/components/routines/exercise-selector-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  type RoutineDay,
  type RoutineExercise,
  type WeightUnit,
} from "@/lib/workout/types";
import type { Exercise } from "@/lib/exercises/types";
import { fromKg, toKg } from "@/lib/units";
import { useBackButton } from "@/lib/use-back-button";
import { cn } from "@/lib/utils";

/** Id de dia nuevo. UUID de verdad (no un random de 6 caracteres) porque
 *  save_routine solo conserva el id del cliente si es un UUID valido; asi un
 *  dia mantiene su identidad entre guardados en vez de recrearse cada vez. */
function genId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ConstructorPage() {
  const router = useRouter();
  const { routineDays, saveRoutine, preferences } = useRogue();

  // Deep clone para edicion local
  const [days, setDays] = useState<RoutineDay[]>(() =>
    routineDays.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e })) }))
  );
  const [expandedDay, setExpandedDay] = useState<string>(days[0]?.id ?? "");
  const [selectorForDay, setSelectorForDay] = useState<string | null>(null);
  // Dia pendiente de confirmacion antes de borrarlo.
  const [confirmRemoveDay, setConfirmRemoveDay] = useState<RoutineDay | null>(null);
  // Confirmacion antes de salir con cambios sin guardar.
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Instantanea de como estaba la rutina al entrar. Comparar contra ella (y no
  // contra routineDays, que cambia al guardar) permite saber si hay cambios
  // pendientes: antes salir del editor los descartaba en silencio y un usuario
  // que hubiera configurado varios dias los perdia enteros por pulsar "atras".
  const [initialSnapshot] = useState(() => JSON.stringify(routineDays));
  const isDirty = JSON.stringify(days) !== initialSnapshot;

  const leave = useCallback(() => router.push("/app/rutinas"), [router]);
  const requestLeave = useCallback(() => {
    if (isDirty) setConfirmDiscard(true);
    else leave();
  }, [isDirty, leave]);

  // El boton/gesto "atras" de Android tambien pasa por la confirmacion.
  useBackButton(isDirty, requestLeave);

  // Y el cierre de pestana/recarga en web.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

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
    leave();
  };

  return (
    <div className="flex flex-col gap-5 pt-2">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <button
          onClick={requestLeave}
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
                unit={preferences.unit}
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
        open={confirmDiscard}
        title="¿Salir sin guardar?"
        description="Se perderán los cambios que has hecho en la rutina."
        confirmLabel="Salir sin guardar"
        onConfirm={() => {
          setConfirmDiscard(false);
          leave();
        }}
        onCancel={() => setConfirmDiscard(false)}
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
  unit,
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
  unit: WeightUnit;
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
          ? "z-10 border-foreground/40 shadow-drag"
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
          className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
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
            <p className="font-mono text-xs text-muted-foreground">
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
              <label className="font-mono text-2xs text-muted-foreground">
                NOMBRE
              </label>
              <input
                value={day.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-2xs text-muted-foreground">
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
            <label className="font-mono text-2xs text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">
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
                      unit={unit}
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
  unit,
  onChange,
  onRemove,
}: {
  ex: RoutineExercise;
  unit: WeightUnit;
  onChange: (patch: Partial<RoutineExercise>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { nombre } = getExerciseInfo(ex.exerciseId);
  const exercise = getExerciseByIdSync(ex.exerciseId);
  const images = getExerciseImages(exercise);
  const img0 = images?.[0] ?? null;
  const img1 = images?.[1] ?? null;

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
          className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
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
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="font-mono font-bold text-foreground">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Steppers. Descanso y peso sugerido existian en el modelo y en la BD
          pero no habia forma de tocarlos desde la UI: todo el mundo entrenaba
          con 90 s fijos y con el peso sin prellenar. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 pb-3 pt-2">
        <Stepper
          label="Series"
          value={ex.sets}
          min={1}
          max={20}
          onChange={(v) => onChange({ sets: v })}
        />
        <Stepper
          label="Reps"
          value={ex.reps}
          min={1}
          max={100}
          onChange={(v) => onChange({ reps: v })}
        />
        <Stepper
          label="Descanso"
          value={ex.restSec}
          min={0}
          max={600}
          step={15}
          format={formatRest}
          onChange={(v) => onChange({ restSec: v })}
        />
        <Stepper
          label={`Peso (${unit})`}
          value={Math.round(fromKg(ex.suggestedKg, unit) * 10) / 10}
          min={0}
          max={unit === "kg" ? 500 : 1100}
          step={2.5}
          format={(v) => (v === 0 ? "—" : String(v))}
          onChange={(v) => onChange({ suggestedKg: toKg(v, unit) })}
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
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Incremento por pulsacion. 1 para series/reps, 15 s para descanso, 2,5 para peso. */
  step?: number;
  /** Como se pinta el valor (p.ej. 90 -> "1:30"). Por defecto, el numero. */
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  // Redondeo al multiplo del paso para que sumar/restar no arrastre decimales
  // (0,1 + 0,2) ni deje valores fuera de la rejilla al venir de datos antiguos.
  const clamp = (v: number) =>
    Math.min(max, Math.max(min, Math.round(v / step) * step));

  return (
    <div className="flex flex-1 flex-col gap-1">
      <span className="font-mono text-2xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          aria-label={`Reducir ${label.toLowerCase()}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-95"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="min-w-[3rem] flex-1 text-center font-mono text-sm font-medium tabular-nums">
          {format ? format(value) : value}
        </span>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          aria-label={`Aumentar ${label.toLowerCase()}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-95"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** 90 -> "1:30", 45 -> "45s". Descansos tipicos van de 30 s a 5 min. */
function formatRest(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, "0")}`;
}
