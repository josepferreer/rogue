"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Coffee, Cookie, Moon, Utensils } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { MealDetailSheet } from "@/components/food/meal-detail-sheet";
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
  const [openMeal, setOpenMeal] = useState<MealType | null>(null);

  const week = useMemo(() => buildWeek(selected), [selected]);
  const dayEntries = entriesForDay(selected);
  const totals = useMemo(() => sumMacros(dayEntries), [dayEntries]);

  const kcalPct = goals.kcal > 0 ? Math.min(100, (totals.kcal / goals.kcal) * 100) : 0;
  const kcalLeft = Math.max(0, Math.round(goals.kcal - totals.kcal));

  return (
    <div className="flex flex-col gap-5 pt-2 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comidas</h1>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          {formatDayLabel(selected).toUpperCase()}
        </p>
      </div>

      {/* Selector semanal */}
      <div className="flex gap-1.5">
        {week.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setSelected(d.key)}
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
          <span className="font-mono text-[11px] text-muted-foreground">
            quedan {kcalLeft}
          </span>
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
            onClick={() => setOpenMeal(type)}
            role="button"
            tabIndex={0}
            className="cursor-pointer rounded-3xl transition-transform active:scale-[0.99]"
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

      {openMeal && (
        <MealDetailSheet
          meal={openMeal}
          date={selected}
          onClose={() => setOpenMeal(null)}
        />
      )}
    </div>
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
