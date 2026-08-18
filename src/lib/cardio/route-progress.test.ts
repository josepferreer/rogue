/**
 * Pruebas del motor de rutas. Se ejecutan con `npm test` (runner de Node, sin
 * dependencias) y NO necesitan navegador ni base de datos: todo esto son
 * funciones puras.
 *
 * Por qué existen: al reescribir el cálculo de progreso para pintar los
 * desvíos en azul, era fácil romper el caso de "seguir una ruta guardada" sin
 * enterarse hasta salir a la calle. Cada caso de aquí abajo es un
 * comportamiento que YA se rompió alguna vez o que se rompería en silencio.
 *
 * Importaciones RELATIVAS a propósito: el runner no resuelve el alias `@/`,
 * y estos módulos no lo necesitan.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRouteProgress, type LatLng } from "./route-progress";
import { cleanTrace, haversineM } from "./clean-trace";

const LAT = 39.493;
const LNG0 = -0.357;
const mLng = 111320 * Math.cos((LAT * Math.PI) / 180);
const este = (m: number) => LNG0 + m / mLng;
const norte = (m: number) => LAT + m / 110540;

/** Ruta recta de 2 km hacia el este, un vértice cada 10 m. */
const RUTA: LatLng[] = [];
for (let m = 0; m <= 2000; m += 10) RUTA.push({ lat: LAT, lng: este(m) });

/** Recorre la ruta, apartándose `apartado` m entre `desde` y `hasta`. */
function traza(desde = -1, hasta = -1, apartado = 0): LatLng[] {
  const t: LatLng[] = [];
  for (let m = 0; m <= 2000; m += 5) {
    const fuera = m > desde && m < hasta;
    t.push({ lat: fuera ? norte(apartado) : LAT, lng: este(m) });
  }
  return t;
}

test("recorrer la ruta entera la completa al 100%", () => {
  const p = computeRouteProgress(RUTA, traza())!;
  assert.equal(p.started, true);
  assert.equal(p.doneSegments.length, 1, "un solo tramo, sin huecos");
  assert.equal(p.detours.length, 0);
  assert.ok(p.ratio > 0.99, `ratio ${p.ratio}`);
});

test("ir por la acera de al lado (2 m) NO se considera desvío", () => {
  // El corredor son 45 m: el error típico del GPS en ciudad ya son 5-15.
  const p = computeRouteProgress(RUTA, traza(-1, 2001, 2))!;
  assert.ok(p.ratio > 0.99, `ratio ${p.ratio}`);
  assert.equal(p.detours.length, 0);
});

test("un desvío deja hueco sin completar y se registra aparte", () => {
  const p = computeRouteProgress(RUTA, traza(700, 800, 80))!;
  assert.equal(p.doneSegments.length, 2, "el hueco parte el verde en dos");
  assert.equal(p.detours.length, 1);
  // ~100 m saltados sobre 2 km: en ningún caso puede salir 100%.
  assert.ok(p.ratio < 0.97, `ratio ${p.ratio}`);
});

test("un desvío LARGO no deja el seguimiento colgado", () => {
  // Regresión real: con una ventana fija de 250 m, un desvío de 600 m dejaba
  // el progreso clavado al 35% para el resto de la salida.
  const p = computeRouteProgress(RUTA, traza(700, 1300, 80))!;
  assert.ok(p.alongM > 1900, `se quedó en ${p.alongM} m de 2000`);
  assert.equal(p.detours.length, 1);
});

test("un punto suelto de ruido no inventa un desvío", () => {
  const t = traza();
  t[80] = { lat: norte(60), lng: t[80].lng };
  const p = computeRouteProgress(RUTA, t)!;
  assert.equal(p.detours.length, 0, "una sola fijación mala no es otra calle");
  assert.equal(p.doneSegments.length, 1, "ni parte el verde");
});

test("no se empieza hasta pasar por el inicio de la ruta", () => {
  // Traza que discurre en paralelo 500 m al norte: nunca toca el inicio.
  const lejos = traza().map((c) => ({ lat: norte(500), lng: c.lng }));
  const p = computeRouteProgress(RUTA, lejos)!;
  assert.equal(p.started, false);
  assert.equal(p.ratio, 0);
});

test("una ruta sin recorrer no está empezada ni completada", () => {
  const p = computeRouteProgress(RUTA, [])!;
  assert.equal(p.started, false);
  assert.equal(p.doneSegments.length, 0);
});

test("computeRouteProgress devuelve null si la ruta no es una ruta", () => {
  assert.equal(computeRouteProgress([], traza()), null);
  assert.equal(computeRouteProgress([{ lat: LAT, lng: LNG0 }], traza()), null);
});

test("cleanTrace descarta el salto imposible y conserva el resto", () => {
  const base = Date.now();
  const puntos = [
    { lat: LAT, lng: este(0), timestamp: base },
    { lat: LAT, lng: este(10), timestamp: base + 5000 },
    { lat: LAT, lng: este(4000), timestamp: base + 10_000 }, // 4 km en 5 s
    { lat: LAT, lng: este(20), timestamp: base + 15_000 },
    { lat: LAT, lng: este(30), timestamp: base + 20_000 },
  ];
  const limpio = cleanTrace(puntos);
  assert.ok(
    limpio.every((p) => haversineM({ lat: LAT, lng: este(0) }, p) < 1000),
    "el salto de 4 km no debería sobrevivir",
  );
});

test("cleanTrace conserva los campos extra del punto (p. ej. la altitud)", () => {
  // Regresión: si `cleanTrace` reconstruyera los objetos en vez de reenviarlos,
  // la altitud se perdería y el desnivel saldría siempre vacío.
  const base = Date.now();
  const puntos = [
    { lat: LAT, lng: este(0), timestamp: base, alt: 60 },
    { lat: LAT, lng: este(10), timestamp: base + 5000, alt: 61 },
    { lat: LAT, lng: este(20), timestamp: base + 10_000, alt: 62 },
  ];
  const limpio = cleanTrace(puntos);
  assert.equal(limpio.length, 3);
  assert.ok(
    limpio.every((p) => typeof p.alt === "number"),
    "se perdió la altitud por el camino",
  );
});
