"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Segmentado de unidades (kg / lb). Demo local hasta tener backend. */
export function UnitToggle() {
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const options = [
    { value: "kg", label: "Kilogramos" },
    { value: "lb", label: "Libras" },
  ] as const;

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border bg-muted/60 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setUnit(option.value)}
          className={cn(
            "flex-1 rounded-xl px-3 py-2 text-sm transition-colors",
            unit === option.value
              ? "bg-surface text-foreground shadow-sm dark:bg-neutral-700"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Fila con interruptor on/off. Demo local hasta tener backend. */
export function SwitchRow({
  label,
  description,
  defaultOn = false,
}: {
  label: string;
  description?: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(defaultOn);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn((v) => !v)}
        className="flex h-6 w-11 shrink-0 items-center rounded-full border border-border bg-muted px-[3px] transition-colors"
      >
        <span
          className={cn(
            "size-4 rounded-full shadow-sm transition-transform duration-200",
            on ? "translate-x-5 bg-foreground" : "translate-x-0 bg-muted-foreground",
          )}
        />
      </button>
    </div>
  );
}
