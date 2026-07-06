import Link from "next/link";
import { ArrowRight, Flame, Layers, Target, Timer } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { RankBadge } from "@/components/ui/rank-badge";
import { DIVISION_LABELS, getRankTier } from "@/lib/ranks";
import {
  exerciseSuggestions,
  mockUser,
  muscleRanks,
  quickStats,
  todaySession,
} from "@/lib/mock-data";

function formatToday() {
  const formatted = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  }).format(new Date());
  return formatted.toUpperCase().replace(".", "");
}

export default function Home() {
  return (
    <div className="flex flex-col gap-6 pt-2">
      <div>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          {formatToday()}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Hola, {mockUser.name}
        </h1>
      </div>

      <div className="rounded-3xl bg-white p-5 text-neutral-900 shadow-[0_16px_48px_-16px_rgba(23,24,28,0.25)]">
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.15em] text-neutral-600">
            {todaySession.dayLabel.toUpperCase()}
          </span>

        </div>
        <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-tight">
          {todaySession.title}
        </h2>
        <p className="mt-1.5 font-mono text-sm text-neutral-500">
          {todaySession.exerciseCount} ejercicios · {todaySession.estMinutes} min
        </p>
        <div className="mt-5 flex items-center justify-between">

          <button
            type="button"
            className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Empezar entreno
          </button>
        </div>
      </div>

      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        <PastelCard variant="neutral" className="flex min-w-[128px] flex-col gap-2">
          <Flame className="size-4 text-muted-foreground" />
          <div>
            <p className="font-mono text-lg font-medium leading-none">
              {quickStats.streakDays}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">dias de racha</p>
          </div>
        </PastelCard>
        <PastelCard variant="neutral" className="flex min-w-[128px] flex-col gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <div>
            <p className="font-mono text-lg font-medium leading-none">
              {quickStats.weeklyVolumeKg.toLocaleString("es-ES")}
              <span className="text-xs font-normal">kg</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">volumen semana</p>
          </div>
        </PastelCard>
        <PastelCard variant="neutral" className="flex min-w-[128px] flex-col gap-2">
          <Timer className="size-4 text-muted-foreground" />
          <div>
            <p className="font-mono text-lg font-medium leading-none">
              {quickStats.sessionsThisWeek}/{quickStats.sessionsGoal}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">sesiones</p>
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
          {muscleRanks.map((rank) => (
            <div
              key={rank.muscle}
              className="flex min-w-[76px] flex-col items-center gap-1.5"
            >
              <RankBadge tier={rank.tier} division={rank.division} size="sm" />
              <p className="text-xs font-medium">{rank.muscle}</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {getRankTier(rank.tier).label.toUpperCase()}{" "}
                {DIVISION_LABELS[rank.division - 1]}
              </p>
            </div>
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
