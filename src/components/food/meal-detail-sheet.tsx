"use client";

import { useState } from "react";
import { Coffee, Cookie, Moon, Plus, Trash2, Utensils, X } from "lucide-react";
import { AddFoodSheet } from "@/components/food/add-food-sheet";
import {
  entryMacros,
  MEAL_TYPES,
  sumMacros,
  useMeals,
  type MealEntry,
  type MealType,
} from "@/lib/store/meals-store";

const MEAL_ICON: Record<MealType, typeof Coffee> = {
  desayuno: Coffee,
  comida: Utensils,
  cena: Moon,
  snack: Cookie,
};

export function MealDetailSheet({
  meal,
  date,
  onClose,
}: {
  meal: MealType;
  date: string;
  onClose: () => void;
}) {
  const { entriesForDay, addEntry, updateEntryQuantity, removeEntry } =
    useMeals();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MealEntry | null>(null);

  const items = entriesForDay(date).filter((e) => e.mealType === meal);
  const label = MEAL_TYPES.find((m) => m.type === meal)?.label ?? "";
  const Icon = MEAL_ICON[meal];
  const totalKcal = Math.round(sumMacros(items).kcal);

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
        <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="size-5" />
              <p className="text-lg font-semibold">{label}</p>
              {items.length > 0 && (
                <span className="font-mono text-sm text-muted-foreground">
                  · {totalKcal} kcal
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aún no has añadido nada a {label.toLowerCase()}.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {items.map((e) => {
                const m = entryMacros(e);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEditing(e)}
                    className="flex items-center justify-between gap-3 py-3 text-left active:opacity-70"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.quantityG} g
                        {e.protein100 !== null &&
                          ` · P ${Math.round((e.protein100 * e.quantityG) / 100)} G ${Math.round(((e.fat100 ?? 0) * e.quantityG) / 100)} H ${Math.round(((e.carbs100 ?? 0) * e.quantityG) / 100)}`}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm tabular-nums">
                      {Math.round(m.kcal)} kcal
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-sm font-medium text-accent-foreground active:scale-[0.99]"
          >
            <Plus className="size-4" />
            Añadir alimento
          </button>
        </div>
      </div>

      {adding && (
        <AddFoodSheet
          defaultMeal={meal}
          date={date}
          onAdd={(entry) => {
            addEntry(entry);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <EditEntrySheet
          entry={editing}
          onSave={(grams) => {
            updateEntryQuantity(editing.id, grams);
            setEditing(null);
          }}
          onDelete={() => {
            removeEntry(editing.id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditEntrySheet({
  entry,
  onSave,
  onDelete,
  onClose,
}: {
  entry: MealEntry;
  onSave: (grams: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [grams, setGrams] = useState(String(entry.quantityG));
  const qty = Math.max(0, Number(grams) || 0);
  const kcal =
    entry.kcal100 === null ? null : Math.round((entry.kcal100 * qty) / 100);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="min-w-0 truncate font-semibold">{entry.name}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
          CANTIDAD
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="w-24 rounded-xl bg-muted/60 px-3 py-2.5 text-center text-lg font-medium outline-none"
          />
          <span className="text-sm text-muted-foreground">gramos</span>
          <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
            {kcal === null ? "—" : `${kcal} kcal`}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive active:scale-95"
            aria-label="Eliminar"
          >
            <Trash2 className="size-5" />
          </button>
          <button
            type="button"
            disabled={qty <= 0}
            onClick={() => onSave(qty)}
            className="flex-1 rounded-full bg-accent py-3.5 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-40"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
