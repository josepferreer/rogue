"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, MapPin, Activity, Clock, Flame, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { estimateKcal } from "@/lib/cardio/estimates";
import { useRogue } from "@/lib/store/rogue-store";
import {
  fetchCoordinates,
  useCardio,
  type Coordinate,
} from "@/lib/store/cardio-store";
import { RouteChart } from "@/components/cardio/route-chart";

const MapView = dynamic(() => import("@/components/cardio/map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <p className="animate-pulse text-sm text-muted-foreground">
        Cargando mapa...
      </p>
    </div>
  ),
});

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function ActivityDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { history } = useCardio();
  const { profile } = useRogue();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const session = useMemo(
    () => history.find((s) => s.id === id),
    [history, id],
  );

  // La polilinea NO viene en el listado (son ~130 KB por ruta y solo se pinta
  // aqui): se pide por id al abrir el detalle. Si la sesion acaba de terminar,
  // ya la trae en memoria y no hace falta consultar.
  const [fetched, setFetched] = useState<Coordinate[] | null>(null);
  // Derivado, no copiado: si la sesion ya trae la traza (acaba de terminar) se
  // usa esa; si no, la que se haya descargado.
  const coordinates = session?.coordinates ?? fetched ?? [];

  useEffect(() => {
    if (session?.coordinates) return;
    let vigente = true;
    const supabase = createClient();
    fetchCoordinates(supabase, id)
      .then((puntos) => {
        if (vigente) setFetched(puntos);
      })
      .catch((err) => {
        console.error("No se pudo cargar la ruta:", err);
      });
    return () => {
      vigente = false;
    };
  }, [id, session?.coordinates]);

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pt-24 text-center">
        <p className="text-muted-foreground">Actividad no encontrada.</p>
        <Button onClick={() => router.push("/app/cardio")} className="px-6 py-2">
          Volver a Cardio
        </Button>
      </div>
    );
  }

  const pace =
    session.distanceKm > 0 ? session.durationSec / 60 / session.distanceKm : 0;
  const paceMin = Math.floor(pace);
  const paceSec = Math.round((pace - paceMin) * 60);
  const paceDisplay =
    pace > 0 ? `${paceMin}'${paceSec.toString().padStart(2, "0")}"` : "--";

  // Misma estimación que el resumen de cardio: antes esta pantalla usaba una
  // fórmula distinta (por tiempo) y la misma ruta mostraba dos cifras.
  const calories = estimateKcal(session.distanceKm, profile.bodyweightKg);

  const dateFormatted = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(session.dateISO));

  return (
    <div className="flex flex-col gap-6 pt-2 pb-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/app/cardio")}
          className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Actividad</h1>
          <p className="truncate text-xs text-muted-foreground capitalize">
            {dateFormatted}
          </p>
        </div>
      </div>

      {/* Map container. Altura relativa a la pantalla (debajo sobraba hueco en
          moviles altos), con topes para que no se coma la vista en pantallas
          bajas ni se estire de mas en desktop o pantalla completa. */}
      <div
        className={
          isFullscreen
            ? "fixed inset-0 z-50 h-screen w-screen bg-background overflow-hidden"
            : "relative h-[46dvh] min-h-[300px] max-h-[520px] w-full overflow-hidden rounded-3xl border border-border shadow-sm"
        }
      >
        <MapView 
          coordinates={coordinates} 
          cleanOutliers 
          topBar={
            isFullscreen 
              ? {
                  title: "RUTA COMPLETADA",
                  onAction: () => setIsFullscreen(false),
                  actionIcon: <Minimize2 className="size-5" />,
                  actionAriaLabel: "Cerrar pantalla completa"
                }
              : undefined
          }
        />
        {!isFullscreen && (
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute left-4 top-4 z-[350] flex size-10 items-center justify-center rounded-full bg-surface/90 hover:bg-surface shadow-md backdrop-blur-md border border-border active:scale-95 transition-transform"
            aria-label="Pantalla completa"
          >
            <Maximize2 className="size-5" />
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center justify-center gap-1 rounded-3xl border border-border bg-surface p-5">
          <Clock className="size-5 text-muted-foreground" />
          <p className="mt-1 font-mono text-3xl font-semibold">
            {formatTime(session.durationSec)}
          </p>
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
            TIEMPO
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 rounded-3xl border border-border bg-surface p-5">
          <MapPin className="size-5 text-muted-foreground" />
          <p className="mt-1 font-mono text-3xl font-semibold">
            {session.distanceKm.toFixed(2)}
            <span className="text-lg">km</span>
          </p>
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
            DISTANCIA
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 rounded-3xl border border-border bg-surface p-5">
          <Activity className="size-5 text-muted-foreground" />
          <p className="mt-1 font-mono text-3xl font-semibold">{paceDisplay}</p>
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
            RITMO MEDIO
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 rounded-3xl border border-border bg-surface p-5">
          <Flame className="size-5 text-muted-foreground" />
          <p className="mt-1 font-mono text-3xl font-semibold">{calories}</p>
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground">
            KCAL
          </p>
        </div>
      </div>

      <RouteChart coordinates={coordinates} />
    </div>
  );
}
