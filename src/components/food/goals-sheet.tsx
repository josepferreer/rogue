"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { NutritionGoals } from "@/lib/store/meals-store";

const toNum = (s: string) => Math.max(0, Math.round(Number(s) || 0));

export function GoalsSheet({
  goals,
  onSave,
  onClose,
}: {
  goals: NutritionGoals;
  onSave: (goals: NutritionGoals) => void;
  onClose: () => void;
}) {
  const [kcal, setKcal] = useState(String(goals.kcal));
  const [protein, setProtein] = useState(String(goals.protein));
  const [fat, setFat] = useState(String(goals.fat));
  const [carbs, setCarbs] = useState(String(goals.carbs));

  // kcal implicadas por los macros (P/C = 4 kcal/g, G = 9 kcal/g), como guia.
  const kcalFromMacros =
    toNum(protein) * 4 + toNum(carbs) * 4 + toNum(fat) * 9;

  const canSave = toNum(kcal) > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-semibold">Objetivos diarios</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3">
          <span className="text-sm">Calorías (kcal)</span>
          <input
            type="number"
            inputMode="numeric"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            className="w-24 bg-transparent text-right font-mono text-lg font-medium outline-none"
          />
        </label>

        <p className="mt-4 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
          MACROS (g)
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <GoalInput label="Proteínas" value={protein} onChange={setProtein} />
          <GoalInput label="Grasas" value={fat} onChange={setFat} />
          <GoalInput label="Hidratos" value={carbs} onChange={setCarbs} />
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Tus macros suman ~{kcalFromMacros} kcal
        </p>

        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              kcal: toNum(kcal),
              protein: toNum(protein),
              fat: toNum(fat),
              carbs: toNum(carbs),
            })
          }
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-40"
        >
          Guardar objetivos
          <Check className="size-4" />
        </button>
      </div>
    </div>
  );
}

function GoalInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 rounded-2xl bg-muted/60 px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full bg-transparent font-mono text-sm outline-none"
      />
    </label>
  );
}
