"use client";

import dynamic from "next/dynamic";
import { Minimize2, Play, Pause, Square, MapPin, Activity, Clock } from "lucide-react";
import { useCardio } from "@/lib/store/cardio-store";

const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <p className="text-sm text-muted-foreground animate-pulse">Cargando mapa...</p>
    </div>
  ),
});

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function RouteTrackerModal() {
  const {
    isTracking,
    isPaused,
    isMinimized,
    coordinates,
    distanceKm,
    durationSec,
    pauseTracking,
    resumeTracking,
    stopTracking,
    minimize,
  } = useCardio();

  if (!isTracking || isMinimized) return null;

  const pace = distanceKm > 0 ? durationSec / 60 / distanceKm : 0;
  const paceMin = Math.floor(pace);
  const paceSec = Math.round((pace - paceMin) * 60);
  const paceDisplay = pace > 0 ? `${paceMin}'${paceSec.toString().padStart(2, "0")}"` : "--";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Map */}
      <div className="flex-1 relative">
        <MapView coordinates={coordinates} />

        {/* Top overlay */}
        <div className="absolute inset-x-0 top-0 z-[400] flex items-start justify-between p-5 pt-[calc(env(safe-area-inset-top)+1rem)] bg-gradient-to-b from-background/80 to-transparent">
          <span className="rounded-full bg-background/80 px-4 py-1.5 font-mono text-xs font-semibold tracking-widest backdrop-blur-md">
            {isPaused ? "PAUSADO" : "GRABANDO RUTA"}
          </span>
          <button
            onClick={minimize}
            className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
          >
            <Minimize2 className="size-5" />
          </button>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="rounded-t-[2.5rem] bg-background p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.1)] dark:border-t dark:border-border">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="flex flex-col items-center gap-1">
            <Clock className="size-5 text-muted-foreground" />
            <p className="mt-1 font-mono text-3xl font-semibold">{formatTime(durationSec)}</p>
            <p className="text-xs text-muted-foreground">TIEMPO</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <MapPin className="size-5 text-muted-foreground" />
            <p className="mt-1 font-mono text-3xl font-semibold">
              {distanceKm.toFixed(2)}<span className="text-lg">km</span>
            </p>
            <p className="text-xs text-muted-foreground">DISTANCIA</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Activity className="size-5 text-muted-foreground" />
            <p className="mt-1 font-mono text-3xl font-semibold">{paceDisplay}</p>
            <p className="text-xs text-muted-foreground">RITMO</p>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 flex items-center justify-center gap-6">
          {isPaused ? (
            <>
              <button
                onClick={stopTracking}
                className="flex size-16 items-center justify-center rounded-full bg-neutral-200 text-neutral-900 transition-transform active:scale-95 dark:bg-neutral-800 dark:text-white"
              >
                <Square className="size-6 fill-current" />
              </button>
              <button
                onClick={resumeTracking}
                className="flex size-20 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/20 transition-transform active:scale-95"
              >
                <Play className="size-8 fill-current ml-1" />
              </button>
            </>
          ) : (
            <button
              onClick={pauseTracking}
              className="flex size-20 items-center justify-center rounded-full bg-amber-500 text-white shadow-xl shadow-amber-500/20 transition-transform active:scale-95"
            >
              <Pause className="size-8 fill-current" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
