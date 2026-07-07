"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Play, Pause, Square, MapPin, Activity, Clock } from "lucide-react";
import { useRouteTracker } from "@/hooks/use-route-tracker";

// Importación dinámica del mapa porque Leaflet requiere acceso a `window` (no compatible con SSR)
const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <p className="text-sm text-muted-foreground animate-pulse">Cargando mapa...</p>
    </div>
  ),
});

interface RouteTrackerModalProps {
  onClose: () => void;
  onSave: (routeData: any) => void;
}

export function RouteTrackerModal({ onClose, onSave }: RouteTrackerModalProps) {
  const {
    isTracking,
    isPaused,
    coordinates,
    distanceKm,
    durationSec,
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
  } = useRouteTracker();

  // Iniciar al abrir
  useEffect(() => {
    startTracking();
    return () => {
      stopTracking();
    };
  }, [startTracking, stopTracking]);

  const handleFinish = () => {
    stopTracking();
    onSave({
      dateISO: new Date().toISOString(),
      distanceKm,
      durationSec,
      coordinates,
    });
    onClose();
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Calcular ritmo medio (min/km)
  const pace = distanceKm > 0 ? (durationSec / 60) / distanceKm : 0;
  const paceMinutes = Math.floor(pace);
  const paceSeconds = Math.round((pace - paceMinutes) * 60);
  const paceDisplay = pace > 0 ? `${paceMinutes}'${paceSeconds.toString().padStart(2, "0")}"` : "--";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Contenedor del Mapa (fondo) */}
      <div className="flex-1 relative">
        <MapView coordinates={coordinates} />
        
        {/* Overlay superior */}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-background/80 to-transparent p-6 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-background/80 px-4 py-1.5 font-mono text-xs font-semibold tracking-widest backdrop-blur-md">
              {isTracking && !isPaused ? "GRABANDO RUTA" : "PAUSADO"}
            </span>
          </div>
        </div>
      </div>

      {/* Panel Inferior (Estadísticas y Controles) */}
      <div className="rounded-t-[2.5rem] bg-background p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.1)] dark:border-t dark:border-border dark:shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.5)]">
        
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
                onClick={handleFinish}
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
        
        {isPaused && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ruta pausada. Mantén pulsado el cuadrado para finalizar.
          </p>
        )}
      </div>
    </div>
  );
}
