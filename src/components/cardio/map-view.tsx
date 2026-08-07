"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";
import type { Coordinate } from "@/lib/store/cardio-store";
import { cleanTrace } from "@/lib/cardio/clean-trace";

// (Aqui habia un "fix" de los iconos por defecto de Leaflet apuntando a
// cdnjs.cloudflare.com. Era codigo muerto: este mapa solo usa Polyline y
// CircleMarker, nunca Marker, asi que L.Icon.Default no llega a instanciarse.)

interface MapViewProps {
  coordinates: Coordinate[];
  /** Descarta los saltos imposibles del GPS antes de dibujar. Para rutas ya
   *  terminadas; en el seguimiento en vivo se pinta la traza tal cual llega. */
  cleanOutliers?: boolean;
}

function MapUpdater({ coordinates }: { coordinates: Coordinate[] }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates.length === 0) return;
    const lastCoord = coordinates[coordinates.length - 1];
    // Wait until Leaflet has fully initialised all panes before animating,
    // otherwise _leaflet_pos is undefined and throws on zoom transitions.
    const move = () => {
      try {
        map.setView([lastCoord.lat, lastCoord.lng], 16, { animate: true });
      } catch {
        // Map was torn down mid-animation (e.g. component unmounted), ignore.
      }
    };
    if (map.getPane("mapPane")) {
      move();
    } else {
      map.whenReady(move);
    }
  }, [coordinates, map]);
  return null;
}

export default function MapView({ coordinates, cleanOutliers = false }: MapViewProps) {
  const { resolvedTheme } = useTheme();
  const [mounted] = useState(() => typeof document !== "undefined");

  // Se calcula aqui mismo, sin red: es un recorrido O(n) sobre unos cientos de
  // puntos. Antes esto era un POST a /api/match que ademas salia a un servidor
  // de terceros, y se repetia cada vez que abrias el detalle de la ruta.
  const drawn = useMemo(
    () => (cleanOutliers && coordinates.length >= 2 ? cleanTrace(coordinates) : coordinates),
    [cleanOutliers, coordinates],
  );

  if (!mounted) return null;

  // Usa estilos CartoDB: Positron (claro) y Dark Matter (oscuro) que encajan mejor con la app
  const tileUrl = resolvedTheme === "dark" 
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const defaultCenter: [number, number] = coordinates.length > 0 
    ? [coordinates[0].lat, coordinates[0].lng] 
    : [40.4168, -3.7038]; // Madrid por defecto

  // El punto final (circulo) sale de la traza real, no de la limpiada, para que
  // marque donde acabaste de verdad.
  const positions: [number, number][] = coordinates.map((c) => [c.lat, c.lng]);
  const linePositions: [number, number][] = drawn.map((c) => [c.lat, c.lng]);

  return (
    <div className="h-full w-full bg-muted">
      <MapContainer
        center={defaultCenter}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url={tileUrl}
        />
        {positions.length > 0 && (
          <>
            <Polyline positions={linePositions} color="#3b82f6" weight={5} opacity={0.8} />
            <CircleMarker
              center={positions[positions.length - 1]}
              radius={8}
              pathOptions={{ fillColor: "#3b82f6", color: "white", weight: 3, fillOpacity: 1 }}
            />
          </>
        )}
        <MapUpdater coordinates={coordinates} />
      </MapContainer>
    </div>
  );
}
