import "server-only";
import type { NoaModule, ToolModule } from "@/lib/noa/types";
import { callGemini } from "@/lib/noa/gemini/client";

/**
 * Intent Analyzer, etapa 2 — router con Gemini.
 *
 * Se llama SOLO cuando el pre-filtro por palabras clave se queda a cero, que es
 * justo el caso donde más duele: mensajes como "¿cómo lo llevo?" o "¿qué me
 * recomiendas?" no casan ninguna palabra y NOA acababa respondiendo sin
 * herramientas, es decir, sin datos.
 *
 * Coste: una llamada extra a Gemini, cargada a la clave del usuario. Por eso NO
 * se usa cuando el pre-filtro ya acertó: sería pagar por confirmar algo que ya
 * sabemos. Sin tools y con una respuesta de una línea, es la llamada más barata
 * que se puede hacer.
 *
 * Ante cualquier fallo devuelve [] y el turno sigue como conversación general:
 * el router es una mejora, nunca un punto de fallo.
 */

const SYSTEM = [
  "Clasificas la petición de un usuario de una app de fitness.",
  "Responde SOLO con los identificadores de los módulos que harían falta para",
  "responderla, separados por comas, sin explicar nada. Si ninguno encaja,",
  "responde exactamente: ninguno",
  "",
  "Ante la duda, incluye de más: un módulo sobrante solo gasta contexto, pero",
  "uno que falte deja a NOA sin poder hacer lo que le piden.",
  "",
  "Ejemplos:",
  "- «hoy he hecho banca 4x8 con 80, apúntamelo» → training",
  "  (levantar peso en el gimnasio es training, aunque diga «hoy»; cardio es SOLO",
  "  correr/andar/bici)",
  "- «me he pesado 79,4» → profile",
  "- «he salido a hacer 10k» → cardio",
  "- «cuántas calorías he quemado» → cardio",
  "- «cuántas calorías he comido» → nutrition",
  "- «ya me he comido la cena» → nutrition",
  "- «qué me toca mañana» → calendar",
  "- «recuérdame estirar luego» → notifications",
  "- «cómo lo llevo este mes» → training, nutrition, cardio",
].join("\n");

/** Descripción corta de cada módulo, para que el router sepa qué es cada uno. */
const DESCRIPTIONS: Record<NoaModule, string> = {
  training:
    "gimnasio y pesas: rutina, ejercicios (banca, sentadilla, dominadas…), series, repeticiones, kilos levantados, registrar o terminar un entreno y progreso de fuerza",
  nutrition:
    "comidas, calorías INGERIDAS, macros, dieta, despensa y objetivos nutricionales",
  cardio:
    "correr, andar o bici: distancia, ritmo, rutas de GPS y calorías QUEMADAS. NO incluye levantar pesas",
  profile:
    "datos del usuario (peso corporal, pesajes, altura, objetivo) y preferencias de la app",
  calendar: "qué toca hoy o esta semana, agenda y planificación",
  notifications: "recordatorios y avisos programados",
  heatmap: "mapa de calor muscular",
  statistics: "estadísticas generales",
  library: "catálogo de ejercicios",
  settings: "ajustes de la aplicación",
};

export async function routeModules(
  message: string,
  modules: ToolModule[],
  apiKey: string,
): Promise<NoaModule[]> {
  const disponibles = modules.map((m) => m.id);
  if (disponibles.length === 0) return [];

  const catalogo = disponibles
    .map((id) => `- ${id}: ${DESCRIPTIONS[id] ?? id}`)
    .join("\n");

  try {
    const turn = await callGemini({
      apiKey,
      system: `${SYSTEM}\n\nMódulos disponibles:\n${catalogo}`,
      contents: [{ role: "user", parts: [{ text: message }] }],
      tools: [],
    });

    // Se filtra contra los módulos REALES: si el modelo se inventa un nombre,
    // simplemente no entra. Nunca se confía en su salida tal cual.
    const validos = new Set<string>(disponibles);
    return turn.text
      .toLowerCase()
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s): s is NoaModule => validos.has(s));
  } catch (err) {
    console.warn(
      "[noa:router] no se pudo clasificar, sigue como conversación general:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
