import type { MuscleGroup } from "@/lib/ranks";

/** Musculo concreto (granular), usado por el mapa muscular SVG. */
export type MuscleId =
  | "pectoral"
  | "dorsal"
  | "espalda-media"
  | "lumbar"
  | "trapecio"
  | "deltoide"
  | "biceps"
  | "triceps"
  | "antebrazo"
  | "cuadriceps"
  | "isquiotibiales"
  | "gemelos"
  | "gluteo"
  | "aductores"
  | "abductores"
  | "abdominales"
  | "oblicuos";

export const MUSCLE_LABELS: Record<MuscleId, string> = {
  pectoral: "Pectoral",
  dorsal: "Dorsal",
  "espalda-media": "Espalda media",
  lumbar: "Lumbar",
  trapecio: "Trapecio",
  deltoide: "Deltoides",
  biceps: "Biceps",
  triceps: "Triceps",
  antebrazo: "Antebrazo",
  cuadriceps: "Cuadriceps",
  isquiotibiales: "Isquiotibiales",
  gemelos: "Gemelos",
  gluteo: "Gluteo",
  aductores: "Aductores",
  abductores: "Abductores",
  abdominales: "Abdominales",
  oblicuos: "Oblicuos",
};

/** A que grupo (de rangos) pertenece cada musculo granular. */
export const MUSCLE_TO_GROUP: Record<MuscleId, MuscleGroup> = {
  pectoral: "Pecho",
  dorsal: "Espalda",
  "espalda-media": "Espalda",
  lumbar: "Espalda",
  trapecio: "Espalda",
  deltoide: "Hombros",
  biceps: "Biceps",
  antebrazo: "Biceps",
  triceps: "Triceps",
  cuadriceps: "Piernas",
  isquiotibiales: "Piernas",
  gemelos: "Piernas",
  aductores: "Piernas",
  abductores: "Piernas",
  gluteo: "Gluteos",
  abdominales: "Core",
  oblicuos: "Core",
};

export type EquipmentId =
  | "barra"
  | "mancuernas"
  | "maquina"
  | "polea"
  | "peso-corporal"
  | "kettlebell"
  | "barra-z"
  | "otro";

export const EQUIPMENT_LABELS: Record<EquipmentId, string> = {
  barra: "Barra",
  mancuernas: "Mancuernas",
  maquina: "Maquina",
  polea: "Polea",
  "peso-corporal": "Peso corporal",
  kettlebell: "Kettlebell",
  "barra-z": "Barra Z",
  otro: "Otro",
};

export type DifficultyId = "principiante" | "intermedio" | "avanzado";

export const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  principiante: "Principiante",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
};

export type Exercise = {
  /** Slug propio en espanol, usado en la URL /biblioteca/[id]. */
  id: string;
  nombre: string;
  /** Grupo muscular principal (el de los rangos). */
  grupo: MuscleGroup;
  equipo: EquipmentId;
  dificultad: DifficultyId;
  mecanica: "compuesto" | "aislamiento";
  musculosPrimarios: MuscleId[];
  musculosSecundarios: MuscleId[];
  instrucciones: string[];
  consejos: string[];
  /**
   * Id del ejercicio en free-exercise-db (fuente de las imagenes).
   * Cada ejercicio tiene 2 frames: {fuenteId}/0.jpg y {fuenteId}/1.jpg.
   */
  fuenteId: string;
};

export type ExerciseFilters = {
  query?: string;
  grupo?: MuscleGroup;
  equipo?: EquipmentId;
  dificultad?: DifficultyId;
};
