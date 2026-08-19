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

type Fix = { lat: number; lng: number; timestamp: number; accuracy?: number };

/** Mismos topes que el store (cardio-store.tsx). */
const MAX_SPEED_MPS = 8;
const MAX_JUMP_M = 80;
const MIN_MOVE_M = 5;
const ACC_MAX_M = 30;

/**
 * Réplica exacta del manejador `onPosition` del store: toda fijación entra en
 * la traza; solo la distancia descarta saltos imposibles y micro-movimientos.
 */
function grabar(fixes: Fix[]) {
  const traza: Fix[] = [];
  let posiciones = 0;
  let prev: Fix | null = null;
  let anchor: Fix | null = null;
  let distanciaM = 0;
  for (const f of fixes) {
    // El punto azul se mueve con TODA fijacion, sin ninguna condicion delante.
    posiciones += 1;
    // De aqui abajo solo se decide que se DIBUJA.
    if (f.accuracy != null && f.accuracy > ACC_MAX_M) continue;
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
      traza.push(f);
    } else if (!esSalto) {
      const distM = haversineM(anchor, f);
      if (distM >= MIN_MOVE_M) {
        distanciaM += distM;
        anchor = f;
        traza.push(f);
      }
    }
  }
  return { traza, posiciones, distanciaM };
}

/** Recorre la ruta a 1,4 m/s emitiendo una fijación de GPS por segundo. */
function caminarLaRuta(opts: { conRuidoDeRed?: boolean } = {}): Fix[] {
  const fixes: Fix[] = [];
  let t = 1_000_000;
  for (let m = 0; m <= 1000; m += 1.4) {
    fixes.push({ lat: LAT, lng: este(m), timestamp: t, accuracy: 8 });
    if (opts.conRuidoDeRed) {
      // El proveedor de red mete una posición burda 25 m al norte, y la
      // delata su precisión: ±35 m frente a los ±8 m del GPS.
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
  // Los picos de 25 m se descartan por precisión (±35 m) antes de dibujarse.
  // Ojo: se descartan de la TRAZA, no de la obtención — cada uno de ellos ha
  // movido el punto azul igual, que es lo que prueba que el GPS sigue vivo.
  const { traza } = grabar(caminarLaRuta({ conRuidoDeRed: true }));
  const p = computeRouteProgress(RUTA, cleanTrace(traza))!;
  assert.ok(p.ratio > 0.99, `la ruta debería completarse igual, ratio ${p.ratio}`);
  assert.equal(p.detours.length, 0, "el ruido de red se coló como desvío");
  assert.equal(p.doneSegments.length, 1, "el verde no debería partirse");
});

test("REGRESIÓN: parado, el punto sigue vivo pero la traza no se ensucia", () => {
  // 60 fijaciones en el mismo sitio con la deriva típica del GPS (±4 m).
  const fixes: Fix[] = [];
  let t = 1_000_000;
  for (let i = 0; i < 60; i++) {
    const deriva = (i % 2 === 0 ? 1 : -1) * 4;
    fixes.push({ lat: norte(deriva), lng: este(deriva), timestamp: t, accuracy: 8 });
    t += 1000;
  }
  const { traza, posiciones, distanciaM } = grabar(fixes);
  // Lo primero es lo que el usuario ve: el punto azul se mueve con CADA
  // fijación. Que se quede clavado estando quieto es EL fallo a evitar.
  assert.equal(posiciones, 60, "ninguna fijación puede dejar de mover el punto");
  // Y a la vez la traza no se llena de deriva: ni estrella de líneas alrededor
  // del punto, ni kilómetros que nadie ha andado.
  assert.ok(traza.length <= 2, `la traza se llenó de deriva: ${traza.length} puntos`);
  assert.ok(distanciaM < 200, `km fantasma estando parado: ${distanciaM.toFixed(0)} m`);
});

test("REGRESIÓN: un desvío real (obra) sigue detectándose", () => {
  // Andando la ruta pero apartándose 80 m entre el metro 300 y el 450.
  const fixes: Fix[] = [];
  let t = 1_000_000;
  for (let m = 0; m <= 1000; m += 1.4) {
    const fuera = m > 300 && m < 450;
    fixes.push({ lat: fuera ? norte(80) : LAT, lng: este(m), timestamp: t, accuracy: 8 });
    t += 1000;
  }
  const { traza } = grabar(fixes);
  const p = computeRouteProgress(RUTA, cleanTrace(traza))!;
  assert.equal(p.detours.length, 1, "el desvío real debe seguir apareciendo");
  assert.ok(p.doneSegments.length >= 2, "debe quedar hueco sin completar");
  assert.ok(p.ratio < 0.95, `no puede salir completa: ratio ${p.ratio}`);
});
