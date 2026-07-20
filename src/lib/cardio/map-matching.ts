import type { Coordinate } from "@/lib/store/cardio-store";

/** Pide al servidor la traza GPS "pegada" a las calles reales (map matching via
 *  OSRM). Devuelve la geometria como [lat, lng][] lista para dibujar, o null si
 *  no se pudo encajar (el llamador cae de vuelta a la traza cruda). */
export async function matchToRoads(
  coordinates: Coordinate[],
): Promise<[number, number][] | null> {
  if (coordinates.length < 2) return null;
  try {
    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: coordinates.map((c) => ({
          lat: c.lat,
          lng: c.lng,
          timestamp: c.timestamp,
        })),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { geometry?: [number, number][] };
    return data.geometry && data.geometry.length >= 2 ? data.geometry : null;
  } catch {
    return null;
  }
}
