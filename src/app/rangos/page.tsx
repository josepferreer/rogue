"use client";

import { useState } from "react";
import { ChevronDown, Lock, X } from "lucide-react";
import { RankBadge } from "@/components/ui/rank-badge";
import { PastelCard } from "@/components/ui/pastel-card";
import { MuscleMap } from "@/components/exercise/muscle-map";
import { useRogue } from "@/lib/store/rogue-store";
import {
  MIN_SESSIONS_TO_RANK,
  type ComputedMuscleRank,
  type ComputedRank,
} from "@/lib/rank-engine";
import {
  getDivisionLabel,
  getNextRankTier,
  getRankTier,
  MUSCLE_GROUPS,
  RANK_STYLES,
  RANK_TIERS,
  type MuscleGroup,
} from "@/lib/ranks";
import {
  MUSCLE_LABELS,
  MUSCLE_TO_GROUP,
  type MuscleId,
} from "@/lib/exercises/types";

function BodyRankSummary({ ranks }: { ranks: ComputedRank[] }) {
  const colors: Partial<Record<MuscleId, string>> = {};
  for (const muscleId of Object.keys(MUSCLE_TO_GROUP) as MuscleId[]) {
    const group = MUSCLE_TO_GROUP[muscleId];
    const rank = ranks.find((r) => r.muscle === group);
    if (rank?.ranked) colors[muscleId] = `var(--rank-${rank.tier})`;
  }

  return (
    <PastelCard variant="neutral" className="flex flex-col gap-4 py-5">
      <p className="text-center font-mono text-xs tracking-[0.2em] text-muted-foreground">
        TU CUERPO POR RANGO
      </p>
      <MuscleMap colors={colors} showLegend={false} />
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        {RANK_TIERS.map((tier) => (
          <span
            key={tier.id}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ background: `var(--rank-${tier.id})` }}
            />
            {tier.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-full bg-muted ring-1 ring-border" />
          Sin rango
        </span>
      </div>
    </PastelCard>
  );
}

function RankExplainer() {
  return (
    <PastelCard variant="neutral" className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          COMO FUNCIONAN
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          Cada grupo tiene su{" "}
          <span className="font-semibold">rango propio</span>, segun tu fuerza
          relativa: tu mejor 1RM estimado entre tu peso corporal, comparado con
          estandares. Toca un grupo para ver el rango de cada musculo que lo
          forma.
        </p>
      </div>

      <div className="flex items-end justify-between gap-1">
        {RANK_TIERS.map((tier) => {
          const family = RANK_STYLES[tier.id].colorFamily;
          return (
            <div
              key={tier.id}
              className="flex flex-1 flex-col items-center gap-1 text-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/ranks/${family}-1.svg`} alt="" className="size-9" />
              <p className="text-[10px] font-medium leading-none">{tier.label}</p>
              <p className="font-mono text-[9px] leading-none text-muted-foreground">
                {tier.divisions} div.
              </p>
            </div>
          );
        })}
      </div>
    </PastelCard>
  );
}

function RankCard({
  rank,
  onClick,
}: {
  rank: ComputedRank;
  onClick: () => void;
}) {
  if (!rank.ranked) {
    const faltan = MIN_SESSIONS_TO_RANK - rank.sessions;
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col items-center gap-2 rounded-3xl border border-border bg-surface p-4 text-center transition-colors hover:bg-muted/40 active:bg-muted"
      >
        <span className="flex size-20 items-center justify-center rounded-3xl bg-muted text-muted-foreground ring-1 ring-border">
          <Lock className="size-7" />
        </span>
        <p className="text-sm font-semibold">{rank.muscle}</p>
        <p className="font-mono text-xs text-muted-foreground">SIN RANGO</p>
        <p className="text-[11px] text-muted-foreground">
          {faltan > 0
            ? `Entrena ${faltan} sesion${faltan === 1 ? "" : "es"} mas`
            : "Registra carga para desbloquear"}
        </p>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
    );
  }

  const tier = getRankTier(rank.tier);
  const next = getNextRankTier(rank.tier);
  const style = RANK_STYLES[rank.tier];
  const atLastDivision = rank.division >= tier.divisions;
  const isMaxRank = atLastDivision && !next;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-3xl border border-border bg-surface p-4 text-center transition-colors hover:bg-muted/40 active:bg-muted"
    >
      <RankBadge tier={rank.tier} division={rank.division} size="md" />
      <p className="text-sm font-semibold">{rank.muscle}</p>
      <p className={`font-mono text-xs ${style.text}`}>
        {tier.label.toUpperCase()} · {getDivisionLabel(tier, rank.division)}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${style.bar}`}
          style={{ width: `${rank.progress}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {isMaxRank
          ? "Rango maximo"
          : `${rank.progress}% hacia ${
              atLastDivision && next ? next.label : "siguiente division"
            }`}
      </p>
      <ChevronDown className="size-3.5 text-muted-foreground" />
    </button>
  );
}

function MuscleRow({ rank }: { rank: ComputedMuscleRank }) {
  const label = MUSCLE_LABELS[rank.muscle];

  if (!rank.ranked) {
    return (
      <div className="flex items-center justify-between py-2.5">
        <span className="text-sm">{label}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          Sin rango
        </span>
      </div>
    );
  }

  const tier = getRankTier(rank.tier);
  const color = `var(--rank-${rank.tier})`;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex-1 truncate text-sm">{label}</span>
      <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
        {rank.mode}
      </span>
      <div className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${rank.progress}%`, background: color }}
        />
      </div>
      <span
        className="shrink-0 whitespace-nowrap font-mono text-xs"
        style={{ color }}
      >
        {tier.label} {getDivisionLabel(tier, rank.division)}
      </span>
    </div>
  );
}

function GroupSheet({
  group,
  groupRank,
  muscles,
  onClose,
}: {
  group: MuscleGroup;
  groupRank: ComputedRank | undefined;
  muscles: ComputedMuscleRank[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="no-scrollbar relative z-10 max-h-[80vh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {groupRank?.ranked && (
              <RankBadge
                tier={groupRank.tier}
                division={groupRank.division}
                size="sm"
              />
            )}
            <div>
              <p className="text-lg font-semibold">{group}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {groupRank?.ranked
                  ? `${getRankTier(groupRank.tier).label} ${getDivisionLabel(
                      getRankTier(groupRank.tier),
                      groupRank.division,
                    )} · promedio`
                  : "Sin rango"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {muscles.map((m) => (
            <MuscleRow key={m.muscle} rank={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RangosPage() {
  const { ranks, muscleRanks } = useRogue();
  const [openGroup, setOpenGroup] = useState<MuscleGroup | null>(null);
  const ranked = ranks.filter((r) => r.ranked).length;

  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tus Rangos</h1>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          {ranked} DE {ranks.length} GRUPOS CON RANGO
        </p>
      </div>

      <RankExplainer />

      <BodyRankSummary ranks={ranks} />

      <div className="grid grid-cols-2 gap-3">
        {ranks.map((rank) => (
          <RankCard
            key={rank.muscle}
            rank={rank}
            onClick={() => setOpenGroup(rank.muscle)}
          />
        ))}
      </div>

      {openGroup && (
        <GroupSheet
          group={openGroup}
          groupRank={ranks.find((r) => r.muscle === openGroup)}
          muscles={muscleRanks.filter(
            (m) => MUSCLE_TO_GROUP[m.muscle] === openGroup,
          )}
          onClose={() => setOpenGroup(null)}
        />
      )}
    </div>
  );
}
