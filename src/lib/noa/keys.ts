import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * BYOK — cada usuario guarda su propia clave de Gemini en Ajustes.
 *
 * La clave vive en `profiles.noa_gemini_key` con la RLS de siempre ("solo tu
 * fila"). El SERVIDOR la lee aquí para llamar a Gemini; nunca viaja del cliente
 * a Google. Hacia la UI solo devolvemos una versión enmascarada (`maskKey`):
 * el campo es de escritura desde el móvil y de lectura solo desde el servidor.
 *
 * Requiere la migración `20260806_noa_byok.sql` (añade la columna). Mientras no
 * exista, `getUserGeminiKey` degrada a `null` en vez de tumbar la petición.
 */

/** Enmascara la clave para pintarla en Ajustes sin exponerla ("••••4f2a"). */
export function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `••••${tail}`;
}

/**
 * Devuelve la clave de Gemini del usuario, o `null` si no la ha configurado
 * (o si la columna aún no existe). Corre bajo la sesión del propio usuario.
 */
export async function getUserGeminiKey(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("noa_gemini_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Columna ausente (migración sin aplicar) u otro fallo de lectura: NOA se
    // comporta como "sin clave" y la UI invita a configurarla, en vez de caer.
    console.warn("[noa:keys] no se pudo leer la clave:", error.message);
    return null;
  }

  const key = (data as { noa_gemini_key?: string | null } | null)?.noa_gemini_key;
  return key && key.trim().length > 0 ? key : null;
}
