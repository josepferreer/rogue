"use client";

import Link from "next/link";
import { ArrowRight, Flame, Layers, Lock, Timer, User } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { RankBadge } from "@/components/ui/rank-badge";
import { getDivisionLabel, getRankTier } from "@/lib/ranks";
import { useRogue } from "@/lib/store/rogue-store";
import type { ComputedRank } from "@/lib/rank-engine";
import { exerciseSuggestions } from "@/lib/mock-data";

function formatToday() {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  })
    .format(new Date())
    .toUpperCase()
    .replace(".", "");
}

function RankChip({ rank }: { rank: ComputedRank }) {
  if (!rank.ranked) {
    return (
      <div className="flex min-w-[76px] flex-col items-center gap-1.5">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border">
          <Lock className="size-5" />
        </span>
        <p className="text-xs font-medium">{rank.muscle}</p>
        <p className="font-mono text-[10px] text-muted-foreground">SIN RANGO</p>
      </div>
    );
  }
  const tier = getRankTier(rank.tier);
  return (
    <div className="flex min-w-[76px] flex-col items-center gap-1.5">
      <RankBadge tier={rank.tier} division={rank.division} size="sm" />
      <p className="text-xs font-medium">{rank.muscle}</p>
      <p className="font-mono text-[10px] text-muted-foreground">
        {tier.label.toUpperCase()} {getDivisionLabel(tier, rank.division)}
      </p>
    </div>
  );
}

export default function Home() {
  const { profile, ranks, sessions, todayDay } = useRogue();

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekSessions = sessions.filter(
    (s) => new Date(s.dateISO).getTime() >= weekAgo,
  );
  const weekVolume = weekSessions.reduce(
    (sum, s) => sum + s.sets.reduce((a, set) => a + set.weightKg * set.reps, 0),
    0,
  );
  const estMinutes = todayDay.exercises.length * 9;

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            {formatToday()}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Hola, {profile.name || "Atleta"}
          </h1>
        </div>
        <Link 
          href="/perfil" 
          className="flex size-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
        >
          <User className="size-5" />
        </Link>
      </div>

      <div className="rounded-3xl bg-white p-5 text-neutral-900 shadow-[0_16px_48px_-16px_rgba(23,24,28,0.25)]">
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.15em] text-neutral-600">
            HOY · {todayDay.label.toUpperCase()}
          </span>
          <span className="flex size-11 items-center justify-center rounded-2xl bg-neutral-100 font-mono text-sm font-medium text-neutral-900">
            {todayDay.exercises.length}
          </span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-tight">
          {todayDay.focus}
        </h2>
        <p className="mt-1.5 font-mono text-sm text-neutral-500">
          {todayDay.exercises.length} ejercicios · {estMinutes} min
        </p>
        <div className="mt-5 flex items-center justify-end">
          <Link
            href="/entrenar"
            className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Empezar entreno
          </Link>
        </div>
      </div>

      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        <PastelCard variant="neutral" className="flex min-w-[128px] flex-col gap-2">
          <Flame className="size-4 text-muted-foreground" />
          <div>
            <p className="font-mono text-lg font-medium leading-none">
              {sessions.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">entrenos totales</p>
          </div>
        </PastelCard>
        <PastelCard variant="neutral" className="flex min-w-[128px] flex-col gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <div>
            <p className="font-mono text-lg font-medium leading-none">
              {weekVolume.toLocaleString("es-ES")}
              <span className="text-xs font-normal">kg</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">volumen semana</p>
          </div>
        </PastelCard>
        <PastelCard variant="neutral" className="flex min-w-[128px] flex-col gap-2">
          <Timer className="size-4 text-muted-foreground" />
          <div>
            <p className="font-mono text-lg font-medium leading-none">
              {weekSessions.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">esta semana</p>
          </div>
        </PastelCard>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            TUS RANGOS
          </p>
          <Link
            href="/rangos"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Ver todo
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 py-1">
          {ranks.map((rank) => (
            <RankChip key={rank.muscle} rank={rank} />
          ))}
        </div>
      </div>

      <div className="pb-4">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          DESCUBRE EJERCICIOS
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {exerciseSuggestions.map((exercise) => (
            <PastelCard
              key={exercise.title}
              variant={exercise.variant}
              className="flex flex-col gap-2"
            >
              <p className="text-[10px] font-medium tracking-wide opacity-70">
                {exercise.muscle}
              </p>
              <p className="text-sm font-semibold leading-snug">
                {exercise.title}
              </p>
              <p className="font-mono text-xs opacity-80">
                {exercise.primaryMeta}
              </p>
              <p className="text-[11px] opacity-70">{exercise.secondaryMeta}</p>
              <Link
                href={exercise.href}
                className="mt-1 flex w-fit items-center gap-1 rounded-full bg-black/10 px-3 py-1 text-xs font-medium dark:bg-white/15"
              >
                Ver
                <ArrowRight className="size-3" />
              </Link>
            </PastelCard>
          ))}
        </div>
      </div>
    </div>
  );
}
