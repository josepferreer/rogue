/**
 * Análisis de ritmo de una ruta EN CURSO.
 *
 * Entra una serie tiempo→distancia acumulada (sin coordenadas, ver
 * `NoaLiveCardio`) y salen tres cosas que el modelo no sabría deducir solo:
 * los tramos en los que se corre y en los que se anda, los parciales por
 * kilómetro y hacia dónde va el ritmo.
 *
 * Es una función pura: mismos números, mismo resultado. Toda la interpretación
 * ("vas de menos a más") la pone NOA encima, con estos datos delante.
 */

/** Umbrales de clasificación en km/h. Un ritmo de 9,5 km/h son 6'19"/km: por
 *  debajo es trote, por encima es carrera. Andar rápido raramente pasa de 6,5. */
const V_PARADO = 2;
const V_ANDANDO = 6.5;
const V_TROTE = 9.5;

/**
 * Ventana de suavizado. El GPS da picos de ±2 km/h entre lecturas contiguas;
 * sin suavizar, una caminata constante salía troceada en veinte "tramos" de
 * quince segundos y el análisis era ilegible.
 */
const SMOOTH_WINDOW_SEC = 45;

/** Un tramo más corto que esto no es un cambio de ritmo, es ruido: se absorbe
 *  en el tramo anterior. */
const MIN_SEGMENT_SEC = 45;

/** Ventana de "ritmo reciente", para responder a «¿cómo voy AHORA?». */
const RECENT_WINDOW_SEC = 300;

export type PaceKind = "parado" | "andando" | "trote" | "corriendo";

export interface PaceSegment {
  tipo: PaceKind;
  desdeSec: number;
  hastaSec: number;
  duracionSec: number;
  km: number;
  velocidadKmh: number;
  ritmoMinKm: string | null;
}

export interface KmSplit {
  km: number;
  tiempoSec: number;
  ritmoMinKm: string | null;
}

export interface PaceAnalysis {
  /** Muestras insuficientes para decir nada (recién empezado, GPS sin fijar). */
  suficiente: boolean;
  ritmoMedioMinKm: string | null;
  ritmoRecienteMinKm: string | null;
  /** Ritmo reciente contra el medio: acelerando, aguantando o aflojando. */
  tendencia: "acelerando" | "estable" | "aflojando" | null;
  reparto: {
    corriendoSec: number;
    troteSec: number;
    andandoSec: number;
    paradoSec: number;
    porcentajeEnMovimiento: number;
  };
  tramos: PaceSegment[];
  splitsPorKm: KmSplit[];
}

interface Interval {
  t0: number;
  t1: number;
  km: number;
  kmh: number;
}

export function analyzePace(samples: [number, number][]): PaceAnalysis {
  const intervals = toIntervals(samples);
  const totalSec = intervals.reduce((a, i) => a + (i.t1 - i.t0), 0);
  const totalKm = intervals.reduce((a, i) => a + i.km, 0);

  // Con menos de un minuto o cuatro muestras no hay señal: cualquier tramo
  // sería el error del GPS al fijar posición, no cómo va el usuario.
  if (intervals.length < 3 || totalSec < 60) {
    return {
      suficiente: false,
      ritmoMedioMinKm: paceLabel(totalKm, totalSec),
      ritmoRecienteMinKm: null,
      tendencia: null,
      reparto: {
        corriendoSec: 0,
        troteSec: 0,
        andandoSec: 0,
        paradoSec: 0,
        porcentajeEnMovimiento: 0,
      },
      tramos: [],
      splitsPorKm: [],
    };
  }

  const smoothed = smooth(intervals);
  const tramos = mergeSegments(smoothed);

  const reparto = {
    corriendoSec: 0,
    troteSec: 0,
    andandoSec: 0,
    paradoSec: 0,
    porcentajeEnMovimiento: 0,
  };
  for (const t of tramos) {
    if (t.tipo === "corriendo") reparto.corriendoSec += t.duracionSec;
    else if (t.tipo === "trote") reparto.troteSec += t.duracionSec;
    else if (t.tipo === "andando") reparto.andandoSec += t.duracionSec;
    else reparto.paradoSec += t.duracionSec;
  }
  reparto.porcentajeEnMovimiento =
    totalSec > 0 ? Math.round(((totalSec - reparto.paradoSec) / totalSec) * 100) : 0;

  const recent = window(intervals, RECENT_WINDOW_SEC);
  const recentKmh = recent.sec > 0 ? (recent.km / recent.sec) * 3600 : 0;
  const avgKmh = totalSec > 0 ? (totalKm / totalSec) * 3600 : 0;

  return {
    suficiente: true,
    ritmoMedioMinKm: paceLabel(totalKm, totalSec),
    ritmoRecienteMinKm: recent.sec >= 60 ? paceLabel(recent.km, recent.sec) : null,
    tendencia: recent.sec >= 60 ? trend(recentKmh, avgKmh) : null,
    reparto,
    tramos,
    splitsPorKm: splits(samples),
  };
}

/** Pares de muestras → intervalos con su velocidad media. */
function toIntervals(samples: [number, number][]): Interval[] {
  const out: Interval[] = [];
  for (let i = 1; i < samples.length; i++) {
    const [t0, km0] = samples[i - 1];
    const [t1, km1] = samples[i];
    const dt = t1 - t0;
    if (dt <= 0) continue;
    const km = Math.max(0, km1 - km0);
    out.push({ t0, t1, km, kmh: (km / dt) * 3600 });
  }
  return out;
}

/**
 * Media móvil ponderada por tiempo sobre `SMOOTH_WINDOW_SEC`, centrada. Solo
 * toca `kmh`: la distancia y los tiempos se dejan intactos para que los totales
 * y los splits sigan cuadrando con lo que marca el cronómetro de la app.
 */
function smooth(intervals: Interval[]): Interval[] {
  const half = SMOOTH_WINDOW_SEC / 2;
  return intervals.map((cur, i) => {
    const center = (cur.t0 + cur.t1) / 2;
    let km = 0;
    let sec = 0;
    for (let j = i; j >= 0; j--) {
      const other = intervals[j];
      if (center - (other.t0 + other.t1) / 2 > half) break;
      km += other.km;
      sec += other.t1 - other.t0;
    }
    for (let j = i + 1; j < intervals.length; j++) {
      const other = intervals[j];
      if ((other.t0 + other.t1) / 2 - center > half) break;
      km += other.km;
      sec += other.t1 - other.t0;
    }
    return { ...cur, kmh: sec > 0 ? (km / sec) * 3600 : cur.kmh };
  });
}

function classify(kmh: number): PaceKind {
  if (kmh < V_PARADO) return "parado";
  if (kmh < V_ANDANDO) return "andando";
  if (kmh < V_TROTE) return "trote";
  return "corriendo";
}

/** Intervalos consecutivos del mismo tipo → un tramo. Los tramos por debajo de
 *  `MIN_SEGMENT_SEC` se funden con el anterior (ruido, no cambio de ritmo). */
function mergeSegments(intervals: Interval[]): PaceSegment[] {
  const raw: { tipo: PaceKind; t0: number; t1: number; km: number }[] = [];
  for (const it of intervals) {
    const tipo = classify(it.kmh);
    const last = raw[raw.length - 1];
    if (last && last.tipo === tipo) {
      last.t1 = it.t1;
      last.km += it.km;
    } else {
      raw.push({ tipo, t0: it.t0, t1: it.t1, km: it.km });
    }
  }

  const merged: typeof raw = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && seg.t1 - seg.t0 < MIN_SEGMENT_SEC) {
      last.t1 = seg.t1;
      last.km += seg.km;
      continue;
    }
    merged.push({ ...seg });
  }

  return merged.map((s) => {
    const duracionSec = Math.round(s.t1 - s.t0);
    const km = round(s.km, 2);
    const kmh = duracionSec > 0 ? (s.km / duracionSec) * 3600 : 0;
    return {
      // El tipo se recalcula tras las fusiones: un tramo absorbido cambia la
      // media, y etiquetarlo con la clase del trozo original mentiría.
      tipo: classify(kmh),
      desdeSec: Math.round(s.t0),
      hastaSec: Math.round(s.t1),
      duracionSec,
      km,
      velocidadKmh: round(kmh, 1),
      ritmoMinKm: paceLabel(s.km, duracionSec),
    };
  });
}

/** Parciales por kilómetro completo, interpolando el instante del corte. */
function splits(samples: [number, number][]): KmSplit[] {
  const out: KmSplit[] = [];
  let target = 1;
  let prevCrossSec = 0;
  for (let i = 1; i < samples.length; i++) {
    const [t0, km0] = samples[i - 1];
    const [t1, km1] = samples[i];
    while (km1 >= target && km1 > km0) {
      const ratio = (target - km0) / (km1 - km0);
      const crossSec = t0 + (t1 - t0) * ratio;
      const tiempoSec = Math.round(crossSec - prevCrossSec);
      out.push({ km: target, tiempoSec, ritmoMinKm: paceLabel(1, tiempoSec) });
      prevCrossSec = crossSec;
      target += 1;
    }
  }
  return out;
}

/** Distancia y tiempo de los últimos `sec` segundos de la ruta. */
function window(intervals: Interval[], sec: number): { km: number; sec: number } {
  const end = intervals[intervals.length - 1]?.t1 ?? 0;
  const from = end - sec;
  let km = 0;
  let acc = 0;
  for (let i = intervals.length - 1; i >= 0; i--) {
    const it = intervals[i];
    if (it.t1 <= from) break;
    // Intervalo a caballo del corte: se toma la fracción proporcional.
    const dt = it.t1 - it.t0;
    const usable = Math.min(dt, it.t1 - Math.max(from, it.t0));
    if (usable <= 0) continue;
    const frac = usable / dt;
    km += it.km * frac;
    acc += usable;
  }
  return { km, sec: acc };
}

/** Margen del 5 %: por debajo, la diferencia es ruido y no una tendencia. */
function trend(recentKmh: number, avgKmh: number): PaceAnalysis["tendencia"] {
  if (avgKmh <= 0) return null;
  const diff = (recentKmh - avgKmh) / avgKmh;
  if (diff > 0.05) return "acelerando";
  if (diff < -0.05) return "aflojando";
  return "estable";
}

/** Ritmo en min/km como texto ("5'30\""), igual que el módulo cardio. */
export function paceLabel(km: number, sec: number): string | null {
  if (km <= 0 || sec <= 0) return null;
  const minPerKm = sec / 60 / km;
  if (!Number.isFinite(minPerKm) || minPerKm > 99) return null;
  const min = Math.floor(minPerKm);
  const s = Math.round((minPerKm - min) * 60);
  return s === 60 ? `${min + 1}'00"` : `${min}'${String(s).padStart(2, "0")}"`;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
