"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { Layers, Box } from "lucide-react";
import type { Coordinate } from "@/lib/store/cardio-store";
import { cleanTrace } from "@/lib/cardio/clean-trace";

interface MapViewProps {
  coordinates: Coordinate[];
  /** Descarta los saltos imposibles del GPS antes de dibujar. Para rutas ya
   *  terminadas; en el seguimiento en vivo se pinta la traza tal cual llega. */
  cleanOutliers?: boolean;
}

type MapMode = "2d" | "2.5d";

export default function MapView({ coordinates, cleanOutliers = false }: MapViewProps) {
  const { resolvedTheme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Modo de mapa guardado en localStorage (por defecto 2.5D)
  const [mapMode, setMapMode] = useState<MapMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rogue.mapMode");
      if (saved === "2d" || saved === "2.5d") return saved;
    }
    return "2.5d";
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const drawn = useMemo(
    () => (cleanOutliers && coordinates.length >= 2 ? cleanTrace(coordinates) : coordinates),
    [cleanOutliers, coordinates]
  );

  const toggleMapMode = () => {
    const nextMode = mapMode === "2d" ? "2.5d" : "2d";
    setMapMode(nextMode);
    if (typeof window !== "undefined") {
      localStorage.setItem("rogue.mapMode", nextMode);
    }
  };

  // URL del estilo vectorial de CartoDB (Dark Matter o Positron)
  const styleUrl = useMemo(() => {
    return resolvedTheme === "dark"
      ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
  }, [resolvedTheme]);

  // Inicialización del mapa MapLibre (solo una vez cuando esté montado)
  useEffect(() => {
    if (!mounted || !mapContainerRef.current) return;

    // Configurar la URL absoluta del worker estático para que MapLibre no la resuelva
    // de forma relativa a la ruta del App Router (/app/cardio/actividad/...).
    maplibregl.config.WORKER_URL = "/maplibre-gl-worker.mjs";

    const initialCenter: [number, number] =
      drawn.length > 0 ? [drawn[0].lng, drawn[0].lat] : [-3.7038, 40.4168];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: initialCenter,
      zoom: 16,
      pitch: mapMode === "2.5d" ? 55 : 0,
      bearing: 0,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on("load", () => {
      setMapLoaded(true);
      requestAnimationFrame(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      });
    });

    // Redimensionar automáticamente si cambia el tamaño del contenedor (SPA, modales, etc.)
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      setMapLoaded(false);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Guard para rastrear el estilo activo e impedir llamadas prematuras a setStyle
  const activeStyleRef = useRef(styleUrl);

  // Cambiar estilo de forma fluida solo cuando cambie el tema posteriormente
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (activeStyleRef.current === styleUrl) return;

    activeStyleRef.current = styleUrl;
    setMapLoaded(false);

    map.once("styledata", () => {
      setMapLoaded(true);
    });

    map.setStyle(styleUrl);
  }, [styleUrl, mapLoaded]);

  // Aplicar capas 3D y ruta cuando el mapa esté listo o cambie la traza
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const isDark = resolvedTheme === "dark";
    const buildingColor = isDark ? "#334155" : "#cbd5e1";
    const buildingOpacity = 1.0;

    // 1. Capa de Edificios 3D (Completamente opacos, sin transparencia)
    if (!map.getLayer("3d-buildings")) {
      const layers = map.getStyle()?.layers || [];
      let labelLayerId: string | undefined;
      for (const layer of layers) {
        if (layer.type === "symbol" && layer.layout && (layer.layout as Record<string, unknown>)["text-field"]) {
          labelLayerId = layer.id;
          break;
        }
      }

      const styleSources = map.getStyle()?.sources;
      const sourceName = styleSources?.openmaptiles
        ? "openmaptiles"
        : styleSources?.carto
        ? "carto"
        : undefined;

      if (sourceName) {
        try {
          map.addLayer(
            {
              id: "3d-buildings",
              source: sourceName,
              "source-layer": "building",
              type: "fill-extrusion",
              minzoom: 13,
              paint: {
                "fill-extrusion-color": buildingColor,
                "fill-extrusion-height": [
                  "coalesce",
                  ["get", "render_height"],
                  ["get", "height"],
                  12,
                ],
                "fill-extrusion-base": [
                  "coalesce",
                  ["get", "render_min_height"],
                  ["get", "min_height"],
                  0,
                ],
                "fill-extrusion-opacity": mapMode === "2.5d" ? 1.0 : 0,
                "fill-extrusion-vertical-gradient": true,
              },
            },
            labelLayerId
          );
        } catch {
          // Ignorar si la capa ya existe o el origen no la soporta
        }
      }
    } else {
      map.setPaintProperty("3d-buildings", "fill-extrusion-color", buildingColor);
      map.setPaintProperty(
        "3d-buildings",
        "fill-extrusion-opacity",
        mapMode === "2.5d" ? buildingOpacity : 0
      );
    }

    // 2. Capa de Ruta GPS (Polyline GeoJSON)
    const lineCoords = drawn.map((c) => [c.lng, c.lat]);
    const routeGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: lineCoords,
      },
    };

    if (map.getSource("route-source")) {
      (map.getSource("route-source") as maplibregl.GeoJSONSource).setData(routeGeoJSON);
    } else {
      map.addSource("route-source", {
        type: "geojson",
        data: routeGeoJSON,
      });

      // Sombra exterior para hacer brillar la ruta
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": isDark ? "#1e40af" : "#93c5fd",
          "line-width": 8,
          "line-opacity": 0.5,
        },
      });

      // Traza principal azul neón
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3b82f6",
          "line-width": 5,
        },
      });
    }

    // 3. Marcador de Posición Actual (Punto final)
    const lastCoord = coordinates.length > 0 ? coordinates[coordinates.length - 1] : null;
    const pointGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: lastCoord
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Point",
                coordinates: [lastCoord.lng, lastCoord.lat],
              },
            },
          ]
        : [],
    };

    if (map.getSource("marker-source")) {
      (map.getSource("marker-source") as maplibregl.GeoJSONSource).setData(pointGeoJSON);
    } else {
      map.addSource("marker-source", {
        type: "geojson",
        data: pointGeoJSON,
      });

      // Halo azul resplandeciente
      map.addLayer({
        id: "marker-halo",
        type: "circle",
        source: "marker-source",
        paint: {
          "circle-radius": 14,
          "circle-color": "#3b82f6",
          "circle-opacity": 0.35,
        },
      });

      // Punto central
      map.addLayer({
        id: "marker-dot",
        type: "circle",
        source: "marker-source",
        paint: {
          "circle-radius": 7,
          "circle-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#3b82f6",
        },
      });
    }
  }, [coordinates, drawn, mapLoaded, mapMode, resolvedTheme]);

  // Actualización de inclinación y vista al cambiar mapMode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (mapMode === "2.5d") {
      map.easeTo({ pitch: 55, duration: 600 });
      if (map.getLayer("3d-buildings")) {
        map.setPaintProperty("3d-buildings", "fill-extrusion-opacity", 1.0);
      }
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      if (map.getLayer("3d-buildings")) {
        map.setPaintProperty("3d-buildings", "fill-extrusion-opacity", 0);
      }
    }
  }, [mapLoaded, mapMode, resolvedTheme]);

  // Movimiento de la cámara al recibir nuevas coordenadas
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || coordinates.length === 0) return;

    if (cleanOutliers && drawn.length >= 2) {
      // Ajustar límites para encuadrar toda la ruta terminada
      const bounds = drawn.reduce(
        (b, c) => b.extend([c.lng, c.lat]),
        new maplibregl.LngLatBounds([drawn[0].lng, drawn[0].lat], [drawn[0].lng, drawn[0].lat])
      );
      map.fitBounds(bounds, { padding: 45, duration: 800 });
    } else {
      // Seguimiento en tiempo real: centrar en el último punto registrado
      const last = coordinates[coordinates.length - 1];
      map.easeTo({
        center: [last.lng, last.lat],
        duration: 500,
      });
    }
  }, [cleanOutliers, coordinates, drawn, mapLoaded]);

  if (!mounted) return null;

  return (
    <div className="relative h-full w-full bg-muted">
      {/* Contenedor del Mapa WebGL MapLibre */}
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Botón flotante selector 2D / 2.5D (Integrado en el mapa) */}
      <div className="absolute right-4 top-4 z-[300]">
        <button
          onClick={toggleMapMode}
          type="button"
          aria-label={`Cambiar a modo ${mapMode === "2d" ? "2.5D" : "2D"}`}
          className="flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md transition-all active:scale-95 border border-border hover:bg-surface"
        >
          {mapMode === "2.5d" ? (
            <>
              <Box className="size-3.5 text-blue-500" />
              <span>2.5D</span>
            </>
          ) : (
            <>
              <Layers className="size-3.5 text-muted-foreground" />
              <span>2D</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
