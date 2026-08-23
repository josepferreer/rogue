"use client";

import { useMemo } from "react";
import Model, { type IExerciseData, type Muscle } from "react-body-highlighter";
import { MUSCLE_ID_TO_SVG } from "@/lib/exercises/muscle-svg-map";
import { getExerciseMuscles } from "@/lib/exercises/repo";
import { useCustomExercises } from "@/lib/store/custom-exercises-store";
import { useRogue } from "@/lib/store/rogue-store";
import {
  computeMuscleRecovery,
  type MuscleRecovery,
  type MuscleState,
} from "@/lib/training/muscle-recovery";
import { useHydrated } from "@/lib/use-hydrated";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

/**
 * Paleta pastel, anclada en los tokens de la casa (`--accent-green` /
 * `--accent-red`, que ya vienen apagados y tienen su version para modo
 * oscuro). Se rebajan mezclandolos con `--muted`, igual que hace el mapa
 * muscular de la ficha de ejercicio: son manchas grandes, y a plena
 * saturacion el cuerpo parecia un semaforo.
 *
 * "Casi" no tiene token propio: es el punto medio entre el verde y el rojo,
 * que cae en un ambar apagado. Asi los tres salen de la misma familia en vez
 * de meter un color nuevo a mano.
 */
const SUAVIZADO = 45; // % del acento; el resto es `--muted`
const COLORS: Record<MuscleState, string> = {
  listo: `color-mix(in oklab, var(--accent-green) ${SUAVIZADO}%, var(--muted))`,
  casi: `color-mix(in oklab, color-mix(in oklab, var(--accent-green), var(--accent-red)) ${SUAVIZADO}%, var(--muted))`,
  descansando: `color-mix(in oklab, var(--accent-red) ${SUAVIZADO}%, var(--muted))`,
};

const STATE_LABEL: Record<MuscleState, string> = {
  listo: "Listo",
  casi: "Casi",
  descansando: "Descansando",
};

/** Peor primero: es el orden en que interesa leerlos. */
const STATE_ORDER: MuscleState[] = ["descansando", "casi", "listo"];

const BODY_COLOR = "color-mix(in oklab, var(--muted-foreground) 16%, var(--muted))";

/**
 * Varios musculos comparten region en el SVG (dorsal y espalda media son los
 * dos "upper-back"). Se pinta el PEOR de los que caen ahi: decir "listo"
 * cuando media zona no lo esta seria justo el error que hace inutil un mapa.
 */
function regionsByState(recovery: MuscleRecovery[]): Record<MuscleState, Muscle[]> {
  const peorPorRegion = new Map<Muscle, MuscleRecovery>();
  for (const item of recovery) {
    for (const region of MUSCLE_ID_TO_SVG[item.muscle]) {
      const actual = peorPorRegion.get(region);
      if (!actual || item.ratio < actual.ratio) peorPorRegion.set(region, item);
    }
  }
  const out: Record<MuscleState, Muscle[]> = { listo: [], casi: [], descansando: [] };
  for (const [region, item] of peorPorRegion) out[item.state].push(region);
  return out;
}

function BodyView({
  type,
  label,
  data,
  colors,
}: {
  type: "anterior" | "posterior";
  label: string;
  data: IExerciseData[];
  colors: string[];
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="w-[112px]">
        <Model
          type={type}
          data={data}
          bodyColor={BODY_COLOR}
          highlightedColors={colors}
          style={{ width: "100%" }}
        />
      </div>
      <p className="font-mono text-2xs font-medium tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/**
 * "faltan 2 h" / "faltan 1 d 4 h".
 *
 * Redondea al alza SOLO desde media hora. Con `Math.ceil` a secas, 24 h y dos
 * minutos se convertian en 25 h y se leian como "1 d 1 h": un umbral de 24 h
 * justas nunca llegaba a verse redondo.
 */
function faltan(horas: number): string {
  const h = Math.max(1, Math.round(horas));
  if (h < 24) return `${h} h`;
  const dias = Math.floor(h / 24);
  const resto = h % 24;
  return resto === 0 ? `${dias} d` : `${dias} d ${resto} h`;
}

export function MuscleHeatmap({ className }: { className?: string }) {
  const { sessions, preferences } = useRogue();
  // En servidor no hay hora valida ni tiene sentido pintar esto: se espera a
  // hidratar. `useNow` ademas refresca cada minuto, asi que el "faltan 3 h" va
  // bajando solo.
  const hydrated = useHydrated();
  const now = useNow();

  // Los ejercicios propios se registran en repo.ts DESPUES del primer render.
  // `custom` en las dependencias fuerza el recalculo en cuanto llegan; sin el,
  // una serie hecha con un ejercicio propio no pintaba musculo hasta que
  // `useNow` disparara el siguiente minuto.
  const { custom } = useCustomExercises();
  const recoveryHours = preferences.recoveryHours;
  const recovery = useMemo(() => {
    if (!hydrated) return [];
    return computeMuscleRecovery(sessions, getExerciseMuscles, { now, recoveryHours });
    // `custom` no se usa dentro, pero SI cambia el resultado: getExerciseMuscles
    // lee el global de repo.ts, que se rellena cuando llegan los personalizados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, hydrated, now, recoveryHours, custom]);

  const { data, colors, porEstado } = useMemo(() => {
    const regiones = regionsByState(recovery);
    // El color sale de highlightedColors[frecuencia - 1], asi que cada estado
    // es un "grupo" con su frecuencia.
    const usados = STATE_ORDER.filter((s) => regiones[s].length > 0);
    return {
      data: usados.map<IExerciseData>((estado, i) => ({
        name: estado,
        muscles: regiones[estado],
        frequency: i + 1,
      })),
      colors: usados.map((estado) => COLORS[estado]),
      porEstado: Object.fromEntries(
        STATE_ORDER.map((s) => [s, recovery.filter((r) => r.state === s)]),
      ) as Record<MuscleState, MuscleRecovery[]>,
    };
  }, [recovery]);

  if (!hydrated) return null;

  const nunca = sessions.length === 0;
  const descansando = porEstado.descansando ?? [];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          RECUPERACIÓN MUSCULAR
        </h2>
        {!nunca && (
          <span className="font-mono text-xs text-muted-foreground">
            {(porEstado.listo ?? []).length}/{recovery.length} listos
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5">
        {nunca ? (
          <p className="text-center text-sm text-muted-foreground">
            Cuando registres entrenos verás aquí qué músculos has trabajado y
            cuáles ya están listos para volver.
          </p>
        ) : (
          <>
            <div className="flex items-start justify-center gap-4">
              <BodyView type="anterior" label="FRONTAL" data={data} colors={colors} />
              <BodyView type="posterior" label="POSTERIOR" data={data} colors={colors} />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
              {STATE_ORDER.map((estado) => (
                <span
                  key={estado}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: COLORS[estado] }}
                  />
                  {STATE_LABEL[estado]} ({(porEstado[estado] ?? []).length})
                </span>
              ))}
            </div>

            {descansando.length > 0 && (
              <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
                {descansando.slice(0, 4).map((m) => (
                  <li
                    key={m.muscle}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span>{m.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      faltan {faltan(m.hoursLeft)}
                    </span>
                  </li>
                ))}
                {descansando.length > 4 && (
                  <li className="text-xs text-muted-foreground">
                    y {descansando.length - 4} más
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
