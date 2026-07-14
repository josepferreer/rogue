"use client";

import { useState } from "react";
import { Check, Loader2, ScanBarcode, X } from "lucide-react";
import { BarcodeScanner } from "@/components/food/barcode-scanner";
import type { FoodProduct } from "@/lib/food/types";
import {
  MEAL_TYPES,
  type MealType,
  type NewMealEntry,
} from "@/lib/store/meals-store";
import { cn } from "@/lib/utils";

/** Extrae los gramos de un texto de racion de OFF ("15 g", "30g") o null. */
function parseServingGrams(serving: string | null): number | null {
  if (!serving) return null;
  const m = serving.match(/([\d.,]+)\s*g/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const numOrNull = (s: string): number | null => {
  const n = Number(s.replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function AddFoodSheet({
  defaultMeal,
  date,
  onAdd,
  onClose,
}: {
  defaultMeal: MealType;
  date: string;
  onAdd: (entry: NewMealEntry) => void;
  onClose: () => void;
}) {
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [grams, setGrams] = useState("100");

  const [scanning, setScanning] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const qty = Math.max(0, Number(grams) || 0);
  const f = qty / 100;
  const kcal100 = numOrNull(kcal);
  const previewKcal = kcal100 === null ? null : Math.round(kcal100 * f);
  const canAdd = name.trim() !== "" && kcal100 !== null && qty > 0;

  function fillFromProduct(p: FoodProduct) {
    setName(p.name);
    setBrand(p.brand);
    setBarcode(p.barcode);
    setKcal(p.kcal100 === null ? "" : String(p.kcal100));
    setProtein(p.protein100 === null ? "" : String(p.protein100));
    setFat(p.fat100 === null ? "" : String(p.fat100));
    setCarbs(p.carbs100 === null ? "" : String(p.carbs100));
    const serving = parseServingGrams(p.servingSize);
    if (serving) setGrams(String(serving));
  }

  async function lookup(code: string) {
    setScanning(false);
    setScanError(null);
    setScanLoading(true);
    const clean = code.replace(/\D/g, "");
    try {
      const res = await fetch(`/api/food/${clean}`);
      if (!res.ok) {
        setScanError("Ese código no está en Open Food Facts. Introdúcelo a mano.");
        return;
      }
      const data = (await res.json()) as { product: FoodProduct };
      fillFromProduct(data.product);
    } catch {
      setScanError("No se pudo consultar. Introdúcelo a mano.");
    } finally {
      setScanLoading(false);
    }
  }

  function handleAdd() {
    if (!canAdd) return;
    onAdd({
      date,
      mealType: meal,
      name: name.trim(),
      brand,
      barcode,
      quantityG: qty,
      kcal100,
      protein100: numOrNull(protein),
      fat100: numOrNull(fat),
      carbs100: numOrNull(carbs),
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
        <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-semibold">Añadir alimento</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {MEAL_TYPES.map((m) => (
              <button
                key={m.type}
                type="button"
                onClick={() => setMeal(m.type)}
                className={cn(
                  "rounded-xl py-2 text-xs font-medium transition-colors",
                  meal === m.type
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted/60 text-muted-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setScanError(null);
              setScanning(true);
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 py-3 text-sm font-medium active:scale-[0.99]"
          >
            {scanLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ScanBarcode className="size-4" />
            )}
            {scanLoading ? "Buscando…" : "Escanear código de barras"}
          </button>
          {scanError && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {scanError}
            </p>
          )}

          <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />o introdúcelo a mano
            <span className="h-px flex-1 bg-border" />
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del alimento"
            className="w-full rounded-xl bg-muted/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {brand && (
            <p className="mt-1 px-1 text-xs text-muted-foreground">{brand}</p>
          )}

          <p className="mt-4 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
            VALORES POR 100 G
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <MacroInput label="Energía (kcal)" value={kcal} onChange={setKcal} />
            <MacroInput label="Proteínas (g)" value={protein} onChange={setProtein} />
            <MacroInput label="Grasas (g)" value={fat} onChange={setFat} />
            <MacroInput label="Hidratos (g)" value={carbs} onChange={setCarbs} />
          </div>

          <p className="mt-4 font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
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
              {previewKcal === null ? "—" : `${previewKcal} kcal`}
            </span>
          </div>

          <button
            type="button"
            disabled={!canAdd}
            onClick={handleAdd}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-40"
          >
            Añadir al diario
            <Check className="size-4" />
          </button>
        </div>
      </div>

      {scanning && (
        <BarcodeScanner onDetect={lookup} onClose={() => setScanning(false)} />
      )}
    </>
  );
}

function MacroInput({
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
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full bg-transparent font-mono text-sm outline-none"
      />
    </label>
  );
}
