"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { MUSCLE_LABELS, type MuscleId } from "@/lib/exercises/types";
import { useRogue } from "@/lib/store/rogue-store";
import { DEFAULT_RECOVERY_HOURS } from "@/lib/training/muscle-recovery";

/** Tope alto pero no absurdo: 2 semanas. Por abajo, 1 hora. */
const MIN_H = 1;
const MAX_H = 336;

/** Musculos agrupados como se explican, no como los ordena el alfabeto. */
const GRUPOS: { titulo: string; muscles: MuscleId[] }[] = [
  {
    titulo: "Grandes",
    muscles: ["pectoral", "dorsal", "espalda-media", "cuadriceps", "isquiotibiales", "gluteo"],
  },
  {
    titulo: "Medianos",
    muscles: ["deltoide", "trapecio", "lumbar", "aductores", "abductores", "abdominales", "oblicuos"],
  },
  { titulo: "Pequenos", muscles: ["biceps", "triceps", "antebrazo", "gemelos"] },
];

/**
 * Ajustes > Recuperacion: cuantas horas de descanso pide cada musculo antes de
 * darse por listo en el mapa de la home.
 *
 * Los valores por defecto son una estimacion mia, no una verdad fisiologica.
 * Poder cambiarlos es lo que los convierte en numeros del usuario, y por eso
 * cada fila enseña cual era el de fabrica.
 */
export function RecoveryHoursCard() {
  const { preferences, updatePreferences } = useRogue();
  const actuales = preferences.recoveryHours ?? {};
  /** Lo que se esta escribiendo, para no pelear con el input a media edicion. */
  const [borrador, setBorrador] = useState<Partial<Record<MuscleId, string>>>({});

  const valorDe = (m: MuscleId) =>
    borrador[m] ?? String(actuales[m] ?? DEFAULT_RECOVERY_HOURS[m]);

  function guardar(m: MuscleId, texto: string) {
    setBorrador((prev) => ({ ...prev, [m]: texto }));
    const n = Number(texto);
    if (!Number.isFinite(n) || n < MIN_H || n > MAX_H) return; // a medio escribir
    const siguiente = { ...actuales };
    // Volver al valor de fabrica no se guarda: se borra la excepcion. Asi, si
    // algun dia se afinan los defectos, el usuario se beneficia.
    if (Math.round(n) === DEFAULT_RECOVERY_HOURS[m]) delete siguiente[m];
    else siguiente[m] = Math.round(n);
    updatePreferences({ recoveryHours: siguiente });
  }

  function restaurar() {
    setBorrador({});
    updatePreferences({ recoveryHours: {} });
  }

  const tocados = Object.keys(actuales).length;

  return (
    <PastelCard variant="neutral" className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Horas de descanso antes de dar un músculo por listo en el mapa de
          inicio. Los valores de fábrica son una estimación: ajústalos a cómo te
          recuperas tú.
        </p>
        {tocados > 0 && (
          <button
            type="button"
            onClick={restaurar}
            className="flex shrink-0 items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
          >
            <RotateCcw className="size-3" />
            Restaurar
          </button>
        )}
      </div>

      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-2">
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            {grupo.titulo.toUpperCase()}
          </p>
          {grupo.muscles.map((m) => {
            const porDefecto = DEFAULT_RECOVERY_HOURS[m];
            const cambiado = actuales[m] !== undefined;
            return (
              <label
                key={m}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {MUSCLE_LABELS[m]}
                  {cambiado && (
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      (de fábrica {porDefecto} h)
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_H}
                    max={MAX_H}
                    value={valorDe(m)}
                    onChange={(e) => guardar(m, e.target.value)}
                    onBlur={() => setBorrador((p) => ({ ...p, [m]: undefined }))}
                    aria-label={`Horas de descanso para ${MUSCLE_LABELS[m]}`}
                    className="w-16 rounded-xl border border-border bg-background px-2 py-1.5 text-right font-mono text-sm"
                  />
                  <span className="font-mono text-xs text-muted-foreground">h</span>
                </span>
              </label>
            );
          })}
        </div>
      ))}
    </PastelCard>
  );
}
