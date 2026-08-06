/**
 * NOA · Personalidad — contratos y catálogo de opciones.
 *
 * Seguro en cliente y servidor (sin "server-only"): lo comparten el formulario
 * de Ajustes y el motor. Las instrucciones que ve el modelo NO están aquí, sino
 * en `personality.ts`, que sí es de servidor: el cliente elige claves, nunca
 * redacta el prompt.
 */

export type NoaTone = "formal" | "cercano" | "muy_cercano";
export type NoaPersona =
  | "entrenador"
  | "motivador"
  | "analitico"
  | "profesor"
  | "exigente"
  | "tranquilo";
export type NoaLength = "cortas" | "normales" | "explicadas";

export interface NoaPersonality {
  /** Cómo llamar al usuario. Vacío = nombre del perfil. */
  nickname: string;
  tone: NoaTone;
  persona: NoaPersona;
  length: NoaLength;
}

export const DEFAULT_PERSONALITY: NoaPersonality = {
  nickname: "",
  tone: "cercano",
  persona: "entrenador",
  length: "normales",
};

/** Tope del apodo: va literal dentro del system prompt. */
export const NICKNAME_MAX = 40;

export type Option<T extends string> = {
  value: T;
  label: string;
  /** Explicación corta para el usuario, en Ajustes. */
  hint: string;
};

export const TONE_OPTIONS: Option<NoaTone>[] = [
  { value: "formal", label: "Formal", hint: "Trato profesional y sin coloquialismos." },
  { value: "cercano", label: "Cercano", hint: "De tú, como un compañero de entreno." },
  { value: "muy_cercano", label: "Muy cercano", hint: "Con confianza, desenfadado y con emojis." },
];

export const PERSONA_OPTIONS: Option<NoaPersona>[] = [
  { value: "entrenador", label: "Entrenador profesional", hint: "Objetivo y centrado en el rendimiento." },
  { value: "motivador", label: "Motivador", hint: "Refuerza lo que haces bien y te anima." },
  { value: "analitico", label: "Analítico", hint: "Prioriza cifras, tendencias y comparaciones." },
  { value: "profesor", label: "Profesor", hint: "Explica el porqué de cada recomendación." },
  { value: "exigente", label: "Exigente", hint: "Directo, te señala los fallos sin rodeos." },
  { value: "tranquilo", label: "Tranquilo", hint: "Sin prisa ni presión, a tu ritmo." },
];

export const LENGTH_OPTIONS: Option<NoaLength>[] = [
  { value: "cortas", label: "Muy cortas", hint: "Solo lo imprescindible." },
  { value: "normales", label: "Normales", hint: "Equilibradas." },
  { value: "explicadas", label: "Explicadas", hint: "Con razonamiento y contexto." },
];
