import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBearerClient, createClient } from "@/lib/supabase/server";

/**
 * Proteccion de las rutas /api que actuan como proxy hacia servicios externos
 * (hoy solo Open Food Facts). Sin esto son proxies ABIERTOS: cualquiera puede
 * pegarles desde fuera, consumir la cuota de Vercel y hablar con esos servicios
 * bajo nuestra identidad (el User-Agent lleva un email de contacto).
 *
 * - requireCaller(): exige sesion valida, por cookies o por Bearer.
 * - rateLimit(): limite por usuario, best-effort.
 */

/** Quien llama, ya resuelto: su id y el cliente con el que consultar por el. */
export type Llamante = { userId: string; supabase: SupabaseClient };

/**
 * Resuelve quien llama por CUALQUIERA de las dos vias.
 *
 * Cookies para el navegador; `Authorization: Bearer <token>` para todo lo que
 * no las tenga --hoy, la app movil--. Se devuelve tambien el cliente, y no solo
 * el id, porque el cliente TIENE que ser el mismo con el que se comprobo la
 * identidad: es el que arrastra el token, y por tanto el que hace que la RLS de
 * Supabase se aplique a nombre de esa persona.
 *
 * El Bearer se mira primero. Si alguien manda las dos cosas, manda la cabecera:
 * es la explicita.
 */
export async function requireCaller(req: Request): Promise<Llamante | null> {
  const cabecera = req.headers.get("authorization") ?? "";
  const token = cabecera.toLowerCase().startsWith("bearer ")
    ? cabecera.slice(7).trim()
    : "";

  if (token) {
    const supabase = createBearerClient(token);
    // Se valida contra Supabase, no descodificando el JWT aqui: comprobar la
    // firma a mano es justo el sitio donde se cuelan los fallos, y ademas asi
    // un token revocado deja de valer al momento.
    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    return user ? { userId: user.id, supabase } : null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { userId: user.id, supabase } : null;
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
