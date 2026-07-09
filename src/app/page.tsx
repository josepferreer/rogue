"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  Layers,
  Lock,
  Timer,
} from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { RankBadge } from "@/components/ui/rank-badge";
import { getDivisionLabel, getRankTier } from "@/lib/ranks";
import { useRogue } from "@/lib/store/rogue-store";
import { useWorkoutSession } from "@/lib/store/workout-session-store";
import type { ComputedRank } from "@/lib/rank-engine";
import type { RoutineDay, WorkoutSession } from "@/lib/workout/types";
import { exerciseSuggestions } from "@/lib/mock-data";
import { formatWeight } from "@/lib/units";
import { cn } from "@/lib/utils";

const WEEKDAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function useLastSevenDays(sessions: WorkoutSession[]) {
  return useMemo(() => {
    const trainedKeys = new Set(
      sessions.map((s) => new Date(s.dateISO).toISOString().slice(0, 10)),
    );
    const today = new Date();
    const days: { key: string; letter: string; num: number; trained: boolean; isToday: boolean; isFuture: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = toKey(d);
      days.push({
        key,
        letter: WEEKDAY_LETTERS[(d.getDay() + 6) % 7],
        num: d.getDate(),
        trained: trainedKeys.has(key),
        isToday: i === 0,
        isFuture: false,
      });
    }
    return days;
  }, [sessions]);
}

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

function TodayCard({
  todayDay,
  estMinutes,
  onStart,
}: {
  todayDay: RoutineDay | null;
  estMinutes: number;
  onStart: () => void;
}) {
  if (!todayDay) {
    return (
      <div className="flex h-full min-h-[212px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-surface p-5 text-center">
        <CalendarPlus className="size-7 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold">Aun no tienes dias de rutina</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crea tu primer dia de entreno desde el editor.
          </p>
        </div>
        <Link
          href="/rutinas/editor"
          className="mt-1 flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
        >
          Crear rutina
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[212px] rounded-3xl p-5 bg-surface text-foreground border border-border">
      <div className="flex items-start justify-between">
        <span className="rounded-full bg-muted px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.15em] text-muted-foreground">
          HOY · {todayDay.label.toUpperCase()}
        </span>
      </div>
      <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-tight">
        {todayDay.focus}
      </h2>
      <p className="mt-1.5 font-mono text-sm text-muted-foreground">
        {todayDay.exercises.length} ejercicios · {estMinutes} min
      </p>
      <div className="mt-5 flex items-center justify-end">
        <button
          type="button"
          onClick={onStart}
          className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
        >
          Empezar entreno
        </button>
      </div>
    </div>
  );
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function useSessionsByDay(sessions: WorkoutSession[]) {
  return useMemo(() => {
    const map = new Map<string, WorkoutSession[]>();
    for (const s of sessions) {
      const key = new Date(s.dateISO).toISOString().slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [sessions]);
}

function useMonthDays(sessions: WorkoutSession[], year: number, month: number) {
  return useMemo(() => {
    const trainedKeys = new Set(
      sessions.map((s) => new Date(s.dateISO).toISOString().slice(0, 10)),
    );
    const todayKey = toKey(new Date());
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: {
      key: string;
      num: number;
      trained: boolean;
      isToday: boolean;
      isFuture: boolean;
    }[] = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ key: `blank-${i}`, num: 0, trained: false, isToday: false, isFuture: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const key = toKey(date);
      cells.push({
        key,
        num: d,
        trained: trainedKeys.has(key),
        isToday: key === todayKey,
        isFuture: key > todayKey,
      });
    }
    return cells;
  }, [sessions, year, month]);
}

function formatDayDetail(dateKey: string) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${dateKey}T00:00:00`));
}

function WeekCalendarCard({ sessions }: { sessions: WorkoutSession[] }) {
  const { preferences } = useRogue();
  const days = useLastSevenDays(sessions);
  const trainedCount = days.filter((d) => d.trained).length;

  const now = new Date();
  const [expanded, setExpanded] = useState(false);
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const monthDays = useMonthDays(sessions, cursor.year, cursor.month);
  const monthTrainedCount = monthDays.filter((d) => d.trained).length;
  const sessionsByDay = useSessionsByDay(sessions);
  const selectedSessions = selectedKey ? sessionsByDay.get(selectedKey) : undefined;

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
    setSelectedKey(null);
  }

  return (
    <div className="h-full min-h-[212px] rounded-3xl p-5 bg-surface text-foreground border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between"
      >
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.15em] text-muted-foreground">
          <Calendar className="size-3" />
          {expanded ? "MES COMPLETO" : "ULTIMOS 7 DIAS"}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {!expanded ? (
        <>
          <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-tight">
            {trainedCount} de 7 entrenados
          </h2>
          <div className="mt-5 flex items-center justify-between">
            {days.map((d) => (
              <div key={d.key} className="flex flex-col items-center gap-1.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {d.letter}
                </span>
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full font-mono text-xs font-medium transition-colors",
                    d.trained
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "bg-muted text-muted-foreground",
                    d.isToday && !d.trained &&
                      "ring-2 ring-neutral-900 ring-offset-2 ring-offset-surface dark:ring-white",
                  )}
                >
                  {d.num}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold capitalize leading-tight tracking-tight">
              {MONTH_NAMES[cursor.month]} {cursor.year}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  shiftMonth(-1);
                }}
                aria-label="Mes anterior"
                className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  shiftMonth(1);
                }}
                aria-label="Mes siguiente"
                className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {monthTrainedCount} dias entrenados
          </p>
          <div className="mt-4 grid grid-cols-7 gap-y-2 text-center">
            {WEEKDAY_LETTERS.map((l, i) => (
              <span key={i} className="font-mono text-[10px] text-muted-foreground">
                {l}
              </span>
            ))}
            {monthDays.map((d) =>
              d.num === 0 ? (
                <span key={d.key} />
              ) : (
                <span key={d.key} className="flex items-center justify-center py-0.5">
                  <button
                    type="button"
                    disabled={!d.trained}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedKey((prev) => (prev === d.key ? null : d.key));
                    }}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full font-mono text-[11px] font-medium transition-colors",
                      d.trained
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                        : d.isFuture
                          ? "text-neutral-200 dark:text-neutral-700"
                          : "text-muted-foreground",
                      d.isToday && !d.trained &&
                        "ring-2 ring-neutral-900 ring-offset-1 ring-offset-surface dark:ring-white",
                      d.trained &&
                        selectedKey === d.key &&
                        "ring-2 ring-neutral-900 ring-offset-1 ring-offset-surface dark:ring-white",
                    )}
                  >
                    {d.num}
                  </button>
                </span>
              ),
            )}
          </div>

          {selectedKey && selectedSessions && (
            <div className="mt-4 rounded-2xl bg-muted p-3">
              <p className="text-xs font-semibold capitalize">
                {formatDayDetail(selectedKey)}
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {selectedSessions.map((s) => {
                  const groups = Array.from(new Set(s.sets.map((set) => set.grupo)));
                  const volume = s.sets.reduce(
                    (sum, set) => sum + set.weightKg * set.reps,
                    0,
                  );
                  return (
                    <div key={s.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium">{s.dayLabel}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {groups.join(" · ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xs font-medium">
                          {s.sets.length} series
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {formatWeight(volume, preferences.unit)} {preferences.unit}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Home() {
  const { profile, ranks, sessions, todayDay, preferences } = useRogue();
  const { start: startWorkout } = useWorkoutSession();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const page0Ref = useRef<HTMLDivElement>(null);
  const page1Ref = useRef<HTMLDivElement>(null);
  const [carouselHeight, setCarouselHeight] = useState<number>();

  useLayoutEffect(() => {
    const refs = [page0Ref, page1Ref];
    const active = refs[page].current;
    if (active) setCarouselHeight(active.scrollHeight);

    const observer = new ResizeObserver(() => {
      const el = refs[page].current;
      if (el) setCarouselHeight(el.scrollHeight);
    });
    refs.forEach((r) => r.current && observer.observe(r.current));
    return () => observer.disconnect();
  }, [page]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const midpoint = (el.scrollWidth - el.clientWidth) / 2;
    const next = el.scrollLeft > midpoint ? 1 : 0;
    setPage((p) => (p === next ? p : next));
  }

  function goToPage(i: number) {
    const refs = [page0Ref, page1Ref];
    refs[i].current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekSessions = sessions.filter(
    (s) => new Date(s.dateISO).getTime() >= weekAgo,
  );
  const weekVolume = weekSessions.reduce(
    (sum, s) => sum + s.sets.reduce((a, set) => a + set.weightKg * set.reps, 0),
    0,
  );
  const estMinutes = todayDay ? todayDay.exercises.length * 9 : 0;
  const initials =
    profile.name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "R";

  return (
    <div className="flex flex-col gap-6 pt-2">
      <Link href="/perfil" className="flex w-fit items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-accent-foreground">
          {initials}
        </span>
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            {formatToday()}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            Hola, {profile.name || "Atleta"}
          </h1>
        </div>
      </Link>

      <div>
        <div
          className="-mx-5 overflow-hidden transition-[height] duration-200 ease-out"
          style={{ height: carouselHeight }}
        >
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth items-start px-5"
          >
            <div ref={page0Ref} className="w-full shrink-0 snap-center snap-always">
              <TodayCard
                todayDay={todayDay}
                estMinutes={estMinutes}
                onStart={() => todayDay && startWorkout(todayDay)}
              />
            </div>
            <div ref={page1Ref} className="w-full shrink-0 snap-center snap-always">
              <WeekCalendarCard sessions={sessions} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              aria-label={i === 0 ? "Ver hoy" : "Ver calendario"}
              onClick={() => goToPage(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                page === i ? "w-5 bg-foreground" : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>
      </div>

      <div className="-mx-5 grid grid-cols-3 gap-3 px-5 pb-1">
        <PastelCard variant="neutral" className="flex flex-col gap-2">
          <Flame className="size-4 text-muted-foreground" />
          <div>
            <p className="font-mono text-lg font-medium leading-none">
              {sessions.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">entrenos totales</p>
          </div>
        </PastelCard>

        <PastelCard variant="neutral" className="flex flex-col gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <div>
            <p className="font-mono text-lg font-medium leading-none">
              {formatWeight(weekVolume, preferences.unit)}
              <span className="text-xs font-normal"> {preferences.unit}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">volumen semana</p>
          </div>
        </PastelCard>

        <PastelCard variant="neutral" className="flex flex-col gap-2">
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
            className="flex items-center gap-1 rounded-full py-2 pl-2 pr-1 text-xs font-medium text-muted-foreground hover:text-foreground"
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
                className="mt-1 flex w-fit items-center gap-1 rounded-full bg-black/10 px-3 py-2 text-xs font-medium dark:bg-white/15"
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
