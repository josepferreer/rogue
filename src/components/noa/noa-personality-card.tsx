"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { NoaPersonalityModal } from "@/components/noa/noa-personality-modal";
import {
  DEFAULT_PERSONALITY,
  PERSONA_OPTIONS,
  TONE_OPTIONS,
  type NoaPersonality,
} from "@/lib/noa/personality-options";
import { getNoaPersonality } from "@/lib/noa/settings-actions";

/** Entrada a Ajustes > NOA > Personalidad, con un resumen de lo elegido. */
export function NoaPersonalityCard() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<NoaPersonality | null>(null);

  // Se recarga al cerrar el modal para que el resumen refleje lo guardado.
  useEffect(() => {
    if (open) return;
    let alive = true;
    getNoaPersonality()
      .then((p) => alive && setValue(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const p = value ?? DEFAULT_PERSONALITY;
  const resumen = [
    PERSONA_OPTIONS.find((o) => o.value === p.persona)?.label,
    TONE_OPTIONS.find((o) => o.value === p.tone)?.label.toLowerCase(),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PastelCard
        as="button"
        variant="neutral"
        className="flex items-center gap-3"
        onClick={() => setOpen(true)}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Personalidad</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {value ? resumen : "Cómo te habla NOA"}
            {value && p.nickname ? ` · te llama "${p.nickname}"` : ""}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </PastelCard>

      <NoaPersonalityModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
