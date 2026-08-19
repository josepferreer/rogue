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

/** Categoria propia del ejercicio, usada por la biblioteca y sus filtros. */
export const EXERCISE_CATEGORIES = [
  "Pecho",
  "Espalda",
  "Hombros",
  "Biceps",
  "Triceps",
  "Piernas",
  "Gluteos",
  "Core",
] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

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

export type ExerciseVariant = {
  id: string;
  nombre: string;
  agarre?: string;
  fuenteId: string;
  musculosPrimarios?: MuscleId[];
  musculosSecundarios?: MuscleId[];
  instrucciones?: string[];
  consejos?: string[];
};

export type Exercise = {
  /** Slug propio en espanol, usado en la URL /biblioteca/[id]. */
  id: string;
  nombre: string;
  /** Categoria muscular principal (para biblioteca/filtros). */
  grupo: ExerciseCategory;
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
  /** Variantes de agarre/modalidad integradas dentro del mismo ejercicio. */
  variantes?: ExerciseVariant[];
};

export type ExerciseFilters = {
  query?: string;
  grupo?: ExerciseCategory;
  equipo?: EquipmentId;
  dificultad?: DifficultyId;
};
