"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, MapPin, Mountain, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCardio } from "@/lib/store/cardio-store";
import { fetchRoute, type SavedRouteFull } from "@/lib/cardio/saved-routes";
import { useToast } from "@/components/ui/toast";

const MapView = dynamic(() => import("@/components/cardio/map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <p className="animate-pulse text-sm text-muted-foreground">Cargando mapa...</p>
    </div>
  ),
});

export default function SavedRouteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { notify } = useToast();
  const { isTracking, startTracking } = useCardio();
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

  function repeat() {
    if (route === "loading" || !route) return;
    if (isTracking) {
      notify("Ya tienes un cardio en marcha. Termínalo antes de seguir una ruta.", "info");
      return;
    }
    // Abre la pantalla de tracking de siempre, con la ruta ya de fondo.
    startTracking(route.id, route.coordinates);
  }

  return (
    <div className="flex flex-col gap-6 pt-2 pb-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/app/cardio")}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{route.name}</h1>
          <p className="font-mono text-xs text-muted-foreground">Ruta guardada</p>
        </div>
      </div>

      <div className="relative h-[46dvh] min-h-[300px] max-h-[520px] w-full overflow-hidden rounded-3xl border border-border shadow-sm">
        <MapView coordinates={[]} ghostRoute={route.coordinates} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center justify-center gap-1 rounded-3xl border border-border bg-surface p-5">
          <MapPin className="size-5 text-muted-foreground" />
          <p className="mt-1 font-mono text-3xl font-semibold">
            {route.distanceKm.toFixed(2)}
            <span className="text-lg">km</span>
          </p>
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
            DISTANCIA
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 rounded-3xl border border-border bg-surface p-5">
          <Mountain className="size-5 text-muted-foreground" />
          <p className="mt-1 font-mono text-3xl font-semibold">
            {route.elevationGainM != null ? route.elevationGainM : "--"}
            <span className="text-lg">m</span>
          </p>
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
            DESNIVEL +
          </p>
        </div>
      </div>

      <Button fullWidth onClick={repeat} className="py-4 text-base font-semibold shadow-lg">
        <Play className="size-5 fill-current" />
        Repetir esta ruta
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <MapPin className="size-3.5" />
        Verde = inicio · Rojo = final. Al empezar, tu recorrido la irá completando.
      </p>
    </div>
  );
}
