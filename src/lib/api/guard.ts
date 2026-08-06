import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Proteccion de las rutas /api que actuan como proxy hacia servicios externos
 * (hoy solo Open Food Facts). Sin esto son proxies ABIERTOS: cualquiera puede
 * pegarles desde fuera, consumir la cuota de Vercel y hablar con esos servicios
 * bajo nuestra identidad (el User-Agent lleva un email de contacto).
 *
 * - requireUser(): exige sesion de Supabase valida.
 * - rateLimit(): limite por usuario, best-effort.
 */

/** Devuelve el id del usuario autenticado, o null si no hay sesion. */
export async function requireUser(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type Bucket = { count: number; resetAt: number };

/**
 * Contador en memoria del proceso. En serverless cada instancia tiene el suyo,
 * asi que NO es un limite global exacto: es un freno barato contra el abuso
 * evidente (bucles, scraping). Para un limite estricto haria falta almacen
 * compartido (Redis/Upstash o una tabla en Postgres).
 */
const buckets = new Map<string, Bucket>();

/** Purga entradas caducadas para que el Map no crezca sin limite. */
function sweep(now: number) {
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * true si la peticion pasa el limite; false si hay que responder 429.
 * `key` deberia identificar al usuario (id) y la ruta.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 500) sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

/** Respuestas estandar de los guards. */
export const unauthorized = () =>
  Response.json({ error: "unauthorized" }, { status: 401 });

export const tooManyRequests = () =>
  Response.json({ error: "rate_limited" }, { status: 429 });
