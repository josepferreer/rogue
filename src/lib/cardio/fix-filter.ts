/**
 * Filtro de fijaciones GPS en vivo.
 *
 * POR QUÉ existe: el parche nativo pide ubicación a DOS proveedores a la vez
 * (GPS + NETWORK) para que nunca falte señal. Funciona para la continuidad,
 * pero el proveedor de red da posiciones burdas (±20-50 m) que se intercalan
 * con las del GPS (±5-15 m). El resultado, medido en una ruta real: el punto
 * salta ~25 m a un lado y vuelve, una y otra vez, y encima los timestamps
 * llegan desordenados (dt negativo) porque cada proveedor tiene su reloj.
 *
 * Este filtro decide, para cada fijación entrante, si se pinta (y cuánta
 * distancia suma). Es una función PURA para poder probarla con el patrón real
 * de saltos sin depender del dispositivo.
 *
 * Idea: fiarse del GPS y tirar los fixes de red MIENTRAS llegue algo bueno;
 * solo aceptar uno burdo si hace rato que no entra nada (hueco real, p.ej.
 * dentro de un edificio), para no perder la continuidad que se buscaba.
 */

import { haversineM } from "./clean-trace";

/** Un fix así de preciso (o mejor) es de fiar: se acepta siempre. El GPS al
 *  aire libre ronda 5-15 m; hasta en calle urbana rara vez pasa de 25. */
const ACC_GOOD_M = 25;
/** Peor que esto solo entra para tapar un hueco real (ver GAP_FILL_MS). Cubre
 *  el rango del proveedor de red (20-50 m) sin colar los saltos gordos. */
const ACC_CAP_M = 50;
/** Silencio de fixes buenos tras el cual se acepta uno burdo por continuidad. */
const GAP_FILL_MS = 8000;
/**
 * Velocidad por encima de la cual un tramo es un salto imposible a pie
 * (28,8 km/h): el punto se pinta igual, pero NO suma a la distancia, para que
 * un brinco del sensor no infle los km.
 */
const MAX_SPEED_MPS = 8;
/**
 * Desplazamiento mínimo para que un tramo cuente como movimiento real.
 *
 * Con el proveedor entregando cada segundo, un GPS quieto "se mueve" 3-5 m por
 * la deriva del sensor. Sumar eso daría kilómetros fantasma parado (el clásico
 * problema del semáforo).
 *
 * OJO: no se compara contra la fijación ANTERIOR, sino contra un ANCLA. Andando
 * a 1,4 m/s cada tramo mide ~1,4 m y ninguno superaría el umbral por separado:
 * la distancia no subiría nunca. Con ancla, se acumula hasta superarlo y
 * entonces se suma el desplazamiento entero. Así el paseo lento cuenta y la
 * deriva no.
 */
const MIN_MOVE_M = 5;
/**
 * El desplazamiento tiene que superar la INCERTIDUMBRE del fix, no un número
 * fijo, para contar como movimiento.
 *
 * Medido en una ruta real con el móvil quieto sobre la mesa: precisión ±20 m y
 * saltos de 8-22 m entre fijaciones consecutivas (el punto rebota dentro de su
 * círculo de error). Con un umbral fijo de 5 m, los 17 tramos pasaban el filtro
 * y salían 248 m andados sin moverse. Comparando contra la precisión, un salto
 * de 20 m con ±20 m de error es indistinguible de estar parado: no cuenta.
 *
 * El factor 1,5 da margen: exigir solo `> precisión` dejaba pasar los saltos
 * justos por encima.
 */
const ACC_FACTOR = 1.5;

export type IncomingFix = {
  lat: number;
  lng: number;
  timestamp: number;
  /** Radio de incertidumbre horizontal en metros. `undefined` = desconocido. */
  accuracy?: number;
};

export type FixState = {
  /** Última fijación ACEPTADA (posición + su timestamp). null si aún ninguna. */
  last: { lat: number; lng: number; timestamp: number } | null;
  /** Ancla de distancia: última posición desde la que se contó desplazamiento. */
  anchor: { lat: number; lng: number; timestamp: number } | null;
  /** Cuántas se han aceptado ya. Las 2 primeras entran sin filtrar (asentado). */
  count: number;
};

export type FixDecision = {
  /** Se pinta en el mapa y pasa a ser el punto azul actual. */
  accept: boolean;
  /** Metros que suma a la distancia total (0 si no debe contar). */
  addDistanceM: number;
  /** Este fix pasa a ser la nueva ancla de distancia. */
  advanceAnchor: boolean;
};

const DROP: FixDecision = { accept: false, addDistanceM: 0, advanceAnchor: false };

export function decideFix(fix: IncomingFix, state: FixState): FixDecision {
  // Fase inicial: los 2 primeros entran sin filtrar para que el GPS se asiente
  // sin quedarse clavado en el punto 1 si ese resultó ser malo.
  if (state.count < 2) return { accept: true, addDistanceM: 0, advanceAnchor: true };

  const last = state.last;

  // Timestamp fuera de orden: los dos proveedores entregan desordenado (dt
  // negativo en los datos reales). Un fix más viejo que el último aceptado
  // movería el punto "hacia atrás en el tiempo": se descarta.
  if (last && fix.timestamp < last.timestamp) return DROP;

  const gapMs = last ? fix.timestamp - last.timestamp : Infinity;

  // Puerta de precisión: un fix burdo (típicamente red) solo entra si hace
  // rato que no llega nada bueno —un hueco real— y ni así si es disparatado.
  if (fix.accuracy != null && fix.accuracy > ACC_GOOD_M) {
    if (gapMs < GAP_FILL_MS || fix.accuracy > ACC_CAP_M) return DROP;
  }

  // El fix es bueno: se pinta siempre. Lo que se decide ahora es si además
  // cuenta como desplazamiento real.
  const anchor = state.anchor ?? last;
  if (!anchor) return { accept: true, addDistanceM: 0, advanceAnchor: true };

  const m = haversineM(anchor, fix);
  const dt = (fix.timestamp - anchor.timestamp) / 1000;

  // Umbral de ruido: el mayor entre el mínimo fijo y la incertidumbre del fix.
  // Por debajo es indistinguible de la deriva del sensor: se pinta pero no
  // suma, y el ancla NO avanza (así se va acumulando el paseo lento).
  const ruidoM = Math.max(MIN_MOVE_M, (fix.accuracy ?? 0) * ACC_FACTOR);
  if (m < ruidoM) return { accept: true, addDistanceM: 0, advanceAnchor: false };

  // Salto imposible a pie: se pinta, no suma, pero el ancla SÍ avanza para no
  // quedarse midiendo eternamente contra un punto que ya no es dónde estás.
  if (dt > 0 && m / dt > MAX_SPEED_MPS) {
    return { accept: true, addDistanceM: 0, advanceAnchor: true };
  }

  return { accept: true, addDistanceM: m, advanceAnchor: true };
}
