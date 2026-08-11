"use client";

import dynamic from "next/dynamic";
import {
  Minimize2,
  Play,
  Pause,
  Square,
  MapPin,
  Activity,
  Clock,
  TriangleAlert,
} from "lucide-react";
import { useCardio } from "@/lib/store/cardio-store";
import { useBackButton } from "@/lib/use-back-button";

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
    gpsError,
    gpsNeedsSettings,
    pauseTracking,
    resumeTracking,
    stopTracking,
    minimize,
    openLocationSettings,
  } = useCardio();

  // "Atrás" (APK/PWA) minimiza la ruta en vez de sacar la app al home.
  useBackButton(isTracking && !isMinimized, minimize);

  if (!isTracking || isMinimized) return null;

  const pace = distanceKm > 0 ? durationSec / 60 / distanceKm : 0;
  const paceMin = Math.floor(pace);
  const paceSec = Math.round((pace - paceMin) * 60);
  const paceDisplay = pace > 0 ? `${paceMin}'${paceSec.toString().padStart(2, "0")}"` : "--";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden">
      {/* Map (Fondo completo) */}
      <div className="absolute inset-0 z-0">
        <MapView coordinates={coordinates} />
      </div>

      {/* Top overlay */}
      <div className="absolute inset-x-0 top-0 z-[400] flex items-start justify-between p-5 pt-[calc(env(safe-area-inset-top)+1rem)] bg-gradient-to-b from-background/80 via-background/40 to-transparent pointer-events-none">
        <span className="pointer-events-auto rounded-full bg-surface/80 px-4 py-1.5 font-mono text-xs font-semibold tracking-widest backdrop-blur-md shadow-sm border border-border/40">
          {isPaused ? "PAUSADO" : "GRABANDO RUTA"}
        </span>
        <button
          onClick={minimize}
          aria-label="Minimizar ruta"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-surface/80 hover:bg-surface shadow-sm backdrop-blur-md border border-border/40 transition-transform active:scale-95"
        >
          <Minimize2 className="size-5" />
        </button>
      </div>

      {gpsError && (
        <div className="absolute inset-x-5 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[400] rounded-2xl bg-red-600/90 px-4 py-3 text-white shadow-lg backdrop-blur-md border border-red-500/30">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="text-xs leading-snug">{gpsError}</p>
          </div>
          {gpsNeedsSettings && (
            <button
              onClick={openLocationSettings}
              className="mt-2.5 w-full rounded-xl bg-white/20 px-3 py-2 text-xs font-semibold backdrop-blur-md transition-colors hover:bg-white/30"
            >
              Abrir ajustes de la app
            </button>
          )}
        </div>
      )}

      {/* Bottom floating glass panel */}
      <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[400] rounded-[2.5rem] bg-surface/85 p-6 backdrop-blur-xl border border-border/60 shadow-2xl md:mx-auto md:w-full md:max-w-xl">
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
        <div className="mt-6 flex items-center justify-center gap-6">
          {isPaused ? (
            <>
              <button
                onClick={stopTracking}
                aria-label="Terminar ruta"
                className="flex size-16 items-center justify-center rounded-full bg-neutral-200 text-neutral-900 shadow-lg transition-transform active:scale-95 dark:bg-neutral-800 dark:text-white"
              >
                <Square className="size-6 fill-current" />
              </button>
              <button
                onClick={resumeTracking}
                aria-label="Reanudar ruta"
                className="flex size-20 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 transition-transform active:scale-95"
              >
                <Play className="size-8 fill-current ml-1" />
              </button>
            </>
          ) : (
            <button
              onClick={pauseTracking}
              aria-label="Pausar ruta"
              className="flex size-20 items-center justify-center rounded-full bg-amber-500 text-white shadow-xl shadow-amber-500/30 transition-transform active:scale-95"
            >
              <Pause className="size-8 fill-current" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
