import type { Coordinate } from "@/lib/store/cardio-store";

/**
 * Parser de GPX (importar rutas). GPX es XML: los puntos van en <trkpt> (tracks
 * grabados) o, si no hay, en <rtept> (rutas planificadas). Se parsea en cliente
 * con DOMParser — la importación nace de un archivo que sube el usuario.
 *
 * No dependemos de ninguna librería: GPX es simple y así el bundle no crece.
 */

export interface ParsedGpx {
  name: string;
  coordinates: Coordinate[];
  distanceKm: number;
  /** Desnivel positivo acumulado (m), si el GPX trae elevación. */
  elevationGainM: number | null;
}

const EARTH_R_KM = 6371;

/** Distancia entre dos puntos (km) por la fórmula del haversine. */
export function haversineKm(a: Coordinate, b: Coordinate): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distancia total de una polilínea (km). */
export function totalDistanceKm(coords: Coordinate[]): number {
  let km = 0;
  for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i - 1], coords[i]);
  return km;
}

/** Desnivel positivo acumulado (m); null si ningún punto trae altitud. */
function elevationGain(coords: Coordinate[]): number | null {
  let gain = 0;
  let hasAlt = false;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1].alt;
    const cur = coords[i].alt;
    if (typeof prev === "number" && typeof cur === "number") {
      hasAlt = true;
      if (cur > prev) gain += cur - prev;
    }
  }
  return hasAlt ? Math.round(gain) : null;
}

/** Fecha del punto (o ahora) como epoch ms, para respetar la forma Coordinate. */
function pointTime(pt: Element, fallback: number): number {
  const t = pt.querySelector("time")?.textContent?.trim();
  if (t) {
    const ms = Date.parse(t);
    if (Number.isFinite(ms)) return ms;
  }
  return fallback;
}

/**
 * Parsea un GPX. Lanza si no hay puntos válidos (fichero corrupto o no-GPX).
 */
export function parseGpx(xml: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("El archivo no es un GPX válido.");
  }

  // Preferimos track points; si no hay, route points.
  let pts = Array.from(doc.querySelectorAll("trkpt"));
  if (pts.length === 0) pts = Array.from(doc.querySelectorAll("rtept"));
  if (pts.length === 0) throw new Error("El GPX no contiene puntos de ruta.");

  const base = Date.now();
  const coordinates: Coordinate[] = [];
  for (const pt of pts) {
    const lat = Number(pt.getAttribute("lat"));
    const lng = Number(pt.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const eleText = pt.querySelector("ele")?.textContent?.trim();
    const alt = eleText ? Number(eleText) : undefined;
    coordinates.push({
      lat,
      lng,
      alt: typeof alt === "number" && Number.isFinite(alt) ? alt : undefined,
      timestamp: pointTime(pt, base + coordinates.length),
    });
  }
  if (coordinates.length < 2) throw new Error("El GPX no tiene suficientes puntos.");

  const name =
    doc.querySelector("trk > name")?.textContent?.trim() ||
    doc.querySelector("rte > name")?.textContent?.trim() ||
    doc.querySelector("metadata > name")?.textContent?.trim() ||
    "Ruta importada";

  return {
    name: name.slice(0, 80),
    coordinates,
    distanceKm: Math.round(totalDistanceKm(coordinates) * 100) / 100,
    elevationGainM: elevationGain(coordinates),
  };
}
