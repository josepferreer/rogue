/**
 * Limpieza de la traza GPS: elimina los puntos que implican una velocidad
 * imposible respecto al ultimo punto valido (picos del sensor).
 *
 * Esto es lo que de verdad quita las lineas rectas que cruzan manzanas. Antes
 * vivia en `/api/match`, que ademas encajaba la traza sobre las calles reales
 * llamando al servidor de demostracion publico de OSRM. Se elimino: mandaba
 * las rutas del usuario (que empiezan y acaban en su casa) a un tercero sin
 * contrato de encargo de tratamiento, y la propia politica de OSRM excluye a
 * los productos detras de un login. El encaje a calles solo aportaba estetica;
 * la limpieza, que es lo util, no necesita salir del dispositivo.
 */

export type TracePoint = { lat: number; lng: number; timestamp?: number };

/** Metros entre dos puntos (Haversine). */
export function haversineM(a: TracePoint, b: TracePoint): number {
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

/**
 * Velocidad por encima de la cual un tramo se considera un salto GPS imposible
 * (28,8 km/h): mas rapido que cualquier carrera a pie, asi no descarta ritmos
 * reales, solo los picos erroneos del sensor.
 *
 * OJO: con bici esto descarta la ruta entera. Sigue pendiente la decision de
 * producto de guardar el tipo de actividad para ajustar el umbral.
 */
const MAX_SPEED_MPS = 8;

/** Sin timestamps fiables se cae a un umbral de distancia bruto. */
const MAX_JUMP_M = 80;

export function cleanTrace<T extends TracePoint>(points: T[]): T[] {
  if (points.length < 3) return points;
  const out: T[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const dist = haversineM(prev, cur);
    const dt =
      prev.timestamp != null && cur.timestamp != null
        ? (cur.timestamp - prev.timestamp) / 1000
        : null;
    const isOutlier =
      dt != null && dt > 0 ? dist / dt > MAX_SPEED_MPS : dist > MAX_JUMP_M;
    // No descartar nunca el ultimo punto (marca el final real de la ruta).
    if (!isOutlier || i === points.length - 1) out.push(cur);
  }
  return out;
}
