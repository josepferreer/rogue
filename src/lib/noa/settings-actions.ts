"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserGeminiKey, maskKey } from "@/lib/noa/keys";

/**
 * Server actions de la clave BYOK de NOA. Todo pasa por el servidor bajo la RLS
 * del usuario: la clave se escribe en `profiles.noa_gemini_key` y hacia el
 * cliente SOLO sale su versión enmascarada, nunca la clave entera.
 */

export interface NoaKeyStatus {
  hasKey: boolean;
  masked: string | null;
}

/** Estado de la clave para pintar Ajustes, sin exponerla. */
export async function getNoaKeyStatus(): Promise<NoaKeyStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { hasKey: false, masked: null };

  const key = await getUserGeminiKey(supabase, user.id);
  return key ? { hasKey: true, masked: maskKey(key) } : { hasKey: false, masked: null };
}

export type SaveKeyResult = { ok: true; masked: string } | { ok: false; error: string };

/** Guarda (o reemplaza) la clave del usuario. */
export async function saveNoaKey(rawKey: string): Promise<SaveKeyResult> {
  const key = rawKey.trim();
  if (key.length < 10) {
    return { ok: false, error: "La clave no parece válida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida." };

  const { error } = await supabase
    .from("profiles")
    .update({ noa_gemini_key: key })
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, masked: maskKey(key) };
}

/** Borra la clave (desactiva NOA para el usuario). */
export async function clearNoaKey(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("profiles")
    .update({ noa_gemini_key: null })
    .eq("user_id", user.id);

  return { ok: !error };
}
