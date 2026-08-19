/**
 * Pruebas de INTEGRACIÓN de la cadena de cardio: llegada de fijaciones →
 * limpieza de traza → progreso sobre una ruta guardada.
 *
 * Por qué existen: cada arreglo del GPS ha roto el modo seguimiento sin que se
 * notara hasta salir a la calle. `route-progress` y `clean-trace` se prueban
 * por separado; estos prueban que ENCAJAN, que es donde se rompía.
 *
 * La regla que replican, y que NO debe volver a cambiarse: el store mete en la
 * traza TODA fijación que llegue, sin filtrarla por precisión. Filtrar en JS
 * fue exactamente lo que rompió la obtención de ubicación (el punto aparecía al
 * iniciar la ruta y no volvía a moverse). La limpieza se hace al DIBUJAR, con
 * `cleanTrace`, donde equivocarse no apaga nada.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTrace } from "./clean-trace";
import { haversineM } from "./clean-trace";
import { computeRouteProgress, type LatLng } from "./route-progress";

const LAT = 39.493;
const LNG0 = -0.357;
const mLng = 111320 * Math.cos((LAT * Math.PI) / 180);
const este = (m: number) => LNG0 + m / mLng;
const norte = (m: number) => LAT + m / 110540;

/** Ruta guardada: 1 km recto al este, vértice cada 10 m. */
const RUTA: LatLng[] = [];
for (let m = 0; m <= 1000; m += 10) RUTA.push({ lat: LAT, lng: este(m) });

type Fix = { lat: number; lng: number; timestamp: number };

/** Mismos topes que el store (cardio-store.tsx). */
const MAX_SPEED_MPS = 8;
const MAX_JUMP_M = 80;
const MIN_MOVE_M = 5;

/**
 * Réplica exacta del manejador `onPosition` del store: toda fijación entra en
 * la traza; solo la distancia descarta saltos imposibles y micro-movimientos.
 */
function grabar(fixes: Fix[]) {
  const traza: Fix[] = [];
  let prev: Fix | null = null;
  let anchor: Fix | null = null;
  let distanciaM = 0;
  for (const f of fixes) {
    const dtSec = prev ? (f.timestamp - prev.timestamp) / 1000 : 0;
    const saltoM = prev ? haversineM(prev, f) : 0;
    const esSalto = prev
      ? dtSec > 0
        ? saltoM / dtSec > MAX_SPEED_MPS
        : saltoM > MAX_JUMP_M
      : false;
    prev = f;
    if (!anchor) {
      anchor = f;
    } else if (!esSalto) {
      const distM = haversineM(anchor, f);
      if (distM >= MIN_MOVE_M) {
        distanciaM += distM;
        anchor = f;
      }
    }
    traza.push(f);
  }
  return { traza, distanciaM };
}

/** Recorre la ruta a 1,4 m/s emitiendo una fijación de GPS por segundo. */
function caminarLaRuta(opts: { conRuidoDeRed?: boolean } = {}): Fix[] {
  const fixes: Fix[] = [];
  let t = 1_000_000;
  for (let m = 0; m <= 1000; m += 1.4) {
    fixes.push({ lat: LAT, lng: este(m), timestamp: t });
    if (opts.conRuidoDeRed) {
      // El proveedor de red mete una posición burda 25 m al norte.
      fixes.push({ lat: norte(25), lng: este(m), timestamp: t + 400 });
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
  // Los picos de 25 m implican 62 m/s: `cleanTrace` los tira al dibujar. Es la
  // prueba de que no hace falta filtrarlos antes, en la obtención.
  const { traza } = grabar(caminarLaRuta({ conRuidoDeRed: true }));
  const p = computeRouteProgress(RUTA, cleanTrace(traza))!;
  assert.ok(p.ratio > 0.99, `la ruta debería completarse igual, ratio ${p.ratio}`);
  assert.equal(p.detours.length, 0, "el ruido de red se coló como desvío");
  assert.equal(p.doneSegments.length, 1, "el verde no debería partirse");
});

test("REGRESIÓN: parado, la traza sigue viva pero la distancia no se infla", () => {
  // 60 fijaciones en el mismo sitio con la deriva típica del GPS (±4 m).
  const fixes: Fix[] = [];
  let t = 1_000_000;
  for (let i = 0; i < 60; i++) {
    const deriva = (i % 2 === 0 ? 1 : -1) * 4;
    fixes.push({ lat: norte(deriva), lng: este(deriva), timestamp: t });
    t += 1000;
  }
  const { traza, distanciaM } = grabar(fixes);
  // Lo primero es lo que el usuario ve: el GPS sigue entregando y el punto se
  // mueve. Que la app "se quede muda" estando quieto es EL fallo a evitar.
  assert.equal(traza.length, 60, "ninguna fijación puede descartarse");
  assert.ok(distanciaM < 200, `km fantasma estando parado: ${distanciaM.toFixed(0)} m`);
});

test("REGRESIÓN: un desvío real (obra) sigue detectándose", () => {
  // Andando la ruta pero apartándose 80 m entre el metro 300 y el 450.
  const fixes: Fix[] = [];
  let t = 1_000_000;
  for (let m = 0; m <= 1000; m += 1.4) {
    const fuera = m > 300 && m < 450;
    fixes.push({ lat: fuera ? norte(80) : LAT, lng: este(m), timestamp: t });
    t += 1000;
  }
  const { traza } = grabar(fixes);
  const p = computeRouteProgress(RUTA, cleanTrace(traza))!;
  assert.equal(p.detours.length, 1, "el desvío real debe seguir apareciendo");
  assert.ok(p.doneSegments.length >= 2, "debe quedar hueco sin completar");
  assert.ok(p.ratio < 0.95, `no puede salir completa: ratio ${p.ratio}`);
});
