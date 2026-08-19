/**
 * Limpieza y suavizado de la traza GPS:
 * 1. Elimina saltos imposibles por velocidad (teletransporte / túneles).
 * 2. Elimina rebotes laterales agudos (efecto cañón urbano / reflejo en fachadas).
 * 3. Simplifica el zigzag de acera mediante Ramer-Douglas-Peucker (RDP).
 * 4. Aplica suavizado ponderado para generar una línea limpia, continua y fluida.
 */

export type TracePoint = { lat: number; lng: number; timestamp?: number; [key: string]: unknown };

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

/** Velocidad máxima en carrera a pie (28,8 km/h). */
const MAX_SPEED_MPS = 8;
/** Salto máximo en metros sin timestamp fiable. */
const MAX_JUMP_M = 80;

/**
 * Distancia perpendicular en metros desde un punto P hasta el segmento A -> B.
 */
function perpendicularDistanceM(p: TracePoint, a: TracePoint, b: TracePoint): number {
  const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const cosLat = Math.cos(midLat);
  const kx = 111320 * cosLat;
  const ky = 110540;

  const bx = (b.lng - a.lng) * kx;
  const by = (b.lat - a.lat) * ky;
  const px = (p.lng - a.lng) * kx;
  const py = (p.lat - a.lat) * ky;

  const segLenSq = bx * bx + by * by;
  if (segLenSq < 1e-6) {
    return Math.hypot(px, py);
  }

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
  const projX = t * bx;
  const projY = t * by;

  return Math.hypot(px - projX, py - projY);
}

/**
 * Filtra saltos laterales agudos causados por rebotes de GPS en fachadas de edificios.
 */
function removeSpikes<T extends TracePoint>(points: T[]): T[] {
  if (points.length < 3) return points;
  const out: T[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const next = points[i + 1];

    const dAC = haversineM(prev, next);
    const dAB = haversineM(prev, cur);
    const dBC = haversineM(cur, next);
    const perp = perpendicularDistanceM(cur, prev, next);

    // Si el punto salta lateralmente > 4.5 m y el desvío es mucho más largo que el camino directo
    const isLateralBounce = dAC < 60 && perp > 4.5 && dAB + dBC > 1.35 * dAC;

    if (!isLateralBounce) {
      out.push(cur);
    }
  }

  out.push(points[points.length - 1]);
  return out;
}

/**
 * Simplificación Ramer-Douglas-Peucker (RDP) para colapsar micro-oscilaciones de acera.
 */
function rdpSimplify<T extends TracePoint>(points: T[], epsilonM: number): T[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistanceM(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilonM) {
    const left = rdpSimplify(points.slice(0, index + 1), epsilonM);
    const right = rdpSimplify(points.slice(index), epsilonM);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [first, last];
  }
}

/**
 * Suavizado ponderado para redondear aristas y dejar una línea fluida.
 */
function smoothTrace<T extends TracePoint>(points: T[]): T[] {
  if (points.length < 4) return points;
  const out: T[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];

    out.push({
      ...cur,
      lat: prev.lat * 0.15 + cur.lat * 0.7 + next.lat * 0.15,
      lng: prev.lng * 0.15 + cur.lng * 0.7 + next.lng * 0.15,
    });
  }

  out.push(points[points.length - 1]);
  return out;
}

export function cleanTrace<T extends TracePoint>(points: T[]): T[] {
  if (points.length < 3) return points;

  // Paso 1: Filtro de velocidad imposible / salto de teletransporte
  const pass1: T[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = pass1[pass1.length - 1];
    const cur = points[i];
    const dist = haversineM(prev, cur);
    const dt =
      prev.timestamp != null && cur.timestamp != null
        ? (cur.timestamp - prev.timestamp) / 1000
        : null;
    const isOutlier =
      dt != null && dt > 0 ? dist / dt > MAX_SPEED_MPS : dist > MAX_JUMP_M;
    if (!isOutlier || i === points.length - 1) pass1.push(cur);
  }

  // Si hay pocos puntos (p. ej. 3 puntos iniciales), conservar intactos
  if (pass1.length <= 3) return pass1;

  // Paso 2: Eliminación de picos laterales y rebotes urbanos
  const pass2 = removeSpikes(pass1);

  // Paso 3: Simplificación Douglas-Peucker (tolerancia 3.5 m)
  const pass3 = rdpSimplify(pass2, 3.5);

  // Paso 4: Suavizado ponderado de línea
  const pass4 = smoothTrace(pass3);

  return pass4;
}
