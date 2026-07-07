import type { Muscle } from "react-body-highlighter";
import type { MuscleId } from "./types";

/**
 * Traduce cada musculo granular de Rogue (MuscleId) a uno o varios musculos
 * del modelo SVG de react-body-highlighter. Un MuscleId puede mapear a varias
 * regiones (p.ej. el deltoide se pinta en la vista frontal y posterior).
 */
export const MUSCLE_ID_TO_SVG: Record<MuscleId, Muscle[]> = {
  pectoral: ["chest"],
  dorsal: ["upper-back"],
  "espalda-media": ["upper-back"],
  lumbar: ["lower-back"],
  trapecio: ["trapezius"],
  deltoide: ["front-deltoids", "back-deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  antebrazo: ["forearm"],
  cuadriceps: ["quadriceps"],
  isquiotibiales: ["hamstring"],
  gemelos: ["calves"],
  gluteo: ["gluteal"],
  aductores: ["adductor"],
  abductores: ["abductors"],
  abdominales: ["abs"],
  oblicuos: ["obliques"],
};

/** Convierte una lista de MuscleId en la lista de musculos SVG (sin duplicados). */
export function toSvgMuscles(ids: MuscleId[]): Muscle[] {
  const set = new Set<Muscle>();
  for (const id of ids) {
    for (const muscle of MUSCLE_ID_TO_SVG[id]) set.add(muscle);
  }
  return [...set];
}
