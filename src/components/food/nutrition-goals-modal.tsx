"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMeals, type NutritionGoals } from "@/lib/store/meals-store";
import { usePresence, type PresenceState } from "@/lib/use-presence";

const subscribeNever = () => () => {};

type Props = { open: boolean; onClose: () => void };

/** Edicion de los objetivos diarios (kcal y macros). Persisten en
 *  nutrition_goals via setGoals; hasta ahora no habia forma de cambiarlos. */
export function NutritionGoalsModal({ open, onClose }: Props) {
  const { goals, setGoals } = useMeals();
  const hidratado = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  // Mantiene la hoja montada mientras baja al cerrarse.
  const { mounted, state } = usePresence(open);

  if (!mounted || !hidratado) return null;
  const portalTarget = document.getElementById("app-shell");
  if (!portalTarget) return null;

  return createPortal(
    // GoalsSheet se monta de cero en cada apertura: el borrador se inicializa
    // desde los objetivos actuales sin efectos.
    <GoalsSheet
      state={state}
      goals={goals}
      onSave={(next) => {
        setGoals(next);
        onClose();
      }}
      onClose={onClose}
    />,
    portalTarget,
  );
}

const FIELDS: { key: keyof NutritionGoals; label: string; unit: string }[] = [
  { key: "kcal", label: "Calorías", unit: "kcal" },
  { key: "protein", label: "Proteínas", unit: "g" },
  { key: "fat", label: "Grasas", unit: "g" },
  { key: "carbs", label: "Hidratos", unit: "g" },
];

function GoalsSheet({
  goals,
  onSave,
  onClose,
  state,
}: {
  goals: NutritionGoals;
  onSave: (next: NutritionGoals) => void;
  onClose: () => void;
  state: PresenceState;
}) {
  const [draft, setDraft] = useState<Record<keyof NutritionGoals, string>>(() => ({
    kcal: String(goals.kcal),
    protein: String(goals.protein),
    fat: String(goals.fat),
    carbs: String(goals.carbs),
  }));

  const parsed = Object.fromEntries(
    FIELDS.map(({ key }) => [key, Number(draft[key])]),
  ) as NutritionGoals;
  const valid = FIELDS.every(({ key }) => Number.isFinite(parsed[key]) && parsed[key] > 0);

  const handleSave = () => {
    if (!valid) return;
    onSave({
      kcal: Math.round(parsed.kcal),
      protein: Math.round(parsed.protein),
      fat: Math.round(parsed.fat),
      carbs: Math.round(parsed.carbs),
    });
  };

  return (
    <div
      className="overlay-anim scrim absolute inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center"
      data-state={state}
      onClick={onClose}
    >
      <div className="sheet-anim w-full md:max-w-lg" data-state={state}>
        <div
          className="flex flex-col rounded-t-3xl border border-border bg-background shadow-2xl md:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <div>
              <p className="font-semibold">Objetivos diarios</p>
              <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                KCAL Y MACROS
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2.5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {FIELDS.map(({ key, label, unit }) => (
              <label
                key={key}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
              >
                <span className="flex-1 text-sm">{label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={draft[key]}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-24 rounded-xl border border-border bg-background px-3 py-1.5 text-right text-sm outline-none"
                />
                <span className="w-8 text-xs text-muted-foreground">{unit}</span>
              </label>
            ))}

            <Button fullWidth onClick={handleSave} disabled={!valid} className="mt-2">
              Guardar objetivos
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
