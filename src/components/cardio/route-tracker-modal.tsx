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

  /**
   * DIAGNÓSTICO TEMPORAL de altitud. En Android el plugin usa el proveedor
   * "fusionado" de Google, que a menudo NO rellena la altitud aunque la
   * posición horizontal sea buena; el resultado es que ninguna ruta guardada
   * tiene desnivel. Esto cuenta cuántas fijaciones llegan con altitud para
   * saber si el problema es del proveedor o del dispositivo.
   *
   * Quitar (junto con su línea en la UI) en cuanto haya respuesta.
   */
  const altitud = useMemo(() => {
    const con = coordinates.reduce((n, c) => n + (c.alt != null ? 1 : 0), 0);
    const ultima = coordinates[coordinates.length - 1];
    /**
     * Hora de la ÚLTIMA fijación, no "hace X segundos": si el GPS deja de
     * entregar, un contador relativo se congelaría igual que el resto y no se
     * notaría. Con la hora puesta se ve de un vistazo que lleva parada desde
     * las 14:03 aunque sean las 14:09.
     */
    const hora = ultima
      ? new Date(ultima.timestamp).toLocaleTimeString("es-ES", { hour12: false })
      : "—";
    /** Puntos que repiten exactamente la posición anterior: el sintoma de un
     *  proveedor que responde pero no actualiza. */
    let repetidos = 0;
    for (let i = 1; i < coordinates.length; i++) {
      const a = coordinates[i - 1];
      const b = coordinates[i];
      if (a.lat === b.lat && a.lng === b.lng) repetidos++;
    }
    return { con, total: coordinates.length, hora, repetidos };
  }, [coordinates]);

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
        <div className="absolute inset-x-5 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[400] rounded-2xl bg-amber-500/90 px-4 py-3 text-white shadow-lg backdrop-blur-md border border-amber-400/30">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="text-xs leading-snug">
              Te has salido de la ruta. Vuelve a ella para seguir completándola.
            </p>
          </div>
        </div>
      )}

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

        {/* DIAGNÓSTICO TEMPORAL: ver el comentario de `altitud` arriba. */}
        <p className="mt-3 text-center font-mono text-[11px] leading-relaxed text-muted-foreground">
          GPS: {altitud.total} fijaciones · {altitud.con} con altitud
          <br />
          última {altitud.hora} · {altitud.repetidos} repetidas
        </p>

        {/* Controls */}
        <div className="mt-6 flex items-center justify-center gap-6">
          {isPaused ? (
            <>
              <button
                onClick={() => setConfirmarDescarte(true)}
                aria-label="Descartar ruta"
                className="flex size-16 items-center justify-center rounded-full bg-neutral-200 text-red-600 shadow-lg transition-transform active:scale-95 dark:bg-neutral-800 dark:text-red-400"
              >
                <Trash2 className="size-6" />
              </button>
              <button
                onClick={() => stopTracking()}
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
