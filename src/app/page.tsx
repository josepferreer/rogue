import Link from "next/link";
import { ArrowRight, Flame, Layers, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
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

      <PastelCard variant="lilac" className="flex flex-col gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-card-lilac-foreground/70">
            {todaySession.dayLabel.toUpperCase()}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{todaySession.title}</h2>
          <p className="mt-1 font-mono text-sm text-card-lilac-foreground/80">
            {todaySession.exerciseCount} ejercicios · {todaySession.estMinutes} min
          </p>
        </div>
        <Button variant="primary" className="w-full">
          Empezar entreno
        </Button>
      </PastelCard>

      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
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
        <div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1">
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
                href="/biblioteca"
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
