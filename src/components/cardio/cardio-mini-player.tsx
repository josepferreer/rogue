"use client";

import { Footprints, MapPin } from "lucide-react";
import { useCardio } from "@/lib/store/cardio-store";

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CardioMiniPlayer() {
  const { isTracking, isMinimized, isPaused, distanceKm, durationSec, maximize } = useCardio();

  if (!isTracking || !isMinimized) return null;

  return (
    <button
      onClick={maximize}
      className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-30 flex items-center gap-3 rounded-2xl border border-border bg-background/80 px-4 py-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-transform active:scale-[0.98] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)] md:inset-x-auto md:left-auto md:right-6 md:bottom-6 md:w-96"
    >
      {/* Pulsing indicator */}
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
        <Footprints className="size-4 text-blue-500" />
        {!isPaused && (
          <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-blue-500">
            <span className="absolute inset-0 animate-ping rounded-full bg-blue-500 opacity-75" />
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-1 items-center justify-between">
        <div className="flex flex-col items-start">
          <span className="text-[10px] font-mono tracking-wider text-muted-foreground">
            {isPaused ? "PAUSADO" : "GRABANDO RUTA"}
          </span>
          <span className="font-mono text-sm font-semibold">
            {formatTime(durationSec)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-3.5" />
          <span className="font-mono text-sm font-medium text-foreground">
            {distanceKm.toFixed(2)} km
          </span>
        </div>
      </div>

      {/* Tap hint */}
      <div className="ml-1 rounded-lg bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
        Abrir
      </div>
    </button>
  );
}
