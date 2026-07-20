"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Coffee, Cookie, Moon, Utensils, Barcode, Book, X, CalendarDays, Pencil } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { Button } from "@/components/ui/button";
import { PantryModal } from "@/components/food/pantry-modal";
import { MealSheet } from "@/components/food/meal-sheet";
import { WeekPlannerModal } from "@/components/food/week-planner-modal";
import { NutritionGoalsModal } from "@/components/food/nutrition-goals-modal";
import { PantryProvider, usePantry } from "@/lib/store/pantry-store";
import { BarcodeScanner } from "@/components/food/barcode-scanner";
import { useToast } from "@/components/ui/toast";
import { parseOffIngredients } from "@/lib/food/ingredients";
import {
  dayKey,
  MEAL_TYPES,
  sumMacros,
  useMeals,
  type MealType,
} from "@/lib/store/meals-store";
import { cn } from "@/lib/utils";

const MEAL_META: Record<
  MealType,
  { variant: "lilac" | "blue" | "mint" | "neutral"; icon: typeof Coffee }
> = {
  desayuno: { variant: "lilac", icon: Coffee },
  comida: { variant: "blue", icon: Utensils },
  cena: { variant: "mint", icon: Moon },
  snack: { variant: "neutral", icon: Cookie },
};

const MACRO_COLORS = { protein: "#9fcdec", fat: "#cbbdf3", carbs: "#a3dcc0" };
const WEEKDAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

function buildWeek(selected: string) {
  const base = new Date(`${selected}T00:00:00`);
  const dow = (base.getDay() + 6) % 7; // 0 = lunes
  const monday = new Date(base);
  monday.setDate(base.getDate() - dow);
  const todayKey = dayKey();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = dayKey(d);
    return {
      key,
      letter: WEEKDAY_LETTERS[i],
      dayNum: d.getDate(),
      isSelected: key === selected,
      isToday: key === todayKey,
    };
  });
}

function formatDayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  const label = d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return key === dayKey() ? `Hoy · ${label}` : label;
}

export default function ComidasPage() {
  const { goals, entriesForDay } = useMeals();

  const [selected, setSelected] = useState(() => dayKey());
  const [pantryOpen, setPantryOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState<{ type: MealType; label: string } | null>(null);

  const week = useMemo(() => buildWeek(selected), [selected]);
  const dayEntries = entriesForDay(selected);
  const totals = useMemo(() => sumMacros(dayEntries.filter(e => e.eaten)), [dayEntries]);

  const kcalPct = goals.kcal > 0 ? Math.min(100, (totals.kcal / goals.kcal) * 100) : 0;
  const kcalLeft = Math.max(0, Math.round(goals.kcal - totals.kcal));

  return (
    <PantryProvider>
      <div className="flex flex-col gap-5 pt-2 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comidas</h1>
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            {formatDayLabel(selected).toUpperCase()}
          </p>
        </div>
        <button
          onClick={() => setPlannerOpen(true)}
          className="rounded-full bg-surface p-2.5 border border-border hover:bg-muted transition-colors"
          title="Planificador semanal"
        >
          <CalendarDays className="size-4" />
        </button>
      </div>

      {/* Selector semanal */}
      <div className="flex gap-1.5">
        {week.map((d) => (
          <div
            key={d.key}
            onClick={() => setSelected(d.key)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors cursor-pointer",
              d.isSelected
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="text-[11px]">{d.letter}</span>
            <span
              className={cn(
                "text-sm font-medium",
                d.isToday && !d.isSelected && "text-foreground",
              )}
            >
              {d.dayNum}
            </span>
          </div>
        ))}
      </div>

      {/* Resumen del dia / objetivo */}
      <div className="rounded-3xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <p>
            <span className="text-2xl font-semibold">
              {Math.round(totals.kcal)}
            </span>
            <span className="text-sm text-muted-foreground">
              {" "}
              / {goals.kcal} kcal
            </span>
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              quedan {kcalLeft}
            </span>
            <button
              type="button"
              onClick={() => setGoalsOpen(true)}
              aria-label="Editar objetivos"
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="my-2.5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${kcalPct}%` }}
          />
        </div>
        <div className="flex gap-2.5">
          <MacroBar
            label="Proteínas"
            value={totals.protein}
            goal={goals.protein}
            color={MACRO_COLORS.protein}
          />
          <MacroBar
            label="Grasas"
            value={totals.fat}
            goal={goals.fat}
            color={MACRO_COLORS.fat}
          />
          <MacroBar
            label="Hidratos"
            value={totals.carbs}
            goal={goals.carbs}
            color={MACRO_COLORS.carbs}
          />
        </div>
      </div>

      {/* Botones de acción (Escáner y Despensa) */}
      <PageActions setPantryOpen={setPantryOpen} />

      {/* Tarjetas por comida (resumen; se abren para ver el detalle) */}
      {MEAL_TYPES.map(({ type, label }) => {
        const meta = MEAL_META[type];
        const Icon = meta.icon;
        const items = dayEntries.filter((e) => e.mealType === type);
        const mealKcal = Math.round(sumMacros(items).kcal);
        return (
          <PastelCard
            key={type}
            variant={meta.variant}
            className="rounded-3xl transition-transform cursor-pointer active:scale-[0.98]"
            onClick={() => setActiveMeal({ type, label })}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="size-[18px]" />
                <span className="font-semibold">{label}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-sm opacity-80">
                  {items.length > 0 ? `${mealKcal} kcal` : "vacío"}
                </span>
                <ChevronRight className="size-4 opacity-60" />
              </div>
            </div>
            {items.length > 0 && (
              <p className="mt-1.5 truncate text-sm opacity-70">
                {items.map((e) => e.name).join(", ")}
              </p>
            )}
          </PastelCard>
        );
      })}

      <PantryModal open={pantryOpen} onClose={() => setPantryOpen(false)} />
      <NutritionGoalsModal open={goalsOpen} onClose={() => setGoalsOpen(false)} />
      <WeekPlannerModal open={plannerOpen} onClose={() => setPlannerOpen(false)} initialDate={selected} />
      <MealSheet
        open={!!activeMeal}
        onClose={() => setActiveMeal(null)}
        mealType={activeMeal?.type ?? "desayuno"}
        mealLabel={activeMeal?.label ?? ""}
        date={selected}
      />
      </div>
    </PantryProvider>
  );
}

function MacroBar({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
}) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="flex-1">
      <p className="mb-1 text-[11px] text-muted-foreground">
        {label} {Math.round(value)}/{goal}g
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function PageActions({ setPantryOpen }: { setPantryOpen: (v: boolean) => void }) {
  const { addAlimento } = usePantry();
  const { notify } = useToast();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  // Ingredientes + deteccion de "producto listo" del producto escaneado.
  const parsed = useMemo(() => parseOffIngredients(scannedProduct), [scannedProduct]);

  useEffect(() => {
    setPortalTarget(document.getElementById("app-shell"));
  }, []);

  const handleScan = async (barcode: string) => {
    setScannerOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
      const data = await res.json();
      if (data.status === 1 && data.product) {
        setScannedProduct(data.product);
      } else {
        notify("Producto no encontrado en la base de datos.", "error");
      }
    } catch {
      notify("Error al buscar el código de barras.", "error");
    } finally {
      setLoading(false);
    }
  };

  const saveAsAlimento = () => {
    if (!scannedProduct) return;
    const n = scannedProduct.nutriments;
    
    let healthScore: "green" | "yellow" | "orange" | "red" | undefined = undefined;
    if (scannedProduct.nutriscore_grade) {
      const grade = scannedProduct.nutriscore_grade.toLowerCase();
      if (grade === 'a' || grade === 'b') healthScore = "green";
      else if (grade === 'c') healthScore = "yellow";
      else if (grade === 'd') healthScore = "orange";
      else if (grade === 'e') healthScore = "red";
    }

    addAlimento({
      name: scannedProduct.product_name || "Desconocido",
      kcal: n?.["energy-kcal_100g"] || 0,
      protein: n?.["proteins_100g"] || 0,
      carbs: n?.["carbohydrates_100g"] || 0,
      fat: n?.["fat_100g"] || 0,
      healthScore,
      // Productos listos: guardamos la lista de ingredientes (informativa). Las
      // macros del producto entero (por 100 g) ya son correctas; los gramos por
      // ingrediente no los da OFF, se dejan en blanco.
      ingredients: parsed.ingredients.length > 0 ? parsed.ingredients : undefined,
    });
    setScannedProduct(null);
    notify(
      parsed.isReadyMeal
        ? "¡Producto listo guardado en la despensa!"
        : "¡Alimento guardado en la despensa!",
      "success",
    );
  };

  return (
    <>
      {scannerOpen && <BarcodeScanner onDetect={handleScan} onClose={() => setScannerOpen(false)} />}
      
      <div className="flex gap-2.5">
        <button 
          onClick={() => setScannerOpen(true)}
          disabled={loading}
          className="flex-1 rounded-2xl bg-surface px-4 py-3 font-semibold border border-border hover:bg-muted text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <Barcode className={cn("size-4", loading && "animate-pulse")} />
          Escáner
        </button>
        <button 
          onClick={() => setPantryOpen(true)}
          className="flex-1 rounded-2xl bg-surface px-4 py-3 font-semibold border border-border hover:bg-muted text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <Book className="size-4" />
          Despensa
        </button>
      </div>

      {scannedProduct && portalTarget && createPortal(
        <div
          className="absolute inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setScannedProduct(null)}
        >
          <div className="w-full px-5 md:w-full md:max-w-lg md:px-0">
            <div
              className="flex flex-col rounded-t-3xl border border-border bg-background shadow-2xl md:rounded-3xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pb-3 pt-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="font-semibold line-clamp-1">{scannedProduct.product_name || "Producto desconocido"}</p>
                  {parsed.isReadyMeal && (
                    <span className="w-fit rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                      Producto listo
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setScannedProduct(null)}
                  aria-label="Cerrar"
                  className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="px-5 pb-5 flex flex-col gap-4">
                <div className="flex gap-5 text-sm">
                  <div className="flex flex-col">
                    <span className="font-semibold">{scannedProduct.nutriments?.["energy-kcal_100g"] || 0}</span>
                    <span className="text-[10px] text-muted-foreground">Kcal/100g</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold">{scannedProduct.nutriments?.["proteins_100g"] || 0}g</span>
                    <span className="text-[10px] text-muted-foreground">Proteína</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold">{scannedProduct.nutriments?.["carbohydrates_100g"] || 0}g</span>
                    <span className="text-[10px] text-muted-foreground">Carbos</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold">{scannedProduct.nutriments?.["fat_100g"] || 0}g</span>
                    <span className="text-[10px] text-muted-foreground">Grasas</span>
                  </div>
                </div>

                {scannedProduct.nutriscore_grade && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Nutriscore:</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-[10px] font-bold text-white uppercase",
                      ['a', 'b'].includes(scannedProduct.nutriscore_grade.toLowerCase()) ? "bg-green-500" :
                      scannedProduct.nutriscore_grade.toLowerCase() === 'c' ? "bg-yellow-400 text-yellow-900" :
                      scannedProduct.nutriscore_grade.toLowerCase() === 'd' ? "bg-orange-500" :
                      "bg-red-500"
                    )}>
                      {scannedProduct.nutriscore_grade}
                    </span>
                  </div>
                )}

                {parsed.ingredients.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
                      INGREDIENTES
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsed.ingredients.map((ing, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-surface border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                          {ing}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground/70">
                      Gramos por ingrediente no disponibles en el producto.
                    </p>
                  </div>
                )}

                <Button fullWidth onClick={saveAsAlimento}>
                  {parsed.isReadyMeal ? "Guardar producto listo" : "Guardar alimento"}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        portalTarget
      )}
    </>
  );
}
