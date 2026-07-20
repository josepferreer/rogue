import type { NextRequest } from "next/server";

// Map matching contra OSRM (servidor demo publico, sin token). Recibe la traza
// GPS cruda y devuelve una geometria util para dibujar:
//   1. Limpia outliers (saltos GPS a velocidad imposible) — esto por si solo
//      elimina las lineas rectas que cruzan edificios.
//   2. Encaja la traza limpia sobre las calles reales (snapped: true).
//   3. Si OSRM no encaja, devuelve al menos la traza limpia (snapped: false).
//
// Se llama desde el servidor (no el navegador) para evitar CORS. OSRM demo solo
// tiene perfil de coche, pero para caminar en ciudad el resultado es valido.

const OSRM_BASE = "https://router.project-osrm.org/match/v1/driving/";

// El servidor demo limita a 100 coordenadas por peticion; ademas OSRM encaja
// mejor con puntos no excesivamente densos. Submuestreamos manteniendo primero
// y ultimo punto.
const MAX_POINTS = 100;

// Velocidad por encima de la cual un tramo se considera un salto GPS imposible
// (28.8 km/h): mas rapido que cualquier carrera a pie, asi no descarta ritmos
// reales, solo los picos erroneos del sensor.
const MAX_SPEED_MPS = 8;

type Point = { lat: number; lng: number; timestamp?: number };

function haversineM(a: Point, b: Point): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Elimina los puntos que implican una velocidad imposible respecto al ultimo
 *  punto valido (picos del GPS). Sin timestamps fiables cae a un umbral de
 *  distancia bruto (>80 m entre muestras consecutivas = salto). */
function cleanTrace(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const dist = haversineM(prev, cur);
    const dt =
      prev.timestamp != null && cur.timestamp != null
        ? (cur.timestamp - prev.timestamp) / 1000
        : null;
    const isOutlier =
      dt != null && dt > 0 ? dist / dt > MAX_SPEED_MPS : dist > 80;
    // No descartar nunca el ultimo punto (marca el final real de la ruta).
    if (!isOutlier || i === points.length - 1) out.push(cur);
  }
  return out;
}

function downsample(coords: Point[], max: number): Point[] {
  if (coords.length <= max) return coords;
  const out: Point[] = [];
  const step = (coords.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]);
  return out;
}

export async function POST(req: NextRequest) {
  let body: { coordinates?: Point[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const coords = Array.isArray(body.coordinates) ? body.coordinates : [];
  const clean = coords.filter(
    (c) =>
      c &&
      Number.isFinite(c.lat) &&
      Number.isFinite(c.lng) &&
      Math.abs(c.lat) <= 90 &&
      Math.abs(c.lng) <= 180,
  );
  if (clean.length < 2) {
    return Response.json({ error: "not_enough_points" }, { status: 400 });
  }

  // 1) Limpieza de outliers: elimina los saltos imposibles del GPS.
  const cleaned = cleanTrace(clean);
  // Geometria de reserva (traza limpia como [lat, lng]) si OSRM no encaja.
  const cleanedGeom: [number, number][] = cleaned.map((c) => [c.lat, c.lng]);

  // 2) Map matching sobre la traza limpia.
  const sampled = downsample(cleaned, MAX_POINTS);
  const path = sampled.map((c) => `${c.lng},${c.lat}`).join(";");
  const url = `${OSRM_BASE}${path}?geometries=geojson&overview=full&tidy=true`;

  let res: Response | null = null;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Rogue/1.0 (workout PWA)" },
    });
  } catch {
    // OSRM inaccesible: al menos devolvemos la traza ya limpia.
    return Response.json({ geometry: cleanedGeom, snapped: false });
  }

  if (!res.ok) {
    return Response.json({ geometry: cleanedGeom, snapped: false });
  }

  const data = (await res.json()) as {
    code?: string;
    matchings?: { geometry?: { coordinates?: [number, number][] } }[];
  };

  if (data.code !== "Ok" || !data.matchings?.length) {
    return Response.json({ geometry: cleanedGeom, snapped: false });
  }

  // Concatena la geometria de todos los tramos encajados, de [lon, lat]
  // (GeoJSON) a [lat, lng] (lo que consume Leaflet).
  const geometry: [number, number][] = [];
  for (const m of data.matchings) {
    for (const [lng, lat] of m.geometry?.coordinates ?? []) {
      geometry.push([lat, lng]);
    }
  }

  if (geometry.length < 2) {
    return Response.json({ geometry: cleanedGeom, snapped: false });
  }

  return Response.json({ geometry, snapped: true });
}
