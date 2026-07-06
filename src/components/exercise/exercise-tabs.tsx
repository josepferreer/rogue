"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const TABS = ["Instrucciones", "Tus stats", "Historial"] as const;
type TabId = (typeof TABS)[number];

type ExerciseTabsProps = {
  instrucciones: ReactNode;
  stats: ReactNode;
  historial: ReactNode;
};

/** Tabs estilo Liftoff de la ficha de ejercicio. */
export function ExerciseTabs({
  instrucciones,
  stats,
  historial,
}: ExerciseTabsProps) {
  const [active, setActive] = useState<TabId>("Instrucciones");

  const content: Record<TabId, ReactNode> = {
    Instrucciones: instrucciones,
    "Tus stats": stats,
    Historial: historial,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-2xl border border-border bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={cn(
              "flex-1 rounded-xl py-2 text-xs font-medium transition-colors",
              active === tab
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      <div>{content[active]}</div>
    </div>
  );
}
