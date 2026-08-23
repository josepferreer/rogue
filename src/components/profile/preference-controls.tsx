"use client";

import { useRogue } from "@/lib/store/rogue-store";
import type { Preferences, WeightUnit } from "@/lib/workout/types";
import { cn } from "@/lib/utils";

/** Segmentado de unidades (kg / lb), persistido en preferencias. */
export function UnitToggle() {
  const { preferences, updatePreferences } = useRogue();
  const options: { value: WeightUnit; label: string }[] = [
    { value: "kg", label: "Kilogramos" },
    { value: "lb", label: "Libras" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border bg-muted/60 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => updatePreferences({ unit: option.value })}
          className={cn(
            "flex-1 rounded-xl px-3 py-2 text-sm transition-colors",
            preferences.unit === option.value
              ? "bg-segment-thumb text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type BooleanPrefKey = {
  [K in keyof Preferences]: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];

/** Fila con interruptor on/off ligada a una preferencia persistida. */
export function SwitchRow({
  label,
  description,
  prefKey,
}: {
  label: string;
  description?: string;
  prefKey: BooleanPrefKey;
}) {
  const { preferences, updatePreferences } = useRogue();
  const on = preferences[prefKey];

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
        onClick={() => updatePreferences({ [prefKey]: !on })}
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
