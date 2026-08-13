"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Flag, Play, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCardio } from "@/lib/store/cardio-store";
import { fetchRoute, type SavedRouteFull } from "@/lib/cardio/saved-routes";
import { haversineKm } from "@/lib/cardio/gpx";
import { useToast } from "@/components/ui/toast";

const MapView = dynamic(() => import("@/components/cardio/map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <p className="animate-pulse text-sm text-muted-foreground">Cargando mapa...</p>
    </div>
  ),
});

export default function FollowRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { notify } = useToast();
  const {
    isTracking,
    coordinates,
    distanceKm,
    durationSec,
    startTracking,
    stopTracking,
    gpsError,
  } = useCardio();

  const [route, setRoute] = useState<SavedRouteFull | null | "loading">("loading");

  useEffect(() => {
    let alive = true;
    fetchRoute(id)
      .then((r) => {
        if (alive) setRoute(r);
      })
      .catch(() => {
        if (alive) setRoute(null);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const routeDistance = route && route !== "loading" ? route.distanceKm : 0;
  const progressPct =
    routeDistance > 0 ? Math.min(100, (distanceKm / routeDistance) * 100) : 0;

  // Pista de "estás llegando" cuando la posición en vivo se acerca al final.
  const nearEnd = useMemo(() => {
    if (route === "loading" || !route || coordinates.length === 0) return false;
    const end = route.coordinates[route.coordinates.length - 1];
    const last = coordinates[coordinates.length - 1];
    if (!end || !last) return false;
    return haversineKm(last, end) < 0.06; // 60 m
  }, [route, coordinates]);

  if (route === "loading") {
    return (
      <div className="flex justify-center pt-24">
        <p className="animate-pulse text-sm text-muted-foreground">Cargando ruta…</p>
      </div>
    );
  }
  if (!route) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pt-24 text-center">
        <p className="text-muted-foreground">Ruta no encontrada.</p>
        <Button onClick={() => router.push("/app/cardio")} className="px-6 py-2">
          Volver a Cardio
        </Button>
      </div>
    );
  }

  function start() {
    if (isTracking) {
      notify("Ya tienes un cardio en marcha. Termínalo antes de seguir una ruta.", "info");
      return;
    }
    startTracking(id);
  }

  function finish() {
    stopTracking();
    notify("¡Ruta completada! Guardada en tu historial.", "success");
    router.push("/app/cardio");
  }

  const min = Math.floor(durationSec / 60);
  const sec = durationSec % 60;

  return (
    <div className="flex flex-col gap-4 pt-2 pb-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/app/cardio")}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{route.name}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            {route.distanceKm.toFixed(2)} km
            {route.elevationGainM != null ? ` · ${route.elevationGainM} m D+` : ""}
          </p>
        </div>
      </div>

      <div className="relative h-[58dvh] min-h-[320px] w-full overflow-hidden rounded-3xl border border-border shadow-sm">
        <MapView coordinates={coordinates} ghostRoute={route.coordinates} />
        {nearEnd && (
          <div className="absolute inset-x-0 top-4 z-[350] flex justify-center">
            <span className="rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
              ¡Estás llegando al final! 🏁
            </span>
          </div>
        )}
      </div>

      {isTracking && (
        <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono text-muted-foreground">
              {distanceKm.toFixed(2)} / {route.distanceKm.toFixed(2)} km
            </span>
            <span className="font-mono text-muted-foreground">
              {min}:{sec.toString().padStart(2, "0")}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {gpsError && (
        <p className="text-center text-sm text-destructive">{gpsError}</p>
      )}

      {isTracking ? (
        <Button fullWidth onClick={finish} className="py-4 text-base font-semibold">
          <Flag className="size-5" />
          Terminar y guardar
        </Button>
      ) : (
        <Button fullWidth onClick={start} className="py-4 text-base font-semibold shadow-lg">
          <Play className="size-5 fill-current" />
          Empezar seguimiento
        </Button>
      )}

      {!isTracking && (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <MapPin className="size-3.5" />
          El punto verde es el inicio; el rojo, el final.
        </p>
      )}
    </div>
  );
}
