/**
 * Pruebas del filtro de fijaciones GPS (`decideFix`).
 *
 * Reproducen el patrón REAL medido en una ruta de la cuenta test: el proveedor
 * de red intercalaba fixes ~25 m fuera de la línea del GPS, con timestamps
 * desordenados, y el punto botaba. Cada caso es algo que se rompió de verdad.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { decideFix, type FixState, type IncomingFix } from "./fix-filter";
import { haversineM } from "./clean-trace";

const LAT = 39.493;
const LNG0 = -0.357;
const mLng = 111320 * Math.cos((LAT * Math.PI) / 180);
const este = (m: number) => LNG0 + m / mLng;
const norte = (m: number) => LAT + m / 110540;

/** Simula el stream entero pasándolo por decideFix como lo hace el store. */
function correr(fixes: IncomingFix[]) {
  const state: FixState = { last: null, anchor: null, count: 0 };
  const trazaAceptada: IncomingFix[] = [];
  let distanciaM = 0;
  for (const f of fixes) {
    const d = decideFix(f, state);
    if (!d.accept) continue;
    distanciaM += d.addDistanceM;
    trazaAceptada.push(f);
    state.last = { lat: f.lat, lng: f.lng, timestamp: f.timestamp };
    if (d.advanceAnchor) state.anchor = state.last;
    state.count += 1;
  }
  return { trazaAceptada, distanciaM };
}

test("los fixes de red (burdos) intercalados se descartan; el punto no bota", () => {
  // Andando en línea recta al este a ~1,4 m/s. Cada segundo, el GPS da el punto
  // bueno (acc 8) y la red da uno 25 m al norte (acc 35), como en los datos.
  const fixes: IncomingFix[] = [];
  let t = 1_000_000;
  for (let i = 0; i < 30; i++) {
    const x = i * 1.4;
    fixes.push({ lat: LAT, lng: este(x), timestamp: t, accuracy: 8 }); // GPS
    t += 500;
    fixes.push({ lat: norte(25), lng: este(x), timestamp: t, accuracy: 35 }); // red
    t += 500;
  }
  const { trazaAceptada, distanciaM } = correr(fixes);

  // Ningún punto aceptado debe estar a 25 m de la línea (salvo la fase inicial).
  const fuera = trazaAceptada.slice(2).filter((p) => haversineM({ lat: LAT, lng: p.lng }, p) > 10);
  assert.equal(fuera.length, 0, "colaron fixes de red fuera de la línea");
  // La distancia debe rondar los ~40 m reales (30×1,4), no inflarse con botes.
  assert.ok(distanciaM < 60, `distancia inflada: ${distanciaM.toFixed(0)} m`);
});

test("timestamp fuera de orden (dt negativo) se descarta", () => {
  const base = 1_000_000;
  const state: FixState = {
    last: { lat: LAT, lng: este(10), timestamp: base + 5000 },
    anchor: { lat: LAT, lng: este(10), timestamp: base + 5000 },
    count: 5,
  };
  const viejo: IncomingFix = { lat: norte(25), lng: este(10), timestamp: base + 2000, accuracy: 8 };
  assert.equal(decideFix(viejo, state).accept, false);
});

test("un fix burdo SÍ entra si hace rato que no llega nada (hueco real)", () => {
  const base = 1_000_000;
  const state: FixState = {
    last: { lat: LAT, lng: este(0), timestamp: base },
    anchor: { lat: LAT, lng: este(0), timestamp: base },
    count: 5,
  };
  // 10 s después (>GAP_FILL_MS), solo hay un fix de red: se acepta por continuidad.
  const red: IncomingFix = { lat: LAT, lng: este(12), timestamp: base + 10_000, accuracy: 35 };
  assert.equal(decideFix(red, state).accept, true);
});

test("un fix disparatadamente impreciso no entra ni para tapar hueco", () => {
  const base = 1_000_000;
  const state: FixState = {
    last: { lat: LAT, lng: este(0), timestamp: base },
    anchor: { lat: LAT, lng: este(0), timestamp: base },
    count: 5,
  };
  const basura: IncomingFix = { lat: LAT, lng: este(12), timestamp: base + 20_000, accuracy: 200 };
  assert.equal(decideFix(basura, state).accept, false);
});

test("un salto imposible a pie se pinta pero NO suma distancia", () => {
  const base = 1_000_000;
  const state: FixState = {
    last: { lat: LAT, lng: este(0), timestamp: base },
    anchor: { lat: LAT, lng: este(0), timestamp: base },
    count: 5,
  };
  // 100 m en 1 s = 360 km/h, con buena precisión (deriva del propio GPS).
  const salto: IncomingFix = { lat: LAT, lng: este(100), timestamp: base + 1000, accuracy: 8 };
  const d = decideFix(salto, state);
  assert.equal(d.accept, true, "se pinta igual");
  assert.equal(d.addDistanceM, 0, "no debe sumar km fantasma");
});

test("los 2 primeros fixes entran sin filtrar (asentado del GPS)", () => {
  const base = 1_000_000;
  const s0: FixState = { last: null, anchor: null, count: 0 };
  assert.equal(decideFix({ lat: LAT, lng: LNG0, timestamp: base, accuracy: 99 }, s0).accept, true);
  const s1: FixState = { last: { lat: LAT, lng: LNG0, timestamp: base }, anchor: { lat: LAT, lng: LNG0, timestamp: base }, count: 1 };
  assert.equal(decideFix({ lat: norte(25), lng: LNG0, timestamp: base + 500, accuracy: 99 }, s1).accept, true);
});

test("sin accuracy (undefined) no se filtra por precisión: se comporta como antes", () => {
  const base = 1_000_000;
  const state: FixState = { last: { lat: LAT, lng: este(0), timestamp: base }, anchor: { lat: LAT, lng: este(0), timestamp: base }, count: 5 };
  const sinAcc: IncomingFix = { lat: LAT, lng: este(3), timestamp: base + 1000 };
  assert.equal(decideFix(sinAcc, state).accept, true);
});

test("paseo lento con fijaciones cada segundo SÍ acumula distancia", () => {
  // Con distanceFilter:0 llega 1 fix/s. Andando a 1,4 m/s cada tramo mide
  // ~1,4 m: por debajo del umbral de ruido. Sin ancla, la distancia se
  // quedaría a 0 para siempre; con ancla, se acumula y suma.
  const fixes: IncomingFix[] = [];
  let t = 1_000_000;
  for (let i = 0; i < 100; i++) {
    fixes.push({ lat: LAT, lng: este(i * 1.4), timestamp: t, accuracy: 8 });
    t += 1000;
  }
  const { distanciaM } = correr(fixes);
  // 100 fijaciones × 1,4 m ≈ 139 m recorridos.
  assert.ok(distanciaM > 120, `debería acumular el paseo: ${distanciaM.toFixed(0)} m`);
  assert.ok(distanciaM < 160, `no debería inflarse: ${distanciaM.toFixed(0)} m`);
});

test("QUIETO con fijaciones cada segundo NO acumula distancia (deriva)", () => {
  // El caso que rompía con distanceFilter:0 sin guarda: el GPS "se mueve"
  // 3-4 m por deriva y en 2 minutos inventaba cientos de metros.
  const fixes: IncomingFix[] = [];
  let t = 1_000_000;
  for (let i = 0; i < 120; i++) {
    const d = (i % 2 === 0 ? 1 : -1) * 3.5;
    fixes.push({ lat: norte(d), lng: este(d), timestamp: t, accuracy: 10 });
    t += 1000;
  }
  const { distanciaM } = correr(fixes);
  assert.ok(distanciaM < 60, `km fantasma parado: ${distanciaM.toFixed(0)} m`);
});

test("REGRESIÓN REAL: móvil quieto en interior no inventa cientos de metros", () => {
  // Datos medidos en un Pixel 9 sobre la mesa: precisión ±20 m y saltos de
  // 8-22 m entre fijaciones consecutivas (el punto rebota en su círculo de
  // error). Sin comparar contra la precisión salían 248 m "andados".
  const saltos = [7.8, 20.2, 21.8, 20.2, 18, 19, 21.4, 21.1, 10.5, 11.7, 15.1, 18.4, 8.8, 9.6, 11.2];
  const fixes: IncomingFix[] = [];
  let t = 1_000_000;
  let signo = 1;
  fixes.push({ lat: LAT, lng: este(0), timestamp: t, accuracy: 20 });
  for (const s of saltos) {
    t += 7000;
    // Rebote alterno alrededor del mismo sitio: eso es la deriva real.
    fixes.push({ lat: norte(signo * s * 0.5), lng: este(signo * s * 0.5), timestamp: t, accuracy: 20 });
    signo *= -1;
  }
  const { distanciaM } = correr(fixes);
  assert.ok(distanciaM < 40, `deriva contada como distancia: ${distanciaM.toFixed(0)} m`);
});

test("con BUENA precisión, andar sí cuenta (no se pasa de exigente)", () => {
  // Al aire libre la precisión baja a ±6 m: el umbral es 9 m, y un paseo
  // normal lo cruza en pocos segundos.
  const fixes: IncomingFix[] = [];
  let t = 1_000_000;
  for (let i = 0; i < 80; i++) {
    fixes.push({ lat: LAT, lng: este(i * 1.4), timestamp: t, accuracy: 6 });
    t += 1000;
  }
  const { distanciaM } = correr(fixes);
  assert.ok(distanciaM > 90, `debería contar el paseo: ${distanciaM.toFixed(0)} m`);
});
