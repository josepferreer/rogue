"use client";

import { useState } from "react";

import { Flame, Footprints, Timer, TrendingUp, Play } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { RouteTrackerModal } from "@/components/cardio/route-tracker-modal";

export default function CardioPage() {
  const [isTracking, setIsTracking] = useState(false);

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
      <div className="rounded-3xl bg-white p-5 text-neutral-900 shadow-[0_16px_48px_-16px_rgba(23,24,28,0.25)] dark:bg-neutral-900 dark:text-neutral-100">
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-neutral-100 px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.15em] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            HOY
          </span>
          <Footprints className="size-5 text-neutral-400" />
        </div>
        <div className="mt-4">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            6,432
          </h2>
          <p className="mt-1 font-mono text-sm text-neutral-500">pasos</p>
        </div>
        
        <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] font-medium tracking-wider text-neutral-500">
              OBJETIVO
            </span>
            <span className="text-sm font-medium">10,000 pasos</span>
          </div>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div className="h-full w-[64%] rounded-full bg-blue-500" />
          </div>
        </div>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-2 gap-3">
        <PastelCard variant="blue" className="flex flex-col gap-2">
          <Flame className="size-4 text-blue-600/70" />
          <div className="mt-2">
            <p className="text-2xl font-semibold leading-none">
              450
            </p>
            <p className="mt-1 text-xs text-muted-foreground">kcal quemadas</p>
          </div>
        </PastelCard>
        
        <PastelCard variant="green" className="flex flex-col gap-2">
          <Timer className="size-4 text-green-600/70" />
          <div className="mt-2">
            <p className="text-2xl font-semibold leading-none">
              45<span className="text-base font-normal text-muted-foreground">m</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">tiempo activo</p>
          </div>
        </PastelCard>
        
        <PastelCard variant="purple" className="flex flex-col gap-2">
          <TrendingUp className="size-4 text-purple-600/70" />
          <div className="mt-2">
            <p className="text-2xl font-semibold leading-none">
              5.2<span className="text-base font-normal text-muted-foreground">km</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">distancia</p>
          </div>
        </PastelCard>
      </div>

      {/* Action Button */}
      <div className="mt-4 flex justify-center">
        <button
          onClick={() => setIsTracking(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 py-4 text-base font-semibold text-white shadow-lg transition-transform active:scale-95 dark:bg-white dark:text-neutral-900"
        >
          <Play className="size-5 fill-current" />
          Empezar Ruta Libre
        </button>
      </div>

      {isTracking && (
        <RouteTrackerModal
          onClose={() => setIsTracking(false)}
          onSave={(routeData) => {
            console.log("Ruta guardada:", routeData);
            // TODO: Guardar en el store global
          }}
        />
      )}
    </div>
  );
}
