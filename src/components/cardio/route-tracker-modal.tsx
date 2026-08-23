"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  Minimize2,
  Play,
  Pause,
  Square,
  Trash2,
  MapPin,
  Activity,
  Clock,
  TriangleAlert,
} from "lucide-react";
import { useCardio } from "@/lib/store/cardio-store";
import { cleanTrace } from "@/lib/cardio/clean-trace";
import { computeRouteProgress } from "@/lib/cardio/route-progress";
import { useBackButton } from "@/lib/use-back-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
    currentPosition,
    distanceKm,
    durationSec,
    followRoute,
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

  // Progreso sobre la ruta que se sigue: cuánto de ella se ha completado ya.
  // Es puro sobre la traza entera, así que no hace falta guardar estado.
  const progress = useMemo(
    () => computeRouteProgress(followRoute, cleanTrace(coordinates)),
    [followRoute, coordinates]
  );

  // Confirmación de descarte (guardar es irreversible al revés: una vez en el
  // historial hay que ir a borrarla a mano).
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  if (!isTracking || isMinimized) return null;

  const followTitle = progress
    ? progress.started
      ? `RUTA ${Math.round(progress.ratio * 100)}%`
      : "VE AL INICIO"
    : "GRABANDO RUTA";

  const pace = distanceKm > 0 ? durationSec / 60 / distanceKm : 0;
  const paceMin = Math.floor(pace);
  const paceSec = Math.round((pace - paceMin) * 60);
  const paceDisplay = pace > 0 ? `${paceMin}'${paceSec.toString().padStart(2, "0")}"` : "--";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden">
      {/* Map (Fondo completo) */}
      <div className="absolute inset-0 z-0">
        <MapView
          coordinates={coordinates}
          currentPosition={currentPosition}
          ghostRoute={followRoute.length > 0 ? followRoute : undefined}
          progress={progress}
          topBar={{
            title: isPaused ? "PAUSADO" : followTitle,
            onAction: minimize,
            actionIcon: <Minimize2 className="size-5" />,
            actionAriaLabel: "Minimizar ruta",
          }}
        />
      </div>

      {!gpsError && progress?.started && progress.offRoute && (
        <div className="absolute inset-x-5 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[400] rounded-2xl bg-accent-amber/90 px-4 py-3 text-white shadow-lg backdrop-blur-md border border-accent-amber/30">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="text-xs leading-snug">
              Te has salido de la ruta. Vuelve a ella para seguir completándola.
            </p>
          </div>
        </div>
      )}

      {gpsError && (
        <div className="absolute inset-x-5 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[400] rounded-2xl bg-destructive/90 px-4 py-3 text-white shadow-lg backdrop-blur-md border border-destructive/30">
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
      <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[400] rounded-3xl bg-surface/85 p-6 backdrop-blur-xl border border-border/60 shadow-2xl md:mx-auto md:w-full md:max-w-xl">
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
                onClick={() => setConfirmarDescarte(true)}
                aria-label="Descartar ruta"
                className="flex size-16 items-center justify-center rounded-full bg-muted text-destructive shadow-float transition-transform active:scale-95"
              >
                <Trash2 className="size-6" />
              </button>
              <button
                onClick={() => stopTracking()}
                aria-label="Terminar ruta"
                className="flex size-16 items-center justify-center rounded-full bg-muted text-foreground shadow-float transition-transform active:scale-95"
              >
                <Square className="size-6 fill-current" />
              </button>
              <button
                onClick={resumeTracking}
                aria-label="Reanudar ruta"
                className="flex size-20 items-center justify-center rounded-full bg-card-blue-foreground text-background shadow-xl transition-transform active:scale-95"
              >
                <Play className="size-8 fill-current ml-1" />
              </button>
            </>
          ) : (
            <button
              onClick={pauseTracking}
              aria-label="Pausar ruta"
              className="flex size-20 items-center justify-center rounded-full bg-accent-amber text-white shadow-xl shadow-accent-amber/30 transition-transform active:scale-95"
            >
              <Pause className="size-8 fill-current" />
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmarDescarte}
        title="¿Descartar esta ruta?"
        description={`Perderás ${distanceKm.toFixed(2)} km y ${formatTime(durationSec)} de grabación. No se guardará en tu historial.`}
        confirmLabel="Descartar"
        onConfirm={() => {
          setConfirmarDescarte(false);
          stopTracking({ discard: true });
        }}
        onCancel={() => setConfirmarDescarte(false)}
      />
    </div>
  );
}
