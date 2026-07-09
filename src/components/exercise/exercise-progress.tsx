"use client";

import { Calendar, TrendingUp } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { RankBadge } from "@/components/ui/rank-badge";
import { useRogue } from "@/lib/store/rogue-store";
import { estimate1RM } from "@/lib/rank-engine";
import { getDivisionLabel, getRankTier } from "@/lib/ranks";
import { MUSCLE_LABELS, type Exercise } from "@/lib/exercises/types";
import { formatWeight } from "@/lib/units";

type ExerciseSession = {
  dateISO: string;
  series: number;
  reps: number;
  pesoKg: number;
  volumenKg: number;
  /** Peso y reps de cada serie individual (para el 1RM, no todas tienen igual reps). */
  sets: { weightKg: number; reps: number }[];
};

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Historial real (del store) de sesiones que incluyeron este ejercicio. */
function useExerciseHistory(exerciseId: string): ExerciseSession[] {
  const { sessions } = useRogue();

  return sessions
    .map((session) => {
      const sets = session.sets.filter((set) => set.exerciseId === exerciseId);
      if (sets.length === 0) return null;
      return {
        dateISO: session.dateISO,
        series: sets.length,
        reps: sets[sets.length - 1].reps,
        pesoKg: Math.max(...sets.map((s) => s.weightKg)),
        volumenKg: sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0),
        sets: sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
      };
    })
    .filter((s): s is ExerciseSession => s !== null)
    .sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime());
}

function formatSessionDate(dateISO: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
  }).format(new Date(dateISO));
}

export function ExerciseStatsPanel({ exercise }: { exercise: Exercise }) {
  const { muscleRanks, preferences } = useRogue();
  const unit = preferences.unit;
  const history = useExerciseHistory(exercise.id);

  const primaryRanks = exercise.musculosPrimarios
    .map((muscleId) => muscleRanks.find((m) => m.muscle === muscleId))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);

  let best1RM = 0;
  let bestWeighted: { w: number; r: number } | null = null;
  let bestBodyweightReps = 0;
  for (const session of history) {
    for (const set of session.sets) {
      if (set.weightKg > 0) {
        const est = estimate1RM(set.weightKg, set.reps);
        if (est > best1RM) {
          best1RM = est;
          bestWeighted = { w: set.weightKg, r: set.reps };
        }
      } else if (set.reps > bestBodyweightReps) {
        bestBodyweightReps = set.reps;
      }
    }
  }
  const mejorSerie = bestWeighted
    ? `${formatWeight(bestWeighted.w, unit)} ${unit} x ${bestWeighted.r}`
    : bestBodyweightReps > 0
      ? `${bestBodyweightReps} reps`
      : "—";

  const now = Date.now();
  const volumen4Semanas = history
    .filter((s) => now - new Date(s.dateISO).getTime() <= FOUR_WEEKS_MS)
    .reduce((sum, s) => sum + s.volumenKg, 0);
  const sesiones30Dias = history.filter(
    (s) => now - new Date(s.dateISO).getTime() <= THIRTY_DAYS_MS,
  ).length;

  return (
    <div className="flex flex-col gap-3">
      {primaryRanks.map((rank) => (
        <PastelCard
          key={rank.muscle}
          variant="lilac"
          className="flex items-center gap-4"
        >
          {rank.ranked ? (
            <RankBadge tier={rank.tier} division={rank.division} size="sm" />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-black/10 dark:bg-white/10">
              <TrendingUp className="size-5 opacity-60" />
            </span>
          )}
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] opacity-70">
              TU RANGO EN {MUSCLE_LABELS[rank.muscle].toUpperCase()}
            </p>
            <p className="mt-0.5 text-sm font-semibold">
              {rank.ranked
                ? `${getRankTier(rank.tier).label} ${getDivisionLabel(getRankTier(rank.tier), rank.division)}`
                : "Sin rango todavia"}
            </p>
          </div>
        </PastelCard>
      ))}

      <div className="grid grid-cols-2 gap-3">
        <PastelCard variant="neutral">
          <p className="text-xs text-muted-foreground">1RM estimado</p>
          <p className="mt-1 font-mono text-lg font-medium">
            {best1RM > 0 ? `${formatWeight(best1RM, unit)} ${unit}` : "—"}
          </p>
        </PastelCard>
        <PastelCard variant="neutral">
          <p className="text-xs text-muted-foreground">Mejor serie</p>
          <p className="mt-1 font-mono text-lg font-medium">{mejorSerie}</p>
        </PastelCard>
        <PastelCard variant="neutral">
          <p className="text-xs text-muted-foreground">Volumen 4 sem.</p>
          <p className="mt-1 font-mono text-lg font-medium">
            {volumen4Semanas > 0
              ? `${formatWeight(volumen4Semanas, unit)} ${unit}`
              : "—"}
          </p>
        </PastelCard>
        <PastelCard variant="neutral">
          <p className="text-xs text-muted-foreground">Sesiones 30 dias</p>
          <p className="mt-1 font-mono text-lg font-medium">{sesiones30Dias}</p>
        </PastelCard>
      </div>

      {history.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Aun no has registrado series de este ejercicio.
        </p>
      )}
    </div>
  );
}

export function ExerciseHistoryPanel({ exercise }: { exercise: Exercise }) {
  const { preferences } = useRogue();
  const unit = preferences.unit;
  const history = useExerciseHistory(exercise.id);

  if (history.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aun no hay sesiones registradas con este ejercicio.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {history.map((session, index) => (
        <PastelCard
          key={index}
          variant="neutral"
          className="flex items-center gap-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Calendar className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold capitalize">
              {formatSessionDate(session.dateISO)}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {session.series} x {session.reps}
              {session.pesoKg > 0
                ? ` @ ${formatWeight(session.pesoKg, unit)} ${unit}`
                : ""}
            </p>
          </div>
          {session.volumenKg > 0 && (
            <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <TrendingUp className="size-3.5" />
              {formatWeight(session.volumenKg, unit)} {unit}
            </p>
          )}
        </PastelCard>
      ))}
    </div>
  );
}
