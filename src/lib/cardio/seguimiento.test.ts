/**
 * Pruebas de INTEGRACIÓN de la cadena de cardio: filtro de fijaciones →
 * limpieza de traza → progreso sobre una ruta guardada.
 *
 * Por qué existen: cada arreglo del GPS ha roto el modo seguimiento sin que se
 * notara hasta salir a la calle. Los tests de `fix-filter` y `route-progress`
 * prueban cada pieza por separado; estos prueban que ENCAJAN, que es donde se
 * rompía. Simulan el stream tal y como lo consume el store.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { decideFix, type FixState, type IncomingFix } from "./fix-filter";
import { cleanTrace } from "./clean-trace";
import { computeRouteProgress, type LatLng } from "./route-progress";

const LAT = 39.493;
const LNG0 = -0.357;
const mLng = 111320 * Math.cos((LAT * Math.PI) / 180);
const este = (m: number) => LNG0 + m / mLng;
const norte = (m: number) => LAT + m / 110540;

/** Ruta guardada: 1 km recto al este, vértice cada 10 m. */
const RUTA: LatLng[] = [];
for (let m = 0; m <= 1000; m += 10) RUTA.push({ lat: LAT, lng: este(m) });

/** Pasa el stream por el filtro igual que hace el store, y devuelve la traza. */
function grabar(fixes: IncomingFix[]) {
  const state: FixState = { last: null, count: 0 };
  const traza: { lat: number; lng: number; timestamp: number }[] = [];
  let distanciaM = 0;
  for (const f of fixes) {
    const d = decideFix(f, state);
    if (!d.accept) continue;
    distanciaM += d.addDistanceM;
    const punto = { lat: f.lat, lng: f.lng, timestamp: f.timestamp };
    traza.push(punto);
    state.last = punto;
    state.count += 1;
  }
  return { traza, distanciaM };
}

/** Recorre la ruta a 1,4 m/s emitiendo una fijación de GPS por segundo. */
function caminarLaRuta(opts: { conRuidoDeRed?: boolean } = {}): IncomingFix[] {
  const fixes: IncomingFix[] = [];
  let t = 1_000_000;
  for (let m = 0; m <= 1000; m += 1.4) {
    fixes.push({ lat: LAT, lng: este(m), timestamp: t, accuracy: 8 });
    if (opts.conRuidoDeRed) {
      // El proveedor de red mete una posición burda 25 m al norte.
      fixes.push({ lat: norte(25), lng: este(m), timestamp: t + 400, accuracy: 35 });
    }
    t += 1000;
  }
  return fixes;
}

test("seguir una ruta entera la completa al 100% (sin ruido)", () => {
  const { traza } = grabar(caminarLaRuta());
  const p = computeRouteProgress(RUTA, cleanTrace(traza))!;
  assert.equal(p.started, true);
  assert.ok(p.ratio > 0.99, `ratio ${p.ratio}`);
  assert.equal(p.detours.length, 0, "no debería inventar desvíos");
});

test("REGRESIÓN: el ruido de red NO debe inventar desvíos ni romper el progreso", () => {
  // Sin el filtro, esos puntos a 25 m se pintaban y, al estar dentro del
  // corredor de 45 m, ensuciaban la traza; a 50 m habrían creado desvíos
  // falsos y huecos en el verde. Es el fallo que se veía en la ruta real.
  const { traza } = grabar(caminarLaRuta({ conRuidoDeRed: true }));
  const p = computeRouteProgress(RUTA, cleanTrace(traza))!;
  assert.ok(p.ratio > 0.99, `la ruta debería completarse igual, ratio ${p.ratio}`);
  assert.equal(p.detours.length, 0, "el ruido de red se coló como desvío");
  assert.equal(p.doneSegments.length, 1, "el verde no debería partirse");
});

test("REGRESIÓN: parado, el filtro no infla la distancia ni mueve el punto", () => {
  // 60 fijaciones en el mismo sitio con la deriva típica del GPS (±4 m).
  const fixes: IncomingFix[] = [];
  let t = 1_000_000;
  for (let i = 0; i < 60; i++) {
    const deriva = (i % 2 === 0 ? 1 : -1) * 4;
    fixes.push({ lat: norte(deriva), lng: este(deriva), timestamp: t, accuracy: 8 });
    t += 1000;
  }
  const { distanciaM } = grabar(fixes);
  // Con distanceFilter:5 el proveedor real ni emitiría; aquí se comprueba que
  // aunque emita, no se acumulan cientos de metros fantasma.
  assert.ok(distanciaM < 400, `km fantasma estando parado: ${distanciaM.toFixed(0)} m`);
});

test("REGRESIÓN: un desvío real (obra) sigue detectándose con el filtro puesto", () => {
  // Andando la ruta pero apartándose 80 m entre el metro 300 y el 450.
  const fixes: IncomingFix[] = [];
  let t = 1_000_000;
  for (let m = 0; m <= 1000; m += 1.4) {
    const fuera = m > 300 && m < 450;
    fixes.push({
      lat: fuera ? norte(80) : LAT,
      lng: este(m),
      timestamp: t,
      accuracy: 8,
    });
    t += 1000;
  }
  const { traza } = grabar(fixes);
  const p = computeRouteProgress(RUTA, cleanTrace(traza))!;
  assert.equal(p.detours.length, 1, "el desvío real debe seguir apareciendo");
  assert.ok(p.doneSegments.length >= 2, "debe quedar hueco sin completar");
  assert.ok(p.ratio < 0.95, `no puede salir completa: ratio ${p.ratio}`);
});

test("REGRESIÓN: al reanudar (traza previa) el filtro ya está activo", () => {
  // Simula recovery: el store siembra count con los puntos ya grabados, así
  // que el primer fix tras reanudar NO entra en fase inicial y sí se filtra.
  const state: FixState = {
    last: { lat: LAT, lng: este(500), timestamp: 1_000_000 },
    count: 350,
  };
  const burdo: IncomingFix = {
    lat: norte(30),
    lng: este(501),
    timestamp: 1_001_000,
    accuracy: 40,
  };
  assert.equal(decideFix(burdo, state).accept, false, "tras reanudar debe filtrar");
});
