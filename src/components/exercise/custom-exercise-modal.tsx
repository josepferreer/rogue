"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  DIFFICULTY_IDS,
  EQUIPMENT_IDS,
  MUSCLE_IDS,
  type CustomExerciseInput,
} from "@/lib/exercises/custom";
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  EXERCISE_CATEGORIES,
  MUSCLE_LABELS,
  type MuscleId,
} from "@/lib/exercises/types";
import { useCustomExercises } from "@/lib/store/custom-exercises-store";
import { cn } from "@/lib/utils";

/**
 * Alta de un ejercicio propio.
 *
 * Los musculos no son decorativos: de ellos salen el mapa de calor y el calculo
 * de recuperacion muscular. Por eso son campos obligatorios y solo se pueden
 * elegir de la lista, nunca escribir a mano.
 */
export function CustomExerciseModal({
  open,
  onClose,
  initialName = "",
}: {
  open: boolean;
  onClose: () => void;
  initialName?: string;
}) {
  const { create } = useCustomExercises();
  const [form, setForm] = useState<CustomExerciseInput>({
    nombre: initialName,
    grupo: "Piernas",
    equipo: "maquina",
    dificultad: "principiante",
    mecanica: "compuesto",
    musculosPrimarios: [],
    musculosSecundarios: [],
    instrucciones: [],
    consejos: [],
  });
  const [instrucciones, setInstrucciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  // Los mismos topes que aplica validateCustomExercise. Sin esto el formulario
  // dejaba marcar los 17 musculos y la validacion recortaba a 4 en silencio: el
  // usuario guardaba y perdia parte de lo que habia elegido sin enterarse.
  const MAX_PRIMARIOS = 4;
  const MAX_SECUNDARIOS = 6;

  const toggleMuscle = (key: "musculosPrimarios" | "musculosSecundarios", m: MuscleId) => {
    setError(null);
    setForm((f) => {
      const list = f[key] ?? [];
      const quitando = list.includes(m);
      const tope = key === "musculosPrimarios" ? MAX_PRIMARIOS : MAX_SECUNDARIOS;
      if (!quitando && list.length >= tope) {
        setError(
          key === "musculosPrimarios"
            ? `Maximo ${MAX_PRIMARIOS} musculos principales.`
            : `Maximo ${MAX_SECUNDARIOS} musculos secundarios.`,
        );
        return f;
      }
      const next = quitando ? list.filter((x) => x !== m) : [...list, m];
      // Un musculo no puede ser principal y secundario a la vez.
      const other = key === "musculosPrimarios" ? "musculosSecundarios" : "musculosPrimarios";
      return {
        ...f,
        [key]: next,
        [other]: (f[other] ?? []).filter((x) => !next.includes(x)),
      };
    });
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await create({
        ...form,
        instrucciones: instrucciones
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo ejercicio</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-9 items-center justify-center rounded-full bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="mb-1 text-xs font-medium text-muted-foreground">Nombre</label>
        <input
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          placeholder="Sentadilla con cinturon en maquina"
          className="mb-4 rounded-2xl bg-muted px-4 py-3 text-sm outline-none"
        />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-medium text-muted-foreground">Grupo</label>
            <select
              value={form.grupo}
              onChange={(e) => setForm({ ...form, grupo: e.target.value })}
              className="rounded-2xl bg-muted px-3 py-3 text-sm outline-none"
            >
              {EXERCISE_CATEGORIES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-medium text-muted-foreground">Equipo</label>
            <select
              value={form.equipo}
              onChange={(e) => setForm({ ...form, equipo: e.target.value })}
              className="rounded-2xl bg-muted px-3 py-3 text-sm outline-none"
            >
              {EQUIPMENT_IDS.map((q) => (
                <option key={q} value={q}>{EQUIPMENT_LABELS[q]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-medium text-muted-foreground">Dificultad</label>
            <select
              value={form.dificultad}
              onChange={(e) => setForm({ ...form, dificultad: e.target.value })}
              className="rounded-2xl bg-muted px-3 py-3 text-sm outline-none"
            >
              {DIFFICULTY_IDS.map((d) => (
                <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-medium text-muted-foreground">Mecanica</label>
            <select
              value={form.mecanica}
              onChange={(e) => setForm({ ...form, mecanica: e.target.value })}
              className="rounded-2xl bg-muted px-3 py-3 text-sm outline-none"
            >
              <option value="compuesto">Compuesto</option>
              <option value="aislamiento">Aislamiento</option>
            </select>
          </div>
        </div>

        <MusclePicker
          label={`Musculos principales (${form.musculosPrimarios.length}/${MAX_PRIMARIOS})`}
          hint="Obligatorio. Alimentan el mapa de calor y la recuperacion muscular."
          selected={form.musculosPrimarios as MuscleId[]}
          onToggle={(m) => toggleMuscle("musculosPrimarios", m)}
        />
        <MusclePicker
          label={`Musculos secundarios (${(form.musculosSecundarios ?? []).length}/${MAX_SECUNDARIOS})`}
          selected={(form.musculosSecundarios ?? []) as MuscleId[]}
          onToggle={(m) => toggleMuscle("musculosSecundarios", m)}
        />

        <label className="mb-1 mt-4 text-xs font-medium text-muted-foreground">
          Instrucciones (una por linea, opcional)
        </label>
        <textarea
          value={instrucciones}
          onChange={(e) => setInstrucciones(e.target.value)}
          rows={3}
          className="mb-4 resize-none rounded-2xl bg-muted px-4 py-3 text-sm outline-none"
        />

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={saving || form.nombre.trim().length < 3 || form.musculosPrimarios.length === 0}
          className="rounded-full bg-foreground py-3.5 text-sm font-medium text-background disabled:opacity-40"
        >
          {saving ? "Guardando..." : "Crear ejercicio"}
        </button>
      </div>
    </div>
  );
}

function MusclePicker({
  label,
  hint,
  selected,
  onToggle,
}: {
  label: string;
  hint?: string;
  selected: MuscleId[];
  onToggle: (m: MuscleId) => void;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {hint && <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">
        {MUSCLE_IDS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onToggle(m)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs transition-colors",
              selected.includes(m)
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
            )}
          >
            {MUSCLE_LABELS[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
