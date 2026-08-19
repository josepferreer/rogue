"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { Layers, Box } from "lucide-react";
import type { Coordinate } from "@/lib/store/cardio-store";
import { cleanTrace } from "@/lib/cardio/clean-trace";
import type { RouteProgress } from "@/lib/cardio/route-progress";
import { useHydrated } from "@/lib/use-hydrated";

interface MapViewProps {
  coordinates: Coordinate[];
  /** Posición actual para el marcador. Puede no estar en `coordinates`: la
   *  traza solo recoge movimiento real, el marcador toda fijación válida. */
  currentPosition?: Coordinate | null;
  /** Descarta los saltos imposibles del GPS antes de dibujar. Para rutas ya
   *  terminadas; en el seguimiento en vivo se pinta la traza tal cual llega. */
  cleanOutliers?: boolean;
  /** Ruta a seguir (modo repetir): es la ÚNICA línea que se pinta. Empieza
   *  tenue y se va coloreando de verde según el progreso; la traza en vivo NO
   *  se dibuja encima para no superponer dos rutas. */
  ghostRoute?: Coordinate[];
  /** Progreso sobre `ghostRoute` (de `computeRouteProgress`). */
  progress?: RouteProgress | null;
  /** Si es true, no renderiza los controles flotantes (útil si hay otro mapa encima o modal activo). */
  hideControls?: boolean;
  topBar?: {
    title: string;
    onAction: () => void;
    actionIcon: React.ReactNode;
    actionAriaLabel?: string;
  };
}

type MapMode = "2d" | "2.5d";

export default function MapView({
  coordinates,
  currentPosition,
  cleanOutliers = true,
  ghostRoute,
  progress,
  hideControls = false,
  topBar,
}: MapViewProps) {
  const { resolvedTheme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  // MapLibre necesita un contenedor real del DOM: nada de esto existe en SSR.
  const mounted = useHydrated();

  // Modo de mapa guardado en localStorage (por defecto 2.5D)
  const [mapMode, setMapMode] = useState<MapMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rogue.mapMode");
      if (saved === "2d" || saved === "2.5d") return saved;
    }
    return "2.5d";
  });

  const drawn = useMemo(
    () => (cleanOutliers && coordinates.length >= 2 ? cleanTrace(coordinates) : coordinates),
    [cleanOutliers, coordinates]
  );

  /** Se está siguiendo una ruta guardada (hay línea de referencia que pintar). */
  const followMode = !!ghostRoute && ghostRoute.length >= 2;

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

    // Centro inicial: primer punto de la traza en vivo; si no hay, el inicio de
    // la ruta fantasma; y solo si tampoco, Madrid. Se calcula con lo que haya en
    // el momento de crear el mapa (una sola vez).
    const centerSource =
      drawn.length > 0 ? drawn[0] : ghostRoute && ghostRoute.length > 0 ? ghostRoute[0] : null;
    const initialCenter: [number, number] = centerSource
      ? [centerSource.lng, centerSource.lat]
      : [-3.7038, 40.4168];

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
      // Reajuste diferido: en montajes TARDÍOS (p.ej. al abrir una ruta guardada,
      // cuyo MapView aparece tras cargar los datos) el contenedor puede no tener
      // aún su tamaño final al crear el mapa, y sin esto el mapa queda en blanco.
      setTimeout(() => mapRef.current?.resize(), 200);
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
    const buildingColor = isDark ? "#334155" : "#c8cdd6";
    const buildingOpacity = 1.0;

    // 1. Capa de Edificios 3D (Completamente opacos, sin transparencia)
    if (!map.getLayer("3d-buildings")) {
      // Insertar la capa 3D justo encima de "building-top" (que existe en ambos
      // estilos). En MapLibre el 2º arg de addLayer es "beforeId" = se inserta
      // visualmente DEBAJO de esa capa, así que buscamos la capa que sigue a
      // building-top para quedar por encima de los edificios planos.
      const allLayers = map.getStyle()?.layers || [];
      const buildingTopIdx = allLayers.findIndex((l: { id: string }) => l.id === "building-top");
      const insertBefore: string | undefined =
        buildingTopIdx >= 0 && buildingTopIdx + 1 < allLayers.length
          ? allLayers[buildingTopIdx + 1].id
          : undefined;

      const styleSources = map.getStyle()?.sources ?? {};
      const sourceName =
        "openmaptiles" in styleSources ? "openmaptiles" :
        "carto" in styleSources ? "carto" :
        Object.entries(styleSources).find(([, s]) => (s as { type?: string }).type === "vector")?.[0];

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
            insertBefore
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

    // 2. Zonas verdes (parques, reservas naturales, cementerios, estadios)
    // Sobrescribimos el color pálido por defecto con un verde más vivo.
    const greenColor = isDark ? "rgba(52, 78, 65, 0.85)" : "rgba(180, 213, 170, 0.85)";
    const greenLayers = ["park_national_park", "park_nature_reserve", "landuse"];
    for (const layerId of greenLayers) {
      if (map.getLayer(layerId)) {
        try {
          map.setPaintProperty(layerId, "fill-color", greenColor);
        } catch {
          // Ignorar si la capa no soporta fill-color en este estilo
        }
      }
    }


    // Ruta a seguir. Se pinta en DOS capas sobre la MISMA polilínea: el tramo
    // pendiente tenue y, encima, el tramo ya completado en verde. Así la ruta
    // "se rellena" al avanzar en vez de quedar una segunda línea superpuesta.
    if (followMode && ghostRoute) {
      const ghostGeo: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: ghostRoute.map((c) => [c.lng, c.lat]),
        },
      };
      // MultiLineString, no LineString: si te desvias por una obra y vuelves
      // mas adelante, lo pisado son VARIOS tramos con huecos en medio. Con una
      // sola linea el hueco se rellenaria solo y saldria verde sin pisarlo.
      const doneGeo: GeoJSON.Feature<GeoJSON.MultiLineString> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "MultiLineString",
          coordinates: (progress?.doneSegments ?? []).map((seg) =>
            seg.map((c) => [c.lng, c.lat])
          ),
        },
      };
      // Los desvios: por donde fuiste cuando no estabas sobre la ruta.
      const detourGeo: GeoJSON.Feature<GeoJSON.MultiLineString> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "MultiLineString",
          coordinates: (progress?.detours ?? []).map((seg) =>
            seg.map((c) => [c.lng, c.lat])
          ),
        },
      };
      const first = ghostRoute[0];
      const last = ghostRoute[ghostRoute.length - 1];
      const endsGeo: GeoJSON.FeatureCollection<GeoJSON.Point> = {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { role: "start" }, geometry: { type: "Point", coordinates: [first.lng, first.lat] } },
          { type: "Feature", properties: { role: "end" }, geometry: { type: "Point", coordinates: [last.lng, last.lat] } },
        ],
      };

      if (map.getSource("ghost-source")) {
        (map.getSource("ghost-source") as maplibregl.GeoJSONSource).setData(ghostGeo);
        (map.getSource("ghost-done-source") as maplibregl.GeoJSONSource)?.setData(doneGeo);
        (map.getSource("detour-source") as maplibregl.GeoJSONSource)?.setData(detourGeo);
        (map.getSource("ghost-ends-source") as maplibregl.GeoJSONSource)?.setData(endsGeo);
      } else {
        map.addSource("ghost-source", { type: "geojson", data: ghostGeo });
        map.addLayer({
          id: "ghost-line",
          type: "line",
          source: "ghost-source",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": isDark ? "#64748b" : "#94a3b8",
            "line-width": 6,
            "line-opacity": 0.55,
            "line-dasharray": [1, 1.6],
          },
        });

        // Tramo completado: mismo trazado, sólido y en verde, justo encima.
        map.addSource("ghost-done-source", { type: "geojson", data: doneGeo });
        map.addLayer({
          id: "ghost-done-casing",
          type: "line",
          source: "ghost-done-source",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": isDark ? "#166534" : "#86efac",
            "line-width": 10,
            "line-opacity": 0.5,
          },
        });
        map.addLayer({
          id: "ghost-done-line",
          type: "line",
          source: "ghost-done-source",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#22c55e",
            "line-width": 6,
          },
        });

        // Desvios en azul, encima del verde: por donde fuiste cuando te saliste
        // de la ruta. El tramo de ruta que te saltaste NO se pinta de verde,
        // asi que se ve el hueco tenue al lado de tu desvio azul.
        map.addSource("detour-source", { type: "geojson", data: detourGeo });
        map.addLayer({
          id: "detour-line",
          type: "line",
          source: "detour-source",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#2563eb",
            "line-width": 5,
          },
        });

        map.addSource("ghost-ends-source", { type: "geojson", data: endsGeo });
        map.addLayer({
          id: "ghost-ends",
          type: "circle",
          source: "ghost-ends-source",
          paint: {
            "circle-radius": 8,
            // Cada color significa UNA cosa: verde = tramo pisado, azul = tu
            // posicion y tus desvios, rojo = final. Al inicio le toca ambar:
            // antes era el mismo azul (#3b82f6) que el punto de posicion, o sea
            // dos cosas distintas pintadas igual en el mismo mapa.
            "circle-color": ["match", ["get", "role"], "start", "#f59e0b", "end", "#ef4444", "#888888"],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Encuadre inmediato al dibujar la ruta por primera vez cuando no hay
        // traza en vivo (inspección de una ruta guardada): así se ve entera y
        // no se queda en el centro por defecto.
        if (coordinates.length === 0) {
          const b = ghostRoute.reduce(
            (acc, c) => acc.extend([c.lng, c.lat]),
            new maplibregl.LngLatBounds(
              [ghostRoute[0].lng, ghostRoute[0].lat],
              [ghostRoute[0].lng, ghostRoute[0].lat],
            ),
          );
          map.fitBounds(b, { padding: 50, duration: 0 });
        }
      }
    }

    // Traza en vivo (azul). SOLO en ruta libre: siguiendo una ruta guardada
    // sería una segunda línea calcada sobre la primera, que es justo lo que se
    // quiere evitar; ahí el avance se ve por el verde de la propia ruta.
    const lineCoords = followMode ? [] : drawn.map((c) => [c.lng, c.lat]);
    const routeGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: lineCoords,
      },
    };

    if (followMode) {
      // Nada que pintar; si el modo cambió en caliente, vaciar la traza previa.
      (map.getSource("route-source") as maplibregl.GeoJSONSource | undefined)?.setData(routeGeoJSON);
    } else if (map.getSource("route-source")) {
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
    // La posición actual va APARTE de la traza: incluye las fijaciones que no
    // llegan a contar como movimiento (deriva del sensor estando parado). Así
    // el punto azul se ve vivo sin que esos puntos ensucien la línea guardada.
    const lastCoord =
      currentPosition ?? (coordinates.length > 0 ? coordinates[coordinates.length - 1] : null);
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
    // `currentPosition` va en las dependencias porque mueve el marcador: sin
    // ella el punto azul solo se repintaría cuando crece la traza, o sea nunca
    // mientras estás parado.
  }, [coordinates, currentPosition, drawn, followMode, ghostRoute, mapLoaded, mapMode, progress, resolvedTheme]);

  // Modo seguimiento: al cargar (aún sin puntos en vivo), encuadra la ruta
  // fantasma entera para que el usuario vea lo que va a recorrer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !ghostRoute || ghostRoute.length < 2) return;
    if (coordinates.length > 0) return; // ya está corriendo: manda la cámara en vivo
    const bounds = ghostRoute.reduce(
      (b, c) => b.extend([c.lng, c.lat]),
      new maplibregl.LngLatBounds(
        [ghostRoute[0].lng, ghostRoute[0].lat],
        [ghostRoute[0].lng, ghostRoute[0].lat],
      ),
    );
    map.fitBounds(bounds, { padding: 50, duration: 800 });
  }, [ghostRoute, coordinates.length, mapLoaded]);

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

      {/* Botón flotante selector 2D / 2.5D o barra superior completa */}
      {!hideControls && (
        topBar ? (
          <div className="absolute inset-x-0 top-0 z-[400] flex items-start justify-between p-5 pt-[calc(env(safe-area-inset-top)+1rem)] bg-gradient-to-b from-background/80 via-background/40 to-transparent pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <span className="rounded-full bg-surface/80 px-4 py-1.5 font-mono text-xs font-semibold tracking-widest backdrop-blur-md shadow-sm border border-border/40">
                {topBar.title}
              </span>
              <button
                onClick={toggleMapMode}
                type="button"
                aria-label={`Cambiar a modo ${mapMode === "2d" ? "2.5D" : "2D"}`}
                className="flex items-center gap-1.5 rounded-full bg-surface/80 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-md transition-all active:scale-95 border border-border/40 hover:bg-surface"
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
            <button
              onClick={topBar.onAction}
              aria-label={topBar.actionAriaLabel || "Acción"}
              className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-surface/80 hover:bg-surface shadow-sm backdrop-blur-md border border-border/40 transition-transform active:scale-95"
            >
              {topBar.actionIcon}
            </button>
          </div>
        ) : (
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
        )
      )}
    </div>
  );
}
