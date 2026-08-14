/**
 * Progreso al SEGUIR una ruta guardada.
 *
 * La pantalla de seguimiento ya no pinta la traza en vivo encima de la ruta:
 * hay una sola linea, la de la ruta, y lo que cambia es su color. El tramo ya
 * recorrido se pinta en verde y el que falta queda tenue. Este modulo es quien
 * decide donde esta ese corte.
 *
 * Reglas:
 * - El progreso NO empieza hasta que el GPS entra en el radio del punto de
 *   inicio de la ruta (START_RADIUS_M). Antes de eso el usuario todavia se esta
 *   acercando y no tendria sentido dar por hecho ningun tramo.
 * - Solo avanza hacia delante (monotono): un punto proyectado por detras del
 *   maximo alcanzado no "descompleta" la ruta.
 * - Solo se busca en una ventana hacia delante (LOOKAHEAD_M). Sin esto, en
 *   rutas de ida y vuelta o circulares un punto se engancharia al tramo
 *   paralelo de vuelta y la ruta se completaria de golpe.
 * - Si el punto cae demasiado lejos de la linea (OFF_ROUTE_M) se considera
 *   fuera de ruta y no avanza nada.
 *
 * Es una funcion pura sobre la traza completa: el resultado no depende del
 * orden en que llegaron los renders, asi que sobrevive a remontajes del mapa.
 */

import { haversineM } from "./clean-trace";

/** Lo unico que necesita este modulo de un punto; `Coordinate` lo cumple. */
export type LatLng = { lat: number; lng: number };

/** Distancia al punto de inicio a la que se considera que arranca la ruta. */
const START_RADIUS_M = 35;
/** Separacion maxima de la linea para seguir contando como "en ruta". */
const OFF_ROUTE_M = 45;
/**
 * Cuanto se mira hacia delante desde el punto ya alcanzado. La ventana se
 * ensancha con el salto respecto al punto anterior (2x), para reengancharse
 * tras un hueco del GPS (tunel, app suspendida) sin abrirla de mas en una
 * traza normal, que es lo que haria saltar al tramo de vuelta en una ruta
 * circular o de ida y vuelta.
 */
const LOOKAHEAD_M = 250;

export interface RouteProgress {
  /** El GPS ya ha pasado por el inicio de la ruta. */
  started: boolean;
  /** El ultimo punto valido cae fuera del corredor de la ruta. */
  offRoute: boolean;
  /** Metros de ruta completados. */
  alongM: number;
  /** Longitud total de la ruta en metros. */
  totalM: number;
  /** 0..1 de ruta completada. */
  ratio: number;
  /** Polilinea del tramo completado (para pintarla en verde). */
  doneCoords: LatLng[];
}

/** Proyeccion de un punto sobre un segmento, en metros planos locales. */
function projectOnSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng
): { t: number; distM: number } {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 110540;
  const bx = (b.lng - a.lng) * kx;
  const by = (b.lat - a.lat) * ky;
  const px = (p.lng - a.lng) * kx;
  const py = (p.lat - a.lat) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  return { t, distM: Math.hypot(px - t * bx, py - t * by) };
}

/** Punto a `t` (0..1) entre dos coordenadas. */
function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Distancias acumuladas en cada vertice de la ruta. */
function cumulative(route: LatLng[]): number[] {
  const cum = new Array<number>(route.length);
  cum[0] = 0;
  for (let i = 1; i < route.length; i++) {
    cum[i] = cum[i - 1] + haversineM(route[i - 1], route[i]);
  }
  return cum;
}

/** Tramo de la ruta desde el inicio hasta `alongM` metros. */
function sliceRoute(route: LatLng[], cum: number[], alongM: number): LatLng[] {
  if (alongM <= 0) return [];
  let i = 0;
  while (i < route.length - 1 && cum[i + 1] <= alongM) i++;
  const done = route.slice(0, i + 1);
  if (i < route.length - 1) {
    const segLen = cum[i + 1] - cum[i];
    const t = segLen > 0 ? (alongM - cum[i]) / segLen : 0;
    if (t > 0) done.push(lerp(route[i], route[i + 1], t));
  }
  return done;
}

export function computeRouteProgress(
  route: LatLng[],
  trace: LatLng[]
): RouteProgress | null {
  if (route.length < 2) return null;

  const cum = cumulative(route);
  const totalM = cum[route.length - 1];

  let started = false;
  let offRoute = false;
  let alongM = 0;
  let segIdx = 0;
  let lastPoint: LatLng | null = null;

  for (const p of trace) {
    if (!started) {
      if (haversineM(p, route[0]) > START_RADIUS_M) continue;
      started = true;
    }

    const gapM = lastPoint ? haversineM(lastPoint, p) : 0;
    lastPoint = p;
    const lookaheadM = LOOKAHEAD_M + 2 * gapM;

    let best: { i: number; t: number; distM: number } | null = null;
    for (let i = segIdx; i < route.length - 1; i++) {
      if (cum[i] > alongM + lookaheadM) break;
      const { t, distM } = projectOnSegment(p, route[i], route[i + 1]);
      if (!best || distM < best.distM) best = { i, t, distM };
    }
    if (!best) continue;

    if (best.distM > OFF_ROUTE_M) {
      offRoute = true;
      continue;
    }
    offRoute = false;

    const candidate = cum[best.i] + (cum[best.i + 1] - cum[best.i]) * best.t;
    if (candidate > alongM) {
      alongM = candidate;
      segIdx = best.i;
    }
  }

  return {
    started,
    offRoute,
    alongM,
    totalM,
    ratio: totalM > 0 ? Math.min(1, alongM / totalM) : 0,
    doneCoords: sliceRoute(route, cum, alongM),
  };
}
