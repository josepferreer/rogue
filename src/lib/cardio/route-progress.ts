/**
 * Progreso al SEGUIR una ruta guardada.
 *
 * La pantalla de seguimiento no pinta la traza en vivo encima de la ruta: hay
 * una sola linea, la de la ruta, y lo que cambia es su color. Este modulo
 * decide que trozos van en verde, cuales siguen tenues y por donde te saliste.
 *
 * La idea central: NO basta con un "he llegado hasta el metro X". Si te desvias
 * por una obra y vuelves 200 m mas alla, ese numero salta y el tramo que te
 * saltaste se pintaria de verde sin haberlo pisado. Por eso aqui se guardan los
 * INTERVALOS realmente recorridos, que pueden tener huecos.
 *
 * Reglas:
 * - El progreso NO empieza hasta que el GPS entra en el radio del punto de
 *   inicio (START_RADIUS_M). Antes te estas acercando, no recorriendo.
 * - Solo se busca en una ventana hacia delante (LOOKAHEAD_M). Sin esto, en
 *   rutas de ida y vuelta o circulares un punto se engancharia al tramo
 *   paralelo de vuelta y la ruta se completaria de golpe.
 * - La ventana se ensancha con lo andado fuera de ruta: si te has ido 600 m por
 *   otra calle, puedes reaparecer 600 m mas adelante. Sin esto el seguimiento
 *   se quedaba COLGADO para el resto de la salida en cuanto el desvio pasaba de
 *   unos 400 m, porque la ventana no avanzaba si el progreso no avanzaba.
 * - Fuera del corredor (OFF_ROUTE_M) no se cubre ruta: esos puntos se guardan
 *   aparte como desvio, para pintarlos en otro color.
 *
 * Es una funcion pura sobre la traza completa: el resultado no depende del
 * orden en que llegaron los renders, asi que sobrevive a remontajes del mapa.
 */

import { haversineM } from "./clean-trace";

/** Lo unico que necesita este modulo de un punto; `Coordinate` lo cumple. */
export type LatLng = { lat: number; lng: number };

/** Distancia al punto de inicio a la que se considera que arranca la ruta. */
const START_RADIUS_M = 35;
/**
 * Separacion maxima de la linea para seguir contando como "en ruta". Da de
 * sobra para la acera de enfrente o el carril bici de al lado (el error tipico
 * del GPS en ciudad ya son 5-15 m), y no tanto como para enganchar una calle
 * paralela.
 */
const OFF_ROUTE_M = 45;
/** Cuanto se mira hacia delante desde el punto ya alcanzado. */
const LOOKAHEAD_M = 250;
/**
 * Hueco por debajo del cual dos tramos pisados se funden en uno. Evita que el
 * temblor del GPS pique la linea verde a puntitos: un agujero de 5 m no es un
 * desvio, es ruido.
 */
const MIN_GAP_M = 15;
/** Un desvio mas corto que esto no se pinta: es ruido, no una calle distinta. */
const MIN_DETOUR_M = 20;
/**
 * Fijaciones consecutivas fuera del corredor para creerse un desvio. Una sola
 * es el salto tipico del GPS entre edificios: pintaba un muñon azul saliendo y
 * volviendo por el mismo sitio, ademas sin hueco en el verde (lo tapaba
 * MIN_GAP_M), o sea un desvio a ninguna parte. Dos seguidas hacia el mismo lado
 * ya son otra calle.
 */
const MIN_DETOUR_FIXES = 2;

export interface RouteProgress {
  /** El GPS ya ha pasado por el inicio de la ruta. */
  started: boolean;
  /** El ultimo punto valido cae fuera del corredor de la ruta. */
  offRoute: boolean;
  /** Punto mas avanzado alcanzado sobre la ruta, en metros. */
  alongM: number;
  /** Metros de ruta REALMENTE pisados. No cuenta lo saltado en un desvio. */
  coveredM: number;
  /** Longitud total de la ruta en metros. */
  totalM: number;
  /** 0..1 de ruta pisada (coveredM / totalM). */
  ratio: number;
  /** Tramos pisados, para pintarlos en verde. Varios: un desvio deja huecos. */
  doneSegments: LatLng[][];
  /** Excursiones fuera del corredor, para pintarlas en azul. */
  detours: LatLng[][];
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

/** Coordenada que cae a `m` metros del inicio de la ruta. */
function pointAt(route: LatLng[], cum: number[], m: number): LatLng {
  const total = cum[cum.length - 1];
  if (m <= 0) return route[0];
  if (m >= total) return route[route.length - 1];
  let i = 0;
  while (i < route.length - 1 && cum[i + 1] <= m) i++;
  const segLen = cum[i + 1] - cum[i];
  return lerp(route[i], route[i + 1], segLen > 0 ? (m - cum[i]) / segLen : 0);
}

/** Trozo de ruta entre dos marcas kilometricas, con sus vertices intermedios. */
function sliceBetween(
  route: LatLng[],
  cum: number[],
  fromM: number,
  toM: number
): LatLng[] {
  const out: LatLng[] = [pointAt(route, cum, fromM)];
  for (let i = 0; i < route.length; i++) {
    if (cum[i] > fromM && cum[i] < toM) out.push(route[i]);
  }
  out.push(pointAt(route, cum, toM));
  return out;
}

/** Une los intervalos que se tocan (o casi: ver MIN_GAP_M). */
function mergeIntervals(list: [number, number][]): [number, number][] {
  if (list.length === 0) return [];
  const orden = [...list].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [[orden[0][0], orden[0][1]]];
  for (let i = 1; i < orden.length; i++) {
    const ultimo = out[out.length - 1];
    if (orden[i][0] <= ultimo[1] + MIN_GAP_M) {
      ultimo[1] = Math.max(ultimo[1], orden[i][1]);
    } else {
      out.push([orden[i][0], orden[i][1]]);
    }
  }
  return out;
}

/** Largo de una polilinea en metros. */
function largoM(pts: LatLng[]): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += haversineM(pts[i - 1], pts[i]);
  return m;
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
  /** Proyeccion del punto anterior, o null si aquel estaba fuera de ruta. */
  let prevAlong: number | null = null;
  /** Andado fuera del corredor desde que se salio; ensancha la ventana. */
  let offRouteDistM = 0;
  /** Ultimo punto que si estaba en ruta, para que el desvio salga pegado a ella. */
  let ultimoEnRuta: LatLng | null = null;

  const cubiertos: [number, number][] = [];
  const detours: LatLng[][] = [];
  let desvioActual: LatLng[] | null = null;
  /** Puntos realmente fuera del corredor en el desvio en curso (sin anclajes). */
  let fijacionesFuera = 0;

  /** Guarda el desvio en curso si es de verdad, y lo cierra. */
  const cerrarDesvio = () => {
    if (
      desvioActual &&
      fijacionesFuera >= MIN_DETOUR_FIXES &&
      largoM(desvioActual) >= MIN_DETOUR_M
    ) {
      detours.push(desvioActual);
    }
    desvioActual = null;
    fijacionesFuera = 0;
  };

  for (const p of trace) {
    if (!started) {
      if (haversineM(p, route[0]) > START_RADIUS_M) continue;
      started = true;
    }

    const gapM = lastPoint ? haversineM(lastPoint, p) : 0;
    lastPoint = p;
    const lookaheadM = LOOKAHEAD_M + 2 * gapM + offRouteDistM;

    let best: { i: number; t: number; distM: number } | null = null;
    for (let i = segIdx; i < route.length - 1; i++) {
      if (cum[i] > alongM + lookaheadM) break;
      const { t, distM } = projectOnSegment(p, route[i], route[i + 1]);
      if (!best || distM < best.distM) best = { i, t, distM };
    }

    if (!best || best.distM > OFF_ROUTE_M) {
      offRoute = true;
      offRouteDistM += gapM;
      prevAlong = null;
      fijacionesFuera++;
      if (!desvioActual) {
        // Arranca en el ultimo punto bueno para que la linea del desvio salga
        // de la ruta en vez de aparecer flotando.
        desvioActual = ultimoEnRuta ? [ultimoEnRuta, p] : [p];
      } else {
        desvioActual.push(p);
      }
      continue;
    }

    offRoute = false;
    offRouteDistM = 0;
    ultimoEnRuta = p;
    if (desvioActual) {
      desvioActual.push(p); // cierra el desvio de vuelta sobre la ruta
      cerrarDesvio();
    }

    const candidate = cum[best.i] + (cum[best.i + 1] - cum[best.i]) * best.t;
    // Solo se cubre el tramo entre dos puntos CONSECUTIVOS que esten los dos en
    // ruta. Si el anterior estaba fuera, el hueco se queda sin pisar.
    if (prevAlong !== null && candidate > prevAlong) {
      cubiertos.push([prevAlong, candidate]);
    }
    prevAlong = candidate;
    if (candidate > alongM) {
      alongM = candidate;
      segIdx = best.i;
    }
  }

  cerrarDesvio(); // por si la salida acabo fuera de ruta

  const tramos = mergeIntervals(cubiertos);
  const coveredM = tramos.reduce((sum, [a, b]) => sum + (b - a), 0);

  return {
    started,
    offRoute,
    alongM,
    coveredM,
    totalM,
    ratio: totalM > 0 ? Math.min(1, coveredM / totalM) : 0,
    doneSegments: tramos.map(([a, b]) => sliceBetween(route, cum, a, b)),
    detours,
  };
}
