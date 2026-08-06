/**
 * Intent Analyzer — decide qué MÓDULOS entran en juego para un turno, sin
 * cargarle a Gemini el catálogo entero.
 *
 * Etapa 1 (aquí): pre-filtro determinista y gratis por palabras clave, más
 * continuidad (mantener "calientes" los módulos del turno anterior para
 * follow-ups tipo "¿y el otro brazo?").
 *
 * Etapa 2 (pendiente): router opcional con Gemini Flash SOLO cuando el
 * pre-filtro queda ambiguo. Devolvería la lista de módulos, sin tools todavía.
 * Se enchufa detrás de `analyzeIntent` sin tocar el resto del engine.
 */
import type { NoaModule, ToolModule } from "@/lib/noa/types";

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
  const hits = new Set<NoaModule>();

  for (const mod of modules) {
    for (const kw of mod.intentKeywords) {
      if (haystack.includes(normalize(kw))) {
        hits.add(mod.id);
        break;
      }
    }
  }

  // Continuidad: si el turno no casó ningún módulo por sí mismo, hereda los del
  // turno anterior (p.ej. "guárdala", "y el otro brazo?" tras hablar de
  // entrenamiento). Solo cuando no hay señal propia, para no ensanchar el scope
  // de un mensaje que ya apunta claramente a otro módulo.
  if (hits.size === 0 && recent.length > 0) {
    for (const m of recent) hits.add(m);
  }

  return { modules: [...hits], general: hits.size === 0 };
}
