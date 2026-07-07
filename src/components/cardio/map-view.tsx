"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Coordinate } from "@/hooks/use-route-tracker";

// Fix para los iconos por defecto de Leaflet en Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface MapViewProps {
  coordinates: Coordinate[];
}

function MapUpdater({ coordinates }: { coordinates: Coordinate[] }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates.length > 0) {
      const lastCoord = coordinates[coordinates.length - 1];
      map.setView([lastCoord.lat, lastCoord.lng], 16, { animate: true });
    }
  }, [coordinates, map]);
  return null;
}

export default function MapView({ coordinates }: MapViewProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Usa estilos CartoDB: Positron (claro) y Dark Matter (oscuro) que encajan mejor con la app
  const tileUrl = resolvedTheme === "dark" 
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const defaultCenter: [number, number] = coordinates.length > 0 
    ? [coordinates[0].lat, coordinates[0].lng] 
    : [40.4168, -3.7038]; // Madrid por defecto

  const positions: [number, number][] = coordinates.map((c) => [c.lat, c.lng]);

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
            <Polyline positions={positions} color="#3b82f6" weight={5} opacity={0.8} />
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
