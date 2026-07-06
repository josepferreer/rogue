import type { CSSProperties } from "react";
import { MUSCLE_LABELS, type MuscleId } from "@/lib/exercises/types";
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

type View = "front" | "back";

/**
 * Formas del cuerpo. Cada musculo puede tener varias formas (izquierda /
 * derecha, vista frontal / posterior). Coordenadas en un viewBox 0 0 120 200.
 */
const MUSCLE_SHAPES: { muscle: MuscleId; view: View; d: string }[] = [
  // ---------- VISTA FRONTAL ----------
  { muscle: "trapecio", view: "front", d: "M46 33 L57 30 L57 37 L47 39 Z" },
  { muscle: "trapecio", view: "front", d: "M74 33 L63 30 L63 37 L73 39 Z" },
  { muscle: "deltoide", view: "front", d: "M40 37 Q33 38 30 45 Q29 51 33 53 Q39 52 42 46 Q43 40 40 37 Z" },
  { muscle: "deltoide", view: "front", d: "M80 37 Q87 38 90 45 Q91 51 87 53 Q81 52 78 46 Q77 40 80 37 Z" },
  { muscle: "pectoral", view: "front", d: "M44 40 Q58 38 59 44 L59 56 Q52 60 45 56 Q42 48 44 40 Z" },
  { muscle: "pectoral", view: "front", d: "M76 40 Q62 38 61 44 L61 56 Q68 60 75 56 Q78 48 76 40 Z" },
  { muscle: "biceps", view: "front", d: "M31 55 Q36 54 37 58 L36 72 Q32 75 29 72 L29 60 Q29 56 31 55 Z" },
  { muscle: "biceps", view: "front", d: "M89 55 Q84 54 83 58 L84 72 Q88 75 91 72 L91 60 Q91 56 89 55 Z" },
  { muscle: "antebrazo", view: "front", d: "M28 76 Q33 74 35 77 L32 96 Q29 98 27 96 L26 82 Q26 78 28 76 Z" },
  { muscle: "antebrazo", view: "front", d: "M92 76 Q87 74 85 77 L88 96 Q91 98 93 96 L94 82 Q94 78 92 76 Z" },
  { muscle: "abdominales", view: "front", d: "M52 62 L68 62 Q70 78 66 94 Q60 98 54 94 Q50 78 52 62 Z" },
  { muscle: "oblicuos", view: "front", d: "M49 62 Q50 78 52 92 Q47 88 45 78 L45 66 Q46 62 49 62 Z" },
  { muscle: "oblicuos", view: "front", d: "M71 62 Q70 78 68 92 Q73 88 75 78 L75 66 Q74 62 71 62 Z" },
  { muscle: "cuadriceps", view: "front", d: "M45 100 Q56 98 57 104 L56 140 Q51 146 46 140 Q42 118 45 100 Z" },
  { muscle: "cuadriceps", view: "front", d: "M75 100 Q64 98 63 104 L64 140 Q69 146 74 140 Q78 118 75 100 Z" },
  { muscle: "aductores", view: "front", d: "M58 102 L62 102 Q63 112 60 120 Q57 112 58 102 Z" },
  { muscle: "gemelos", view: "front", d: "M47 150 Q53 148 54 153 L53 172 Q50 175 48 172 Q45 160 47 150 Z" },
  { muscle: "gemelos", view: "front", d: "M73 150 Q67 148 66 153 L67 172 Q70 175 72 172 Q75 160 73 150 Z" },

  // ---------- VISTA POSTERIOR ----------
  { muscle: "trapecio", view: "back", d: "M60 30 L46 38 Q52 46 60 56 Q68 46 74 38 Z" },
  { muscle: "deltoide", view: "back", d: "M40 37 Q33 38 30 45 Q29 51 33 53 Q39 52 42 46 Q43 40 40 37 Z" },
  { muscle: "deltoide", view: "back", d: "M80 37 Q87 38 90 45 Q91 51 87 53 Q81 52 78 46 Q77 40 80 37 Z" },
  { muscle: "espalda-media", view: "back", d: "M50 44 Q60 50 70 44 L68 62 Q60 66 52 62 Z" },
  { muscle: "dorsal", view: "back", d: "M44 48 Q48 58 51 64 L52 80 Q46 76 43 66 L43 52 Q43 48 44 48 Z" },
  { muscle: "dorsal", view: "back", d: "M76 48 Q72 58 69 64 L68 80 Q74 76 77 66 L77 52 Q77 48 76 48 Z" },
  { muscle: "triceps", view: "back", d: "M31 55 Q36 54 37 58 L36 72 Q32 75 29 72 L29 60 Q29 56 31 55 Z" },
  { muscle: "triceps", view: "back", d: "M89 55 Q84 54 83 58 L84 72 Q88 75 91 72 L91 60 Q91 56 89 55 Z" },
  { muscle: "antebrazo", view: "back", d: "M28 76 Q33 74 35 77 L32 96 Q29 98 27 96 L26 82 Q26 78 28 76 Z" },
  { muscle: "antebrazo", view: "back", d: "M92 76 Q87 74 85 77 L88 96 Q91 98 93 96 L94 82 Q94 78 92 76 Z" },
  { muscle: "lumbar", view: "back", d: "M54 68 L66 68 Q67 82 64 92 L56 92 Q53 82 54 68 Z" },
  { muscle: "gluteo", view: "back", d: "M46 96 Q58 94 59 102 Q59 110 53 112 Q46 112 44 106 Q44 98 46 96 Z" },
  { muscle: "gluteo", view: "back", d: "M74 96 Q62 94 61 102 Q61 110 67 112 Q74 112 76 106 Q76 98 74 96 Z" },
  { muscle: "isquiotibiales", view: "back", d: "M45 116 Q55 114 56 120 L55 144 Q50 149 46 144 Q42 130 45 116 Z" },
  { muscle: "isquiotibiales", view: "back", d: "M75 116 Q65 114 64 120 L65 144 Q70 149 74 144 Q78 130 75 116 Z" },
  { muscle: "abductores", view: "back", d: "M42 98 Q44 106 44 112 Q40 110 39 104 Q40 99 42 98 Z" },
  { muscle: "abductores", view: "back", d: "M78 98 Q76 106 76 112 Q80 110 81 104 Q80 99 78 98 Z" },
  { muscle: "aductores", view: "back", d: "M58 114 L62 114 Q63 124 60 132 Q57 124 58 114 Z" },
  { muscle: "gemelos", view: "back", d: "M46 150 Q54 147 55 154 L53 174 Q49 178 47 174 Q43 162 46 150 Z" },
  { muscle: "gemelos", view: "back", d: "M74 150 Q66 147 65 154 L67 174 Q71 178 73 174 Q77 162 74 150 Z" },
];

/** Silueta base comun a ambas vistas (cabeza, torso, extremidades). */
function BodySilhouette() {
  return (
    <g style={{ fill: "var(--muted)" }} opacity={0.55}>
      <circle cx="60" cy="16" r="10" />
      <rect x="55" y="25" width="10" height="8" rx="3" />
      <path d="M42 33 Q60 28 78 33 Q84 34 86 42 L84 66 Q80 92 74 98 L46 98 Q40 92 36 66 L34 42 Q36 34 42 33 Z" />
      <path d="M33 36 Q26 40 25 50 L24 96 Q26 101 31 100 L37 74 L39 44 Z" />
      <path d="M87 36 Q94 40 95 50 L96 96 Q94 101 89 100 L83 74 L81 44 Z" />
      <path d="M45 98 Q52 96 58 98 L57 146 Q56 178 52 188 L46 188 Q43 178 43 146 Z" />
      <path d="M75 98 Q68 96 62 98 L63 146 Q64 178 68 188 L74 188 Q77 178 77 146 Z" />
    </g>
  );
}

function MuscleFigure({
  view,
  fillFor,
}: {
  view: View;
  fillFor: (muscle: MuscleId) => CSSProperties["fill"];
}) {
  return (
    <svg viewBox="0 0 120 200" className="h-full w-auto" role="img">
      <BodySilhouette />
      {MUSCLE_SHAPES.filter((shape) => shape.view === view).map(
        (shape, index) => (
          <path
            key={`${shape.muscle}-${index}`}
            d={shape.d}
            style={{
              fill: fillFor(shape.muscle),
              stroke: "var(--border)",
              strokeWidth: 0.4,
            }}
          />
        ),
      )}
    </svg>
  );
}

export function MuscleMap({
  primary = [],
  secondary = [],
  colors,
  className,
  showLegend = true,
}: MuscleMapProps) {
  const fillFor = (muscle: MuscleId): CSSProperties["fill"] => {
    if (colors?.[muscle]) return colors[muscle];
    if (primary.includes(muscle)) return "var(--accent)";
    if (secondary.includes(muscle))
      return "color-mix(in oklab, var(--accent) 40%, var(--muted))";
    return "color-mix(in oklab, var(--muted-foreground) 18%, var(--muted))";
  };

  const highlighted = [...primary, ...secondary];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex h-56 items-stretch justify-center gap-6">
        <div className="flex flex-col items-center gap-1.5">
          <MuscleFigure view="front" fillFor={fillFor} />
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            FRONTAL
          </p>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <MuscleFigure view="back" fillFor={fillFor} />
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
            POSTERIOR
          </p>
        </div>
      </div>

      {showLegend && highlighted.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {primary.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2.5 rounded-full bg-accent" />
              Primario: {primary.map((m) => MUSCLE_LABELS[m]).join(", ")}
            </span>
          )}
          {secondary.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="size-2.5 rounded-full"
                style={{
                  background:
                    "color-mix(in oklab, var(--accent) 40%, var(--muted))",
                }}
              />
              Secundario: {secondary.map((m) => MUSCLE_LABELS[m]).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
