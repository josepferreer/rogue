"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Info, Lock, X } from "lucide-react";
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
  RANK_STYLES,
  RANK_TIERS,
  type MuscleGroup,
} from "@/lib/ranks";
import {
  MUSCLE_LABELS,
  MUSCLE_TO_GROUP,
  type MuscleId,
} from "@/lib/exercises/types";
import { cn } from "@/lib/utils";

/** Mapa corporal pintado por rango, con toggle media/por musculo. Se reutiliza
 *  tal cual en el perfil de un amigo (`/app/amigos/[username]`). */
export function BodyRankSummary({
  ranks,
  muscleRanks,
  title = "TU CUERPO POR RANGO",
}: {
  ranks: ComputedRank[];
  muscleRanks: ComputedMuscleRank[];
  title?: string;
}) {
  const [view, setView] = useState<"media" | "musculo">("media");

  const colors: Partial<Record<MuscleId, string>> = {};
  if (view === "media") {
    // Cada musculo se pinta con el rango (promedio) de su grupo.
    for (const muscleId of Object.keys(MUSCLE_TO_GROUP) as MuscleId[]) {
      const group = MUSCLE_TO_GROUP[muscleId];
      const rank = ranks.find((r) => r.muscle === group);
      if (rank?.ranked) colors[muscleId] = `var(--rank-${rank.tier})`;
    }
  } else {
    // Cada musculo se pinta con su propio rango individual.
    for (const m of muscleRanks) {
      if (m.ranked) colors[m.muscle] = `var(--rank-${m.tier})`;
    }
  }

  return (
    <PastelCard variant="neutral" className="flex flex-col gap-4 py-5">
      <p className="text-center font-mono text-xs tracking-[0.2em] text-muted-foreground">
        {title}
      </p>

      <div className="mx-auto flex w-full max-w-[220px] rounded-full bg-muted p-1">
        {(
          [
            ["media", "Media"],
            ["musculo", "Por musculo"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={cn(
              "flex-1 rounded-full py-1.5 text-xs font-medium transition-colors",
              view === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <MuscleMap colors={colors} showLegend={false} />
    </PastelCard>
  );
}

/** Leyenda de como funcionan los rangos. Plegada por defecto. */
function RankExplainer() {
  const [open, setOpen] = useState(false);

  return (
    <PastelCard variant="neutral" className="flex flex-col gap-0 p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          COMO FUNCIONAN
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          <p className="text-sm leading-relaxed text-foreground/90">
            Cada grupo tiene su{" "}
            <span className="font-semibold">rango propio</span>, segun tu fuerza
            relativa: tu mejor 1RM estimado entre tu peso corporal, comparado con
            estandares. Toca un grupo para ver el rango de cada musculo que lo
            forma.
          </p>

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
                  <p className="text-[10px] font-medium leading-none">
                    {tier.label}
                  </p>
                  <p className="font-mono text-[9px] leading-none text-muted-foreground">
                    {tier.divisions} div.
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
        <p className="flex min-h-8 items-center text-[11px] text-muted-foreground">
          {faltan > 0
            ? `Entrena ${faltan} sesion${faltan === 1 ? "" : "es"} mas`
            : "Registra carga para desbloquear"}
        </p>
        <span className="mt-auto flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground/80">
          Ver musculos <ChevronRight className="size-3" />
        </span>
      </button>
    );
  }

  const tier = getRankTier(rank.tier);
  const next = getNextRankTier(rank.tier);
  const style = RANK_STYLES[rank.tier];
  const atLastDivision = rank.division >= tier.divisions;
  const isMaxRank = atLastDivision && !next;

  const nextLabel = isMaxRank
    ? "Rango maximo"
    : atLastDivision && next
      ? `${rank.progress}% → ${next.label}`
      : `${rank.progress}% → Div. ${getDivisionLabel(tier, rank.division + 1)}`;

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
      <p className="flex min-h-8 items-center text-[11px] text-muted-foreground">
        {nextLabel}
      </p>
      <span className="mt-auto flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground/80">
        Ver musculos <ChevronRight className="size-3" />
      </span>
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
      <span className="shrink-0 whitespace-nowrap font-mono text-xs font-medium text-foreground">
        <span style={{ color }}>●</span> {tier.label}{" "}
        {getDivisionLabel(tier, rank.division)}
      </span>
    </div>
  );
}

/** Modal centrado que explica los dos modos de puntuacion. */
function ScoringInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full px-5 md:w-full md:max-w-md md:px-0">
        <div className="w-full rounded-3xl border border-border bg-surface p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <p className="text-base font-semibold">Como se puntua cada musculo</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-1 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <span className="w-fit rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                Fuerza
              </span>
              <p className="leading-relaxed text-muted-foreground">
                Cuando entrenas el musculo como{" "}
                <span className="font-medium text-foreground">principal con carga</span>.
                Mide tu fuerza relativa: tu mejor 1RM estimado dividido entre tu peso
                corporal, comparado con estandares.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <span className="w-fit rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                Volumen
              </span>
              <p className="leading-relaxed text-muted-foreground">
                Cuando el musculo solo recibe{" "}
                <span className="font-medium text-foreground">trabajo secundario o de peso corporal</span>.
                Mide las series efectivas acumuladas en las ultimas semanas.
              </p>
            </div>

            <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              El rango de un grupo es el <span className="font-medium">promedio</span> de
              los musculos que lo forman.
            </p>
          </div>
        </div>
      </div>
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
  const [view, setView] = useState<"media" | "musculos">("musculos");
  const [infoOpen, setInfoOpen] = useState(false);

  const rankedMuscles = muscles.filter((m) => m.ranked).length;
  const tier = groupRank?.ranked ? getRankTier(groupRank.tier) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      {/* Bottom-sheet en movil (sube desde abajo); dialogo centrado en escritorio. */}
      <div className="relative z-10 w-full px-5 md:w-full md:max-w-md md:px-0">
        <div className="no-scrollbar max-h-[80vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:rounded-3xl">
          {/* Cabecera */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg font-semibold">{group}</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="Que significa fuerza y volumen"
              className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
            >
              <Info className="size-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Toggle media / musculo a musculo */}
        <div className="mb-4 flex rounded-full bg-muted p-1">
          {(
            [
              ["media", "Media"],
              ["musculos", "Musculo a musculo"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                "flex-1 rounded-full py-1.5 text-xs font-medium transition-colors",
                view === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "media" ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            {groupRank?.ranked && tier ? (
              <>
                <RankBadge
                  tier={groupRank.tier}
                  division={groupRank.division}
                  size="md"
                />
                <div>
                  <p
                    className="font-mono text-sm font-semibold"
                    style={{ color: `var(--rank-${groupRank.tier})` }}
                  >
                    {tier.label} {getDivisionLabel(tier, groupRank.division)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Promedio de {rankedMuscles} de {muscles.length} musculos con
                    rango
                  </p>
                </div>
                <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${groupRank.progress}%`,
                      background: `var(--rank-${groupRank.tier})`,
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <span className="flex size-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground ring-1 ring-border">
                  <Lock className="size-6" />
                </span>
                <p className="text-sm font-semibold">Sin rango todavia</p>
                <p className="text-xs text-muted-foreground">
                  Entrena este grupo para desbloquear su rango.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {muscles.map((m) => (
              <MuscleRow key={m.muscle} rank={m} />
            ))}
          </div>
        )}
        </div>
      </div>

      {infoOpen && <ScoringInfoModal onClose={() => setInfoOpen(false)} />}
    </div>
  );
}

/** Contenido completo de la antigua pagina /rangos (explicacion, mapa corporal
 *  y grid de grupos con su hoja de detalle). Vive como panel dentro de la
 *  pestana "Rangos" del perfil. */
export function RanksPanel() {
  const { ranks, muscleRanks } = useRogue();
  const [openGroup, setOpenGroup] = useState<MuscleGroup | null>(null);
  const ranked = ranks.filter((r) => r.ranked).length;

  return (
    <div className="flex flex-col gap-5">
      <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
        {ranked} DE {ranks.length} GRUPOS CON RANGO
      </p>

      <RankExplainer />

      <BodyRankSummary ranks={ranks} muscleRanks={muscleRanks} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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
