/**
 * Ejercicios personalizados: validacion y normalizacion.
 *
 * Vive aparte de repo.ts a proposito: lo usan TRES entradas distintas (el
 * formulario de la biblioteca, la tool `createCustomExercise` de NOA y la capa
 * de Supabase), y las reglas tienen que ser exactamente las mismas en las tres.
 * En particular los musculos, porque alimentan el mapa de calor y el calculo de
 * recuperacion muscular: un id invalido no rompe nada visiblemente, solo hace
 * que el heatmap mienta.
 */
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  EXERCISE_CATEGORIES,
  MUSCLE_LABELS,
  type DifficultyId,
  type EquipmentId,
  type Exercise,
  type ExerciseCategory,
  type MuscleId,
} from "./types";

export const MUSCLE_IDS = Object.keys(MUSCLE_LABELS) as MuscleId[];
export const EQUIPMENT_IDS = Object.keys(EQUIPMENT_LABELS) as EquipmentId[];
export const DIFFICULTY_IDS = Object.keys(DIFFICULTY_LABELS) as DifficultyId[];

/** Prefijo que garantiza que un id propio nunca colisione con el catalogo. */
export const CUSTOM_ID_PREFIX = "custom-";

/**
 * `exercises.grupo` es una FK a `muscle_groups(id)`, y esos ids estan en
 * MINUSCULA ("piernas"), mientras que en la app la categoria es "Piernas".
 * El seed ya hacia el toLowerCase al sembrar; estas dos funciones cierran el
 * viaje de vuelta para los ejercicios personalizados, que si se leen de la BD.
 */
export function grupoToDb(grupo: ExerciseCategory): string {
  return grupo.toLowerCase();
}

export function grupoFromDb(raw: string): ExerciseCategory {
  const found = EXERCISE_CATEGORIES.find(
    (g) => g.toLowerCase() === raw.toLowerCase(),
  );
  if (!found) {
    throw new CustomExerciseError(`Grupo desconocido en base de datos: "${raw}".`);
  }
  return found;
}

export type CustomExerciseInput = {
  nombre: string;
  grupo: string;
  equipo: string;
  dificultad?: string;
  mecanica?: string;
  musculosPrimarios: string[];
  musculosSecundarios?: string[];
  instrucciones?: string[];
  consejos?: string[];
};

export class CustomExerciseError extends Error {}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Id unico y estable-ish. El sufijo evita colisiones entre dos ejercicios del
 *  mismo usuario que slugifiquen igual ("Sentadilla / Sentadilla!"). */
export function buildCustomId(nombre: string): string {
  const base = slugify(nombre) || "ejercicio";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${CUSTOM_ID_PREFIX}${base}-${suffix}`;
}

export function isCustomExerciseId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX);
}

function cleanList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Valida la entrada y devuelve un Exercise listo para persistir.
 * Lanza CustomExerciseError con un mensaje que se puede enseñar tal cual.
 */
export function validateCustomExercise(input: CustomExerciseInput): Exercise {
  const nombre = (input.nombre ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 3) {
    throw new CustomExerciseError("El nombre debe tener al menos 3 caracteres.");
  }
  if (nombre.length > 80) {
    throw new CustomExerciseError("El nombre no puede pasar de 80 caracteres.");
  }

  if (!EXERCISE_CATEGORIES.includes(input.grupo as ExerciseCategory)) {
    throw new CustomExerciseError(
      `Grupo no valido. Debe ser uno de: ${EXERCISE_CATEGORIES.join(", ")}.`,
    );
  }
  if (!EQUIPMENT_IDS.includes(input.equipo as EquipmentId)) {
    throw new CustomExerciseError(
      `Equipo no valido. Debe ser uno de: ${EQUIPMENT_IDS.join(", ")}.`,
    );
  }

  const dificultad = (input.dificultad ?? "principiante") as DifficultyId;
  if (!DIFFICULTY_IDS.includes(dificultad)) {
    throw new CustomExerciseError(
      `Dificultad no valida. Debe ser una de: ${DIFFICULTY_IDS.join(", ")}.`,
    );
  }

  const mecanica = (input.mecanica ?? "compuesto") as "compuesto" | "aislamiento";
  if (mecanica !== "compuesto" && mecanica !== "aislamiento") {
    throw new CustomExerciseError("Mecanica no valida: compuesto o aislamiento.");
  }

  // Los musculos son lo unico que no es cosmetico: de aqui salen el mapa de
  // calor y la recuperacion muscular.
  const primarios = cleanList(input.musculosPrimarios, 4);
  if (primarios.length === 0) {
    throw new CustomExerciseError("Indica al menos un musculo principal.");
  }
  const secundarios = cleanList(input.musculosSecundarios, 6);
  for (const m of [...primarios, ...secundarios]) {
    if (!MUSCLE_IDS.includes(m as MuscleId)) {
      throw new CustomExerciseError(
        `Musculo no valido: "${m}". Debe ser uno de: ${MUSCLE_IDS.join(", ")}.`,
      );
    }
  }
  const dup = primarios.filter((m) => secundarios.includes(m));
  if (dup.length > 0) {
    throw new CustomExerciseError(
      `Un musculo no puede ser principal y secundario a la vez: ${dup.join(", ")}.`,
    );
  }

  return {
    id: buildCustomId(nombre),
    nombre,
    grupo: input.grupo as ExerciseCategory,
    equipo: input.equipo as EquipmentId,
    dificultad,
    mecanica,
    musculosPrimarios: primarios as MuscleId[],
    musculosSecundarios: secundarios as MuscleId[],
    instrucciones: cleanList(input.instrucciones, 8),
    consejos: cleanList(input.consejos, 4),
    fuenteId: null,
    esPersonalizado: true,
  };
}
