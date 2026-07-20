"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, MapPin, Activity, Clock, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCardio } from "@/lib/store/cardio-store";

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

  const session = useMemo(
    () => history.find((s) => s.id === id),
    [history, id],
  );

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

  // Estimación muy básica de calorías para simular
  const calories = Math.round(session.durationSec * 0.15); // ~9 kcal/min

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
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Actividad</h1>
          <p className="text-xs text-muted-foreground capitalize">
            {dateFormatted}
          </p>
        </div>
      </div>

      {/* Map container */}
      <div className="relative h-[300px] w-full overflow-hidden rounded-3xl border border-border shadow-sm">
        <MapView coordinates={session.coordinates} snapToRoads />
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
    </div>
  );
}
