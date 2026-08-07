/** 1RM estimado con Epley, capado a 12 reps (pierde fiabilidad por encima). */
export function estimate1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}
