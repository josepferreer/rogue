"use client";

import Model, {
  type IExerciseData,
  type Muscle,
} from "react-body-highlighter";
import { MUSCLE_LABELS, type MuscleId } from "@/lib/exercises/types";
import { toSvgMuscles } from "@/lib/exercises/muscle-svg-map";
import { cn } from "@/lib/utils";

type MuscleMapProps = {
  /** Musculos trabajados como primarios (color acento). */
  primary?: MuscleId[];
  /** Musculos secundarios (acento suave). */
  secondary?: MuscleId[];
  /**
   * Colores por musculo (p.ej. para pintar el mapa segun rangos).
   * Tiene prioridad sobre primary/secondary.
   */
  colors?: Partial<Record<MuscleId, string>>;
  className?: string;
  /** Muestra la leyenda Primario/Secundario. */
  showLegend?: boolean;
};

const PRIMARY_COLOR = "var(--accent)";
const SECONDARY_COLOR = "color-mix(in oklab, var(--accent) 45%, var(--muted))";
const BODY_COLOR = "color-mix(in oklab, var(--muted-foreground) 16%, var(--muted))";

/**
 * El resaltado de react-body-highlighter funciona por "frecuencia": cada
 * grupo de musculos recibe una frecuencia y el color se toma de
 * highlightedColors[frecuencia - 1]. Construimos esos grupos a partir de
 * nuestros props, agrupando por color.
 */
function buildModel(
  primary: MuscleId[],
  secondary: MuscleId[],
  colors?: Partial<Record<MuscleId, string>>,
): { data: IExerciseData[]; highlightedColors: string[] } {
  const groups: { muscles: Muscle[]; color: string }[] = [];

  if (colors) {
    const byColor = new Map<string, Muscle[]>();
    for (const [id, color] of Object.entries(colors)) {
      if (!color) continue;
      const list = byColor.get(color) ?? [];
      list.push(...toSvgMuscles([id as MuscleId]));
      byColor.set(color, list);
    }
    for (const [color, muscles] of byColor) groups.push({ muscles, color });
  } else {
    if (secondary.length > 0)
      groups.push({ muscles: toSvgMuscles(secondary), color: SECONDARY_COLOR });
    if (primary.length > 0)
      groups.push({ muscles: toSvgMuscles(primary), color: PRIMARY_COLOR });
  }

  const data: IExerciseData[] = groups.map((group, index) => ({
    name: `g${index}`,
    muscles: group.muscles,
    frequency: index + 1,
  }));
  const highlightedColors = groups.map((group) => group.color);

  return { data, highlightedColors };
}

function BodyView({
  type,
  label,
  data,
  highlightedColors,
}: {
  type: "anterior" | "posterior";
  label: string;
  data: IExerciseData[];
  highlightedColors: string[];
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="w-[112px]">
        <Model
          type={type}
          data={data}
          bodyColor={BODY_COLOR}
          highlightedColors={highlightedColors}
          style={{ width: "100%" }}
        />
      </div>
      <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export function MuscleMap({
  primary = [],
  secondary = [],
  colors,
  className,
  showLegend = true,
}: MuscleMapProps) {
  const { data, highlightedColors } = buildModel(primary, secondary, colors);
  const highlighted = [...primary, ...secondary];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-center gap-4">
        <BodyView
          type="anterior"
          label="FRONTAL"
          data={data}
          highlightedColors={highlightedColors}
        />
        <BodyView
          type="posterior"
          label="POSTERIOR"
          data={data}
          highlightedColors={highlightedColors}
        />
      </div>

      {showLegend && !colors && highlighted.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {primary.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="size-2.5 rounded-full"
                style={{ background: PRIMARY_COLOR }}
              />
              Primario: {primary.map((m) => MUSCLE_LABELS[m]).join(", ")}
            </span>
          )}
          {secondary.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="size-2.5 rounded-full"
                style={{ background: SECONDARY_COLOR }}
              />
              Secundario: {secondary.map((m) => MUSCLE_LABELS[m]).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
