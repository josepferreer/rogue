"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Flame,
  Footprints,
  Timer,
  TrendingUp,
  Play,
  ChevronRight,
  Activity,
  Pencil,
  Minus,
  Plus,
} from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { Button } from "@/components/ui/button";
import { useCardio } from "@/lib/store/cardio-store";
import { useRogue } from "@/lib/store/rogue-store";

/** Zancada media (m) para estimar pasos desde la distancia recorrida.
 *  La web no tiene acceso al podometro del telefono, asi que los pasos se
 *  estiman a partir de las rutas registradas. */
const STRIDE_M = 0.75;

const STEP_GOAL_KEY = "rogue.stepGoal.v1";
const DEFAULT_STEP_GOAL = 10000;

function isToday(dateISO: string) {
  const d = new Date(dateISO);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function StepGoalEditor({
  goal,
  onChange,
  onClose,
}: {
  goal: number;
  onChange: (g: number) => void;
  onClose: () => void;
}) {
  const step = 500;
  const clamp = (n: number) => Math.min(50000, Math.max(1000, n));
  return (
    <div className="mt-4 flex items-center justify-between rounded-2xl bg-muted p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Reducir objetivo"
          onClick={() => onChange(clamp(goal - step))}
          className="flex size-9 items-center justify-center rounded-full bg-surface text-muted-foreground hover:text-foreground"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-20 text-center font-mono text-sm font-semibold">
          {goal.toLocaleString("es-ES")}
        </span>
        <button
          type="button"
          aria-label="Aumentar objetivo"
          onClick={() => onChange(clamp(goal + step))}
          className="flex size-9 items-center justify-center rounded-full bg-surface text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
      >
        Listo
      </button>
    </div>
  );
}

export default function CardioPage() {
  const {
    isTracking,
    startTracking,
    maximize,
    history,
    distanceKm: liveDistanceKm,
    durationSec: liveDurationSec,
  } = useCardio();
  const { profile } = useRogue();

  // Objetivo de pasos editable (guardado en este dispositivo).
  const [stepGoal, setStepGoal] = useState(DEFAULT_STEP_GOAL);
  const [editingGoal, setEditingGoal] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STEP_GOAL_KEY);
      if (raw) setStepGoal(Number(raw) || DEFAULT_STEP_GOAL);
    } catch {
      /* valor por defecto */
    }
  }, []);
  const updateStepGoal = (g: number) => {
    setStepGoal(g);
    try {
      localStorage.setItem(STEP_GOAL_KEY, String(g));
    } catch {
      /* solo en memoria */
    }
  };

  // Actividad real de HOY: rutas guardadas hoy + la sesion en curso.
  const today = useMemo(() => {
    const sessions = history.filter((s) => isToday(s.dateISO));
    let distanceKm = sessions.reduce((sum, s) => sum + s.distanceKm, 0);
    let durationSec = sessions.reduce((sum, s) => sum + s.durationSec, 0);
    if (isTracking) {
      distanceKm += liveDistanceKm;
      durationSec += liveDurationSec;
    }
    return { distanceKm, durationSec };
  }, [history, isTracking, liveDistanceKm, liveDurationSec]);

  // Pasos estimados desde la distancia (sin podometro en la web).
  const steps = Math.round((today.distanceKm * 1000) / STRIDE_M);
  // Correr/caminar ~1 kcal por kg de peso y km recorrido.
  const kcal = Math.round(today.distanceKm * profile.bodyweightKg);
  const activeMin = Math.floor(today.durationSec / 60);
  const goalPct = Math.min(100, (steps / stepGoal) * 100);

  function formatDuration(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col gap-6 pt-2 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cardio y Actividad
        </h1>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          RESUMEN
        </p>
      </div>

      {/* Main card */}
      <div className="rounded-3xl p-5 bg-surface text-foreground border border-border">
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-muted px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.15em] text-muted-foreground">
            HOY
          </span>
          <Footprints className="size-5 text-muted-foreground" />
        </div>
        <div className="mt-4">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            {steps.toLocaleString("es-ES")}
          </h2>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            pasos estimados por tus rutas
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setEditingGoal((v) => !v)}
            className="flex flex-col text-left"
          >
            <span className="font-mono text-[10px] font-medium tracking-wider text-muted-foreground">
              OBJETIVO
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {stepGoal.toLocaleString("es-ES")} pasos
              <Pencil className="size-3 text-muted-foreground" />
            </span>
          </button>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-500"
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </div>

        {editingGoal && (
          <StepGoalEditor
            goal={stepGoal}
            onChange={updateStepGoal}
            onClose={() => setEditingGoal(false)}
          />
        )}
      </div>

      {/* Action Button */}
      <div className="mt-4 flex justify-center">
        <Button
          fullWidth
          onClick={isTracking ? maximize : startTracking}
          className="px-6 py-4 text-base font-semibold shadow-lg"
        >
          <Play className="size-5 fill-current" />
          {isTracking ? "Ver Ruta Activa" : "Empezar Ruta Libre"}
        </Button>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-2 gap-3">
        <PastelCard variant="blue" className="flex flex-col gap-2">
          <Flame className="size-4 text-blue-600/70" />
          <div className="mt-2">
            <p className="text-2xl font-semibold leading-none">{kcal}</p>
            <p className="mt-1 text-xs text-muted-foreground">kcal quemadas</p>
          </div>
        </PastelCard>

        <PastelCard variant="mint" className="flex flex-col gap-2">
          <Timer className="size-4 text-green-600/70" />
          <div className="mt-2">
            <p className="text-2xl font-semibold leading-none">
              {activeMin}
              <span className="text-base font-normal text-muted-foreground">m</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">tiempo activo</p>
          </div>
        </PastelCard>

        <PastelCard variant="lilac" className="flex flex-col gap-2">
          <TrendingUp className="size-4 text-purple-600/70" />
          <div className="mt-2">
            <p className="text-2xl font-semibold leading-none">
              {today.distanceKm.toFixed(1)}
              <span className="text-base font-normal text-muted-foreground">km</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">distancia</p>
          </div>
        </PastelCard>
      </div>



      {/* History section */}
      <div className="mt-6 flex flex-col gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            HISTORIAL
          </p>
        </div>
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-3">
          {history.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground md:col-span-2">
              Aún no hay rutas guardadas.
            </div>
          ) : (
            history.map((session) => (
              <Link
                href={`/app/cardio/actividad/${session.id}`}
                key={session.id}
                className="flex items-center justify-between rounded-3xl border border-border bg-surface p-4 transition-colors hover:bg-muted/40 active:bg-muted"
              >
                <div className="flex items-center gap-4">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Activity className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {new Intl.DateTimeFormat("es-ES", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      }).format(new Date(session.dateISO))}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {session.distanceKm.toFixed(2)} km · {formatDuration(session.durationSec)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-5 text-muted-foreground" />
              </Link>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
