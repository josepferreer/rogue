/**
 * Intent Analyzer — decide qué MÓDULOS entran en juego para un turno, sin
 * cargarle a Gemini el catálogo entero.
 *
 * Etapa 1 (aquí): pre-filtro determinista y gratis por palabras clave, más
 * continuidad (mantener "calientes" los módulos del turno anterior para
 * follow-ups tipo "¿y el otro brazo?").
 *
 * Etapa 2 (`intent/router.ts`): router con Gemini SOLO cuando el pre-filtro se
 * queda a cero. Se enchufa desde el engine, detrás de esta función.
 */
import type { NoaModule, ToolModule } from "@/lib/noa/types";

/**
 * Tope de módulos por turno. Con muchos módulos registrados, una frase larga
 * puede casar media app ("hoy", "plan", "peso"…) y meterle a Gemini decenas de
 * tools que no vienen a cuento: más contexto, más lento y más ocasiones de
 * elegir mal. Se prioriza por número de palabras clave acertadas.
 */
const MAX_MODULES = 4;

/** Normaliza para casar acentos/mayúsculas de forma tosca pero suficiente. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    // Quita marcas diacríticas combinantes (U+0300–U+036F): "pecho" == "péchо".
    .replace(/[̀-ͯ]/g, "");
}

export interface IntentResult {
  modules: NoaModule[];
  /** true si ningún módulo casó: charla general, se llama a Gemini sin tools. */
  general: boolean;
}

/**
 * @param message  turno del usuario.
 * @param modules  módulos registrados (aportan sus `intentKeywords`).
 * @param recent   módulos usados en el turno anterior, para continuidad.
 */
export function analyzeIntent(
  message: string,
  modules: ToolModule[],
  recent: NoaModule[] = [],
): IntentResult {
  const haystack = normalize(message);

  // Se cuentan los aciertos, no solo si hubo alguno: sirve para ordenar cuando
  // el mensaje toca varios módulos y hay que quedarse con los más probables.
  const scores = new Map<NoaModule, number>();
  for (const mod of modules) {
    let score = 0;
    for (const kw of mod.intentKeywords) {
      if (haystack.includes(normalize(kw))) score += 1;
    }
    if (score > 0) scores.set(mod.id, score);
  }

  // Continuidad: si el turno no casó ningún módulo por sí mismo, hereda los del
  // turno anterior (p.ej. "guárdala", "y el otro brazo?" tras hablar de
  // entrenamiento). Solo cuando no hay señal propia, para no ensanchar el scope
  // de un mensaje que ya apunta claramente a otro módulo.
  if (scores.size === 0) {
    for (const m of recent) scores.set(m, 1);
  }

  const ranked = [...scores.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_MODULES)
    .map(([id]) => id);

  return { modules: ranked, general: ranked.length === 0 };
}
