import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * NOA · Personalidad — capa de COMPORTAMIENTO sobre el motor.
 *
 * Lo único que hace este fichero es traducir las preferencias del usuario a un
 * bloque de texto que se añade al system prompt. No toca el registro de tools,
 * ni el Action Gate, ni el bucle: NOA sigue siendo Tool-First exactamente igual
 * con cualquier combinación de ajustes. Si esto desapareciera, NOA respondería
 * lo mismo con otro tono.
 *
 * Requiere `20260806_noa_personality.sql`. Mientras no exista, se usan los
 * valores por defecto en vez de tumbar la petición (igual que keys.ts).
 */

import {
  DEFAULT_PERSONALITY,
  NICKNAME_MAX,
  type NoaLength,
  type NoaPersona,
  type NoaPersonality,
  type NoaTone,
} from "@/lib/noa/personality-options";

export { DEFAULT_PERSONALITY, NICKNAME_MAX };
export type { NoaPersonality };

// —— Instrucciones por opción ——————————————————————————————————
// Redactadas como indicaciones de ESTILO. Ninguna concede permiso para omitir
// una tool, rellenar huecos ni suavizar un dato: eso lo fija SYSTEM_BASE y se
// vuelve a afirmar al cierre del bloque.

const TONE_TEXT: Record<NoaTone, string> = {
  formal:
    "Habla con tono formal y profesional. Trata al usuario de usted si encaja, evita coloquialismos y no uses emojis.",
  cercano:
    "Habla con tono cercano y natural, de tú, como un compañero de entrenamiento. Emojis solo si aportan algo.",
  muy_cercano:
    "Habla con tono muy cercano y desenfadado, con confianza y expresiones coloquiales. Puedes usar emojis con soltura.",
};

const PERSONA_TEXT: Record<NoaPersona, string> = {
  entrenador:
    "Compórtate como un entrenador profesional: objetivo, centrado en el rendimiento y en el siguiente paso concreto.",
  motivador:
    "Compórtate como un entrenador motivador: refuerza lo que el usuario hace bien y anímale, sin exagerar ni felicitar por logros que los datos no respalden.",
  analitico:
    "Compórtate de forma analítica: apóyate en cifras, tendencias y comparaciones concretas que salgan de las herramientas.",
  profesor:
    "Compórtate como un profesor: explica el porqué de cada recomendación, con el razonamiento detrás.",
  exigente:
    "Compórtate de forma exigente y directa: señala los fallos sin rodeos ni paños calientes. Exigente no es faltar al respeto.",
  tranquilo:
    "Compórtate de forma tranquila y relajada, sin urgencia ni presión, respetando el ritmo del usuario.",
};

const LENGTH_TEXT: Record<NoaLength, string> = {
  cortas:
    "Responde muy breve: lo imprescindible, sin preámbulos ni resúmenes finales.",
  normales: "Responde con longitud equilibrada.",
  explicadas:
    "Responde con detalle, añadiendo razonamiento y contexto cuando aporten.",
};

/**
 * Construye el bloque de personalidad para el system prompt.
 *
 * `profileName` es el nombre del perfil, que se usa cuando el usuario no ha
 * puesto apodo. Si tampoco hay nombre, no se inventa: se omite la línea y NOA
 * simplemente no le llama de ninguna forma concreta.
 */
export function renderPersonalityBlock(
  p: NoaPersonality,
  profileName?: string | null,
): string {
  const name = (p.nickname || profileName || "").trim();

  const lines = [
    "PERSONALIDAD DEL ASISTENTE",
    "",
    ...(name ? [`Dirígete al usuario como "${name}".`] : []),
    TONE_TEXT[p.tone] ?? TONE_TEXT.cercano,
    PERSONA_TEXT[p.persona] ?? PERSONA_TEXT.entrenador,
    LENGTH_TEXT[p.length] ?? LENGTH_TEXT.normales,
    "",
    // Cierre innegociable. Va al final a propósito: es lo último que lee el
    // modelo antes del contexto, y deja claro que lo de arriba es solo forma.
    "Todo lo anterior afecta ÚNICAMENTE a la forma de expresarte: tono,",
    "vocabulario, cercanía y longitud. No cambia en nada lo que haces:",
    "sigues obteniendo cualquier dato mediante herramientas, no inventas ni",
    "estimas información que no te hayan devuelto, no alteras ni maquillas los",
    "resultados, y no omites una herramienta por brevedad. Si un ajuste de",
    "estilo choca con decir la verdad o con usar una herramienta, gana la",
    "verdad y gana la herramienta.",
  ];

  return lines.join("\n");
}

/** Fila tal cual la guarda Supabase. */
type PersonalityRow = {
  noa_nickname?: string | null;
  noa_tone?: string | null;
  noa_persona?: string | null;
  noa_length?: string | null;
  name?: string | null;
};

function coerce<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export interface UserPersonality {
  personality: NoaPersonality;
  /** Nombre del perfil, para el fallback del apodo. */
  profileName: string | null;
}

/**
 * Lee la personalidad del usuario. Ante cualquier fallo (columnas sin migrar,
 * error de lectura) devuelve los valores por defecto: NOA debe seguir
 * respondiendo aunque no se pueda personalizar.
 */
export async function getUserPersonality(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPersonality> {
  const { data, error } = await supabase
    .from("profiles")
    .select("noa_nickname, noa_tone, noa_persona, noa_length, name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[noa:personality] no se pudo leer, se usan los valores por defecto:", error.message);
    return { personality: DEFAULT_PERSONALITY, profileName: null };
  }

  const row = (data ?? {}) as PersonalityRow;
  return {
    personality: {
      nickname: (row.noa_nickname ?? "").slice(0, NICKNAME_MAX),
      tone: coerce(row.noa_tone, ["formal", "cercano", "muy_cercano"] as const, "cercano"),
      persona: coerce(
        row.noa_persona,
        ["entrenador", "motivador", "analitico", "profesor", "exigente", "tranquilo"] as const,
        "entrenador",
      ),
      length: coerce(row.noa_length, ["cortas", "normales", "explicadas"] as const, "normales"),
    },
    profileName: row.name ?? null,
  };
}
