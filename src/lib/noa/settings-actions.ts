"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserGeminiKey, maskKey } from "@/lib/noa/keys";
import {
  DEFAULT_PERSONALITY,
  NICKNAME_MAX,
  getUserPersonality,
  type NoaPersonality,
} from "@/lib/noa/personality";

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

// —— Personalidad ——————————————————————————————————————————————
// Solo estilo: estas preferencias acaban en el system prompt y en ningún otro
// sitio. Ver lib/noa/personality.ts.

/** Personalidad guardada (o los valores por defecto). */
export async function getNoaPersonality(): Promise<NoaPersonality> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PERSONALITY;

  const { personality } = await getUserPersonality(supabase, user.id);
  return personality;
}

export type SavePersonalityResult = { ok: true } | { ok: false; error: string };

/**
 * Guarda un cambio parcial. La UI guarda sola en cada cambio, así que llega un
 * campo cada vez. Los valores se validan contra el propio tipo antes de
 * escribir; la BD además los reafirma con CHECKs.
 */
export async function saveNoaPersonality(
  patch: Partial<NoaPersonality>,
): Promise<SavePersonalityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida." };

  const row: Record<string, string | null> = {};
  if (patch.nickname !== undefined) {
    const nickname = patch.nickname.trim().slice(0, NICKNAME_MAX);
    row.noa_nickname = nickname.length > 0 ? nickname : null;
  }
  if (patch.tone !== undefined) row.noa_tone = patch.tone;
  if (patch.persona !== undefined) row.noa_persona = patch.persona;
  if (patch.length !== undefined) row.noa_length = patch.length;
  if (Object.keys(row).length === 0) return { ok: true };

  const { error } = await supabase
    .from("profiles")
    .update(row)
    .eq("user_id", user.id);

  if (error) {
    // Lo más probable: la migración 20260806_noa_personality.sql sin aplicar.
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// —— Uso ————————————————————————————————————————————————————————

export interface NoaUsage {
  /** Herramientas ejecutadas hoy. null = la auditoría aún no está migrada. */
  hoy: number | null;
  /** Herramientas ejecutadas en los últimos 7 días. */
  semana: number | null;
}

/**
 * Cuánto ha usado NOA el usuario, leído de la auditoría.
 *
 * Cuenta EJECUCIONES DE HERRAMIENTAS, no peticiones a Gemini: son cosas
 * distintas y un turno puede gastar varias llamadas al modelo. Google no expone
 * el consumo de una clave, así que esto es lo más cercano y honesto que se
 * puede enseñar sin inventar un número.
 */
export async function getNoaUsage(): Promise<NoaUsage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { hoy: null, semana: null };

  const ahora = new Date();
  const inicioHoy = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    ahora.getDate(),
  ).toISOString();
  const hace7 = new Date(ahora.getTime() - 7 * 86400_000).toISOString();

  const [hoy, semana] = await Promise.all([
    supabase
      .from("noa_tool_calls")
      .select("id", { count: "exact", head: true })
      .gte("created_at", inicioHoy),
    supabase
      .from("noa_tool_calls")
      .select("id", { count: "exact", head: true })
      .gte("created_at", hace7),
  ]);

  // Tabla sin migrar u otro fallo: se devuelve null y la UI no enseña la
  // sección, en vez de un cero que parecería un dato real.
  if (hoy.error || semana.error) return { hoy: null, semana: null };
  return { hoy: hoy.count ?? 0, semana: semana.count ?? 0 };
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
