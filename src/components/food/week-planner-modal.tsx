"use client";

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppShellPortal } from "@/lib/use-app-shell-portal";
import { usePresence } from "@/lib/use-presence";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { useMeals, type MealType, MEAL_TYPES, dayKey, splitMacros } from "@/lib/store/meals-store";
import { MealSheet } from "@/components/food/meal-sheet";

const WEEKDAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];

function getMondayOf(dateStr: string): Date {
  const base = new Date(`${dateStr}T00:00:00`);
  const dow = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - dow);
  return monday;
}

function buildWeekDays(mondayDate: Date) {
  const today = dayKey();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayDate);
    d.setDate(mondayDate.getDate() + i);
    const key = dayKey(d);
    return { key, short: WEEKDAY_SHORT[i], num: d.getDate(), isToday: key === today };
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  initialDate: string;
};

export function WeekPlannerModal({ open, onClose, initialDate }: Props) {
  const { entriesForDay, ensureLoadedFrom, loadingOlder } = useMeals();
  const portalTarget = useAppShellPortal();
  const { mounted, state } = usePresence(open);
  useEscapeToClose(open, onClose);
  const [monday, setMonday] = useState<Date>(() => getMondayOf(initialDate));
  const [sheetTarget, setSheetTarget] = useState<{ date: string; mealType: MealType; mealLabel: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setMonday(getMondayOf(initialDate));
  }, [open, initialDate]);

  const days = useMemo(() => buildWeekDays(monday), [monday]);

  // Navegar semanas atras puede salirse de la ventana cargada del diario.
  useEffect(() => {
    if (open) ensureLoadedFrom(days[0].key);
  }, [open, days, ensureLoadedFrom]);

  const prevWeek = () => { const d = new Date(monday); d.setDate(monday.getDate() - 7); setMonday(d); };
  const nextWeek = () => { const d = new Date(monday); d.setDate(monday.getDate() + 7); setMonday(d); };

  const endDate = new Date(monday.getTime() + 6 * 86400000);
  const rangeLabel = `${monday.getDate()}/${monday.getMonth() + 1} – ${endDate.getDate()}/${endDate.getMonth() + 1}`;

  if (!mounted || !portalTarget) return null;

  const content = (
    <>
      <div
        className="overlay-anim scrim absolute inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center"
        data-state={state}
        onClick={onClose}
      >
        <div className="sheet-anim w-full md:max-w-2xl" data-state={state}>
          <div
            className="flex max-h-[90dvh] flex-col rounded-t-3xl border border-border bg-background shadow-2xl md:max-h-[85dvh] md:rounded-3xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
              <div className="flex items-center gap-3">
                <p className="font-semibold">Planificador Semanal</p>
                <span className="font-mono text-xs text-muted-foreground">{rangeLabel}</span>
                {/* Sin esto, una semana antigua aun sin traer se veria vacia
                    y parecia que no habias comido nada. */}
                {loadingOlder && (
                  <span className="font-mono text-xs text-muted-foreground/70 animate-pulse">
                    cargando…
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar planificador"
                className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Week nav */}
            <div className="flex items-center gap-2 px-5 pb-3">
              <button onClick={prevWeek} className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted transition-colors">
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex flex-1 gap-1">
                {days.map(d => (
                  <div key={d.key} className={cn("flex flex-1 flex-col items-center rounded-2xl py-1.5", d.isToday && "bg-accent")}>
                    <span className={cn("text-2xs", d.isToday ? "text-accent-foreground" : "text-muted-foreground")}>{d.short}</span>
                    <span className={cn("text-sm font-semibold", d.isToday ? "text-accent-foreground" : "text-foreground")}>{d.num}</span>
                  </div>
                ))}
              </div>
              <button onClick={nextWeek} className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted transition-colors">
                <ChevronRight className="size-4" />
              </button>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div className="flex flex-col gap-3">
                {MEAL_TYPES.map(({ type, label }) => (
                  <div key={type}>
                    <p className="mb-1.5 font-mono text-xs tracking-[0.2em] text-muted-foreground">{label.toUpperCase()}</p>
                    <div className="grid grid-cols-7 gap-1">
                      {days.map(d => {
                        const dayItems = entriesForDay(d.key).filter(e => e.mealType === type);
                        // Mismo criterio que el resto de la app: la cifra es lo
                        // comido; lo planificado va debajo, en gris.
                        const split = splitMacros(dayItems);
                        const kcal = Math.round(split.eaten.kcal);
                        const plannedKcal = Math.round(split.planned.kcal);
                        const hasItems = dayItems.length > 0;
                        return (
                          <button
                            key={d.key}
                            onClick={() => setSheetTarget({ date: d.key, mealType: type, mealLabel: label })}
                            className={cn(
                              "flex flex-col items-center justify-center rounded-2xl border border-border p-2 min-h-[56px] transition-all hover:border-accent cursor-pointer",
                              hasItems ? "bg-surface" : "bg-background",
                              d.isToday && "border-accent/50"
                            )}
                          >
                            {hasItems ? (
                              <>
                                <span className="text-2xs font-semibold leading-tight">{kcal}</span>
                                <span className="text-2xs text-muted-foreground">kcal</span>
                                <span className="text-2xs text-muted-foreground">
                                  {plannedKcal >= 1 ? `+${plannedKcal}` : `${dayItems.length}×`}
                                </span>
                              </>
                            ) : (
                              <Plus className="size-3.5 text-muted-foreground/50" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-sheet abre encima con z-[60] */}
      {sheetTarget && (
        <MealSheet
          open={!!sheetTarget}
          onClose={() => setSheetTarget(null)}
          mealType={sheetTarget.mealType}
          mealLabel={sheetTarget.mealLabel}
          date={sheetTarget.date}
        />
      )}
    </>
  );

  return createPortal(content, portalTarget);
}
