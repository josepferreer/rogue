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
import { useRogue, getExerciseInfo } from "@/lib/store/rogue-store";
import { DEMO_EXERCISES, EXERCISE_IMG_BASE } from "@/lib/exercises/repo";
import { ExerciseSelectorModal } from "@/components/routines/exercise-selector-modal";
import type { RoutineDay, RoutineExercise } from "@/lib/workout/types";
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

  const handleSave = () => {
    saveRoutine(days);
    router.push("/rutinas");
  };

  return (
    <div className="flex flex-col gap-5 pt-2 pb-28">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Cancelar
        </button>
        <h1 className="text-base font-semibold">Constructor</h1>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background"
        >
          <Check className="size-3.5" />
          Guardar
        </button>
      </div>

      {/* Lista de días */}
      <div className="flex flex-col gap-3">
        {days.map((day, idx) => {
          const isOpen = expandedDay === day.id;
          return (
            <div
              key={day.id}
              className="rounded-3xl border border-border bg-surface overflow-hidden"
            >
              {/* Día header */}
              <button
                className="flex w-full items-center gap-3 px-4 py-4"
                onClick={() => setExpandedDay(isOpen ? "" : day.id)}
              >
                <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold">{day.label}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {day.exercises.length} ejercicios · {day.focus}
                  </p>
                </div>
                {isOpen ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </button>

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
                        onChange={(e) => updateDay(day.id, { label: e.target.value })}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-mono text-[10px] text-muted-foreground">
                        ENFOQUE
                      </label>
                      <input
                        value={day.focus}
                        onChange={(e) => updateDay(day.id, { focus: e.target.value })}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
                      />
                    </div>
                  </div>

                  {/* Ejercicios */}
                  <div className="flex flex-col gap-2">
                    {day.exercises.length === 0 && (
                      <p className="py-2 text-center text-xs text-muted-foreground">
                        Sin ejercicios todavía
                      </p>
                    )}
                    {day.exercises.map((ex) => (
                      <ExerciseRow
                        key={ex.exerciseId}
                        ex={ex}
                        onChange={(patch) => patchExercise(day.id, ex.exerciseId, patch)}
                        onRemove={() => removeExercise(day.id, ex.exerciseId)}
                      />
                    ))}
                  </div>

                  {/* Botones */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectorForDay(day.id)}
                      className="flex-1 rounded-2xl border border-dashed border-border py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      + Añadir ejercicio
                    </button>
                    {days.length > 1 && (
                      <button
                        onClick={() => removeDay(day.id)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-border text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

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

  return (
    <div className="rounded-2xl border border-border bg-background overflow-hidden">
      {/* Fila principal */}
      <div className="flex items-center gap-2 px-3 pt-3">
        <p className="flex-1 text-sm font-medium leading-tight">{nombre}</p>
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex size-6 items-center justify-center rounded-full transition-colors",
            expanded ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          )}
          title="Más info"
        >
          <Info className="size-3.5" />
        </button>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <X className="size-3.5" />
        </button>
      </div>

      {/* Panel expandible — preview animado + instrucciones */}
      {expanded && exercise && (
        <div className="mt-2 border-t border-border mx-3 pt-2 pb-1">
          {/* Animación alternando los 2 frames */}
          {img0 && img1 && (
            <div className="relative mx-auto mb-3 h-36 w-full overflow-hidden rounded-xl bg-muted">
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
          className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
        >
          <Minus className="size-3" />
        </button>
        <span className="w-8 text-center font-mono text-sm font-medium">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}
