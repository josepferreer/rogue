"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { MUSCLE_LABELS, type MuscleId } from "@/lib/exercises/types";
import { useRogue } from "@/lib/store/rogue-store";
import { DEFAULT_RECOVERY_HOURS } from "@/lib/training/muscle-recovery";
import { cn } from "@/lib/utils";

/** Tope alto pero no absurdo: 2 semanas. Por abajo, 1 hora. */
const MIN_H = 1;
const MAX_H = 336;

/** Musculos agrupados como se explican, no como los ordena el alfabeto. */
const GRUPOS: { id: string; titulo: string; muscles: MuscleId[] }[] = [
  {
    id: "grandes",
    titulo: "Grandes",
    muscles: ["pectoral", "dorsal", "espalda-media", "cuadriceps", "isquiotibiales", "gluteo"],
  },
  {
    id: "medianos",
    titulo: "Medianos",
    muscles: ["deltoide", "trapecio", "lumbar", "aductores", "abductores", "abdominales", "oblicuos"],
  },
  { id: "pequenos", titulo: "Pequeños", muscles: ["biceps", "triceps", "antebrazo", "gemelos"] },
];

/**
 * Ajustes > Recuperación: cuántas horas de descanso pide cada músculo antes de
 * darse por listo en el mapa de la home.
 *
 * Plegado por grupos y con uno abierto como mucho: son 17 músculos, y
 * enseñarlos todos a la vez convertía la pantalla de ajustes en un formulario
 * interminable por algo que se toca una vez y no se vuelve a mirar. Cada grupo
 * resume su valor en la propia fila, así que para SABER cómo lo tienes no hace
 * falta ni desplegar.
 *
 * Los valores por defecto son una estimación mía, no una verdad fisiológica.
 * Poder cambiarlos es lo que los convierte en números del usuario, y por eso
 * cada fila enseña cuál era el de fábrica.
 */
export function RecoveryHoursCard() {
  const { preferences, updatePreferences } = useRogue();
  const actuales = preferences.recoveryHours ?? {};
  /** Grupo desplegado; null = todos plegados. */
  const [abierto, setAbierto] = useState<string | null>(null);
  /** Lo que se está escribiendo, para no pelear con el input a media edición. */
  const [borrador, setBorrador] = useState<Partial<Record<MuscleId, string>>>({});

  const horasDe = (m: MuscleId) => actuales[m] ?? DEFAULT_RECOVERY_HOURS[m];
  const valorDe = (m: MuscleId) => borrador[m] ?? String(horasDe(m));

  function guardar(m: MuscleId, texto: string) {
    setBorrador((prev) => ({ ...prev, [m]: texto }));
    const n = Number(texto);
    if (!Number.isFinite(n) || n < MIN_H || n > MAX_H) return; // a medio escribir
    const siguiente = { ...actuales };
    // Volver al valor de fábrica no se guarda: se borra la excepción. Así, si
    // algún día se afinan los defectos, el usuario se beneficia.
    if (Math.round(n) === DEFAULT_RECOVERY_HOURS[m]) delete siguiente[m];
    else siguiente[m] = Math.round(n);
    updatePreferences({ recoveryHours: siguiente });
  }

  function restaurar() {
    setBorrador({});
    setAbierto(null);
    updatePreferences({ recoveryHours: {} });
  }

  /** "72 h" si todos coinciden, "36–72 h" si no. */
  function resumen(muscles: MuscleId[]): string {
    const valores = muscles.map(horasDe);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    return min === max ? `${min} h` : `${min}–${max} h`;
  }

  const tocados = Object.keys(actuales).length;

  return (
    <PastelCard variant="neutral" className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Horas de descanso antes de dar un músculo por listo en el mapa de
          inicio.
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

      <div className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        {GRUPOS.map((grupo) => {
          const desplegado = abierto === grupo.id;
          const cambiados = grupo.muscles.filter((m) => actuales[m] !== undefined).length;
          return (
            <div key={grupo.id}>
              <button
                type="button"
                onClick={() => setAbierto(desplegado ? null : grupo.id)}
                aria-expanded={desplegado}
                className="flex w-full items-center gap-3 px-3 py-3 text-left"
              >
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {grupo.titulo}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({grupo.muscles.length})
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {resumen(grupo.muscles)}
                  {cambiados > 0 && ` · ${cambiados} ✏️`}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    desplegado && "rotate-180",
                  )}
                />
              </button>

              {desplegado && (
                <div className="flex flex-col gap-2 px-3 pb-3">
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
                              (fábrica {porDefecto} h)
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
              )}
            </div>
          );
        })}
      </div>
    </PastelCard>
  );
}
