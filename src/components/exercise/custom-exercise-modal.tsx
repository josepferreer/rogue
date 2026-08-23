"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/exercise/exercise-filter-bar";
import { useAppShellPortal } from "@/lib/use-app-shell-portal";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { usePresence } from "@/lib/use-presence";
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

  // Mismo andamiaje que el resto de hojas de la app: portal del AppShell para
  // que el scrim tape la barra inferior, animacion de entrada/salida y cierre
  // con Escape. Antes era un fixed suelto sin nada de esto.
  const portalTarget = useAppShellPortal();
  const { mounted, state } = usePresence(open);
  useEscapeToClose(open, onClose);
  const panelRef = useFocusTrap<HTMLDivElement>(open);

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

  if (!mounted || !portalTarget) return null;

  const content = (
    <div
      className="overlay-anim scrim absolute inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center"
      data-state={state}
      onClick={onClose}
    >
      <div className="sheet-anim w-full md:max-w-lg" data-state={state}>
        <div
          ref={panelRef}
          tabIndex={-1}
          className="flex max-h-[90dvh] flex-col rounded-t-3xl border border-border bg-background shadow-2xl md:max-h-[85dvh] md:rounded-3xl overflow-y-auto p-5"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Nuevo ejercicio</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-10 items-center justify-center rounded-full bg-surface transition-colors hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="mb-1 text-xs font-medium text-muted-foreground">Nombre</label>
        <input
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          placeholder="Sentadilla con cinturon en maquina"
          className="mb-4 rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-foreground"
        />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-medium text-muted-foreground">Grupo</label>
            <select
              value={form.grupo}
              onChange={(e) => setForm({ ...form, grupo: e.target.value })}
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-foreground"
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
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-foreground"
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
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-foreground"
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
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-foreground"
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
          className="mb-4 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-foreground"
        />

        {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

        <Button
          fullWidth
          onClick={submit}
          disabled={
            saving ||
            form.nombre.trim().length < 3 ||
            form.musculosPrimarios.length === 0
          }
        >
          {saving ? "Guardando..." : "Crear ejercicio"}
        </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, portalTarget);
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
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">
        {MUSCLE_IDS.map((m) => (
          <Chip
            key={m}
            active={selected.includes(m)}
            onClick={() => onToggle(m)}
          >
            {MUSCLE_LABELS[m]}
          </Chip>
        ))}
      </div>
    </div>
  );
}
