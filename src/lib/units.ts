import type { WeightUnit } from "@/lib/workout/types";

const KG_PER_LB = 0.45359237;

/** Convierte kg (unidad interna de todo el estado) a la unidad de display. */
export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? kg : kg / KG_PER_LB;
}

/** Convierte un valor introducido en la unidad de display a kg. */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}

/**
 * Reexpresa un valor de una unidad a otra conservando el peso fisico. Lo usa la
 * sesion de entreno cuando el usuario cambia kg<->lb con un entreno abierto: lo
 * escrito en pantalla se reconvierte en vez de reinterpretarse (antes, 100 kg
 * pasaban a leerse como 100 lb y se guardaban 45,4 kg sin previo aviso).
 */
export function convertWeight(
  value: number,
  from: WeightUnit,
  to: WeightUnit,
): number {
  if (from === to) return value;
  return fromKg(toKg(value, from), to);
}

/** Formatea un peso en kg para mostrarlo en la unidad elegida, sin sufijo. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const v = fromKg(kg, unit);
  return (Math.round(v * 10) / 10).toLocaleString("es-ES", {
    maximumFractionDigits: 1,
  });
}
