import { RankBadge } from "@/components/ui/rank-badge";
import { PastelCard } from "@/components/ui/pastel-card";
import { muscleRanks } from "@/lib/mock-data";
import {
  DIVISION_LABELS,
  RANK_STYLES,
  getNextRankTier,
  getRankTier,
} from "@/lib/ranks";

export default function RangosPage() {
  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tus Rangos</h1>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          {muscleRanks.length} GRUPOS MUSCULARES
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {muscleRanks.map((rank) => {
          const tier = getRankTier(rank.tier);
          const next = getNextRankTier(rank.tier);
          const style = RANK_STYLES[rank.tier];

          return (
            <PastelCard
              key={rank.muscle}
              variant="neutral"
              className="flex flex-col items-center gap-2 text-center"
            >
              <RankBadge tier={rank.tier} division={rank.division} size="md" />
              <p className="text-sm font-semibold">{rank.muscle}</p>
              <p className={`font-mono text-xs ${style.text}`}>
                {tier.label.toUpperCase()} · {DIVISION_LABELS[rank.division - 1]}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${style.bar}`}
                  style={{ width: `${rank.progress}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {next
                  ? `${rank.progress}% hacia ${
                      rank.division === 3 ? next.label : "siguiente division"
                    }`
                  : "Rango maximo"}
              </p>
            </PastelCard>
          );
        })}
      </div>
    </div>
  );
}
