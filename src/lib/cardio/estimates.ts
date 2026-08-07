/**
 * Estimaciones de cardio. UNA sola fuente para toda la app.
 *
 * Antes habia dos formulas distintas de calorias: el listado usaba
 * `distanciaKm * pesoCorporal` y el detalle `duracionSec * 0.15` (con un
 * comentario que admitia que era "para simular"). La misma carrera mostraba
 * cifras distintas segun la pantalla --5 km en 30 min de una persona de 75 kg
 * daban 375 kcal en el resumen y 270 en el detalle--, lo que destruye la
 * confianza en todos los demas numeros de la app.
 *
 * Son ESTIMACIONES, no medidas. La UI debe rotularlas como tales: no hay
 * podometro ni pulsometro detras, solo distancia y peso.
 */

/** Longitud de zancada media al caminar/correr, en metros. */
const STRIDE_M = 0.75;

/**
 * Coste energetico de correr o caminar: ~1 kcal por kg de peso y km recorrido.
 * Es la aproximacion estandar y, a diferencia de la basada en tiempo, no
 * premia a quien va mas lento.
 */
const KCAL_PER_KG_PER_KM = 1;

/** Pasos estimados a partir de la distancia. Sin podometro real. */
export function estimateSteps(distanceKm: number): number {
  return Math.round((distanceKm * 1000) / STRIDE_M);
}

/** Calorias estimadas a partir de la distancia y el peso corporal. */
export function estimateKcal(distanceKm: number, bodyweightKg: number): number {
  return Math.round(distanceKm * bodyweightKg * KCAL_PER_KG_PER_KM);
}
