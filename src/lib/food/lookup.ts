"use client";

import type { FoodProduct } from "@/lib/food/types";

/** Unica via del cliente para resolver un codigo de barras.
 *
 *  Pasa por `/api/food/[barcode]`, que exige sesion, limita las peticiones por
 *  usuario y pide a Open Food Facts solo los campos que usamos. Antes cada
 *  pantalla hacia `fetch` directo a OFF: sin limite, sin User-Agent (OFF puede
 *  bloquear la IP y dejarnos sin escaner) y descargando el producto entero. */

export type LookupFailure =
  | "not_found"
  | "rate_limited"
  | "unauthorized"
  | "unavailable"
  | "network";

export type LookupResult =
  | { ok: true; product: FoodProduct }
  | { ok: false; reason: LookupFailure };

const MESSAGES: Record<LookupFailure, string> = {
  not_found: "Este producto no está en Open Food Facts. Puedes crearlo a mano.",
  rate_limited: "Demasiados escaneos seguidos. Espera un momento.",
  unauthorized: "Tu sesión ha caducado. Vuelve a entrar.",
  // No decir "no existe": el producto puede estar y ser OFF quien falla.
  unavailable: "Open Food Facts no responde ahora mismo. Prueba otra vez en unos segundos.",
  network: "No se pudo consultar el código de barras.",
};

export function lookupErrorMessage(reason: LookupFailure): string {
  return MESSAGES[reason];
}

export async function lookupBarcode(barcode: string): Promise<LookupResult> {
  const clean = barcode.replace(/\D/g, "");
  if (clean.length < 6) return { ok: false, reason: "not_found" };

  let res: Response;
  try {
    res = await fetch(`/api/food/${clean}`);
  } catch {
    return { ok: false, reason: "network" };
  }

  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 401) return { ok: false, reason: "unauthorized" };
  if (res.status === 503) return { ok: false, reason: "unavailable" };
  if (!res.ok) return { ok: false, reason: "network" };

  try {
    const data = (await res.json()) as { product?: FoodProduct };
    if (!data.product) return { ok: false, reason: "not_found" };
    return { ok: true, product: data.product };
  } catch {
    return { ok: false, reason: "network" };
  }
}
