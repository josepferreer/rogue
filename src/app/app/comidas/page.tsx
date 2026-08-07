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
import { lookupBarcode, lookupErrorMessage } from "@/lib/food/lookup";
import type { FoodProduct } from "@/lib/food/types";
import {
  dayKey,
  MEAL_TYPES,
  splitMacros,
  useMeals,
  type MealType,
} from "@/lib/store/meals-store";
import { cn } from "@/lib/utils";
import { useAppShellPortal } from "@/lib/use-app-shell-portal";

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
  const { goals, entriesForDay, ensureLoadedFrom } = useMeals();

  const [selected, setSelected] = useState(() => dayKey());
  const [pantryOpen, setPantryOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState<{ type: MealType; label: string } | null>(null);

  const week = useMemo(() => buildWeek(selected), [selected]);

  // El diario se carga en una ventana de 3 meses; al elegir un dia anterior
  // hay que pedir el tramo que falte antes de pintarlo como vacio.
  useEffect(() => {
    ensureLoadedFrom(week[0].key);
  }, [week, ensureLoadedFrom]);

  const dayEntries = entriesForDay(selected);
  const { eaten: totals, planned } = useMemo(() => splitMacros(dayEntries), [dayEntries]);

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
          // <button> y no <div>: la tira de dias se navega con teclado y los
          // lectores de pantalla tienen que anunciar cual esta elegido.
          <button
            key={d.key}
            type="button"
            onClick={() => setSelected(d.key)}
            aria-pressed={d.isSelected}
            aria-label={formatDayLabel(d.key)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors",
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
          </button>
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
              {planned.kcal >= 1 && (
                <span className="opacity-60"> · +{Math.round(planned.kcal)} sin marcar</span>
              )}
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
        // Mismo criterio que el resumen del dia: la cifra es lo comido y lo
        // que sigue sin marcar se muestra aparte, no sumado.
        const split = splitMacros(items);
        const mealKcal = Math.round(split.eaten.kcal);
        const plannedKcal = Math.round(split.planned.kcal);
        return (
          <PastelCard
            key={type}
            as="button"
            variant={meta.variant}
            className="rounded-3xl transition-transform active:scale-[0.98]"
            onClick={() => setActiveMeal({ type, label })}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="size-[18px]" />
                <span className="font-semibold">{label}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-sm opacity-80">
                  {items.length === 0
                    ? "vacío"
                    : plannedKcal >= 1
                      ? `${mealKcal} kcal · +${plannedKcal}`
                      : `${mealKcal} kcal`}
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
  const { addAlimento, addPlato } = usePantry();
  const { notify } = useToast();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<FoodProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const portalTarget = useAppShellPortal();

  // El codigo de barras se resuelve SIEMPRE en el servidor (`/api/food/...`):
  // sesion, limite de peticiones y solo los campos que usamos.
  const handleScan = async (barcode: string) => {
    setScannerOpen(false);
    setLoading(true);
    const result = await lookupBarcode(barcode);
    setLoading(false);
    if (!result.ok) {
      notify(lookupErrorMessage(result.reason), "error");
      return;
    }
    setScannedProduct(result.product);
    if (result.product.kcal100 == null) {
      notify("Open Food Facts no da las calorías de este producto: revísalas.", "info");
    }
  };

  // Macros por 100 g + healthScore comunes a ambos tipos de guardado.
  const productMacros = (p: FoodProduct) => ({
    name: p.name,
    kcal: p.kcal100 ?? 0,
    protein: p.protein100 ?? 0,
    carbs: p.carbs100 ?? 0,
    fat: p.fat100 ?? 0,
    healthScore: p.healthScore ?? undefined,
    ingredients: p.ingredients.length > 0 ? p.ingredients : undefined,
    servingG: p.servingG > 0 ? p.servingG : undefined,
  });

  const saveAsAlimento = () => {
    if (!scannedProduct) return;
    addAlimento(productMacros(scannedProduct));
    setScannedProduct(null);
    notify("¡Alimento guardado en la despensa!", "success");
  };

  // Plato "listo": guarda las macros del producto POR 100 G y sus ingredientes,
  // con foods vacio (no hay ingredientes enlazables a la despensa). Se registra
  // por gramos como un alimento, pero vive en la pestana Platos.
  const saveAsPlato = () => {
    if (!scannedProduct) return;
    const m = productMacros(scannedProduct);
    addPlato({
      name: m.name,
      kcal: m.kcal,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
      foods: [],
      ingredients: m.ingredients,
      servingG: m.servingG,
      healthScore: m.healthScore,
    });
    setScannedProduct(null);
    notify("¡Plato listo guardado en la despensa!", "success");
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
          <div className="w-full md:max-w-lg">
            <div
              className="flex flex-col rounded-t-3xl border border-border bg-background shadow-2xl md:rounded-3xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pb-3 pt-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="font-semibold line-clamp-1">{scannedProduct.name}</p>
                  {scannedProduct.brand && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{scannedProduct.brand}</p>
                  )}
                  {scannedProduct.isReadyMeal && (
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
                    <span className="font-semibold">{scannedProduct.kcal100 ?? "—"}</span>
                    <span className="text-[10px] text-muted-foreground">Kcal/100g</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold">{scannedProduct.protein100 ?? 0}g</span>
                    <span className="text-[10px] text-muted-foreground">Proteína</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold">{scannedProduct.carbs100 ?? 0}g</span>
                    <span className="text-[10px] text-muted-foreground">Carbos</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold">{scannedProduct.fat100 ?? 0}g</span>
                    <span className="text-[10px] text-muted-foreground">Grasas</span>
                  </div>
                </div>

                {scannedProduct.kcal100 == null && (
                  <p className="text-[11px] text-muted-foreground">
                    Open Food Facts no declara las calorías de este producto. Se
                    guardará a 0 kcal: edítalo en la despensa.
                  </p>
                )}

                {scannedProduct.nutriscore && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Nutriscore:</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-[10px] font-bold text-white uppercase",
                      scannedProduct.healthScore === "green" ? "bg-green-500" :
                      scannedProduct.healthScore === "yellow" ? "bg-yellow-400 text-yellow-900" :
                      scannedProduct.healthScore === "orange" ? "bg-orange-500" :
                      "bg-red-500"
                    )}>
                      {scannedProduct.nutriscore}
                    </span>
                  </div>
                )}

                {scannedProduct.ingredients.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
                      INGREDIENTES{scannedProduct.servingG > 0 && ` · RACIÓN ${scannedProduct.servingG} G`}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {scannedProduct.ingredients.map((ing, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-surface border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                          {ing.grams != null && (
                            <span className="font-medium text-foreground">{ing.grams}g </span>
                          )}
                          {ing.name}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground/70">
                      Los gramos, cuando aparecen, están estimados a partir del % declarado.
                    </p>
                  </div>
                )}

                {/* La opcion sugerida por la deteccion va primero/destacada; la
                    otra queda como alternativa por si el usuario discrepa. */}
                <div className="flex flex-col gap-2">
                  {scannedProduct.isReadyMeal ? (
                    <>
                      <Button fullWidth onClick={saveAsPlato}>
                        Guardar como plato listo
                      </Button>
                      <Button variant="secondary" fullWidth onClick={saveAsAlimento}>
                        Guardar como alimento
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button fullWidth onClick={saveAsAlimento}>
                        Guardar como alimento
                      </Button>
                      <Button variant="secondary" fullWidth onClick={saveAsPlato}>
                        Guardar como plato listo
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        portalTarget
      )}
    </>
  );
}
