import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoaModule } from "@/lib/noa/types";

/**
 * Registro de auditoría de llamadas a tools (quién / qué / cuándo / resultado).
 *
 * Va a la tabla `noa_tool_calls` (migración `20260807_noa_audit.sql`), que es
 * de solo inserción y lectura: NOA escribe en los datos del usuario, y sin un
 * rastro duradero no hay forma de reconstruir qué hizo. Además se sigue
 * volcando a la consola del servidor, que es lo útil mientras se desarrolla.
 *
 * Escribir en la auditoría NUNCA puede tumbar la llamada a la herramienta: si
 * falla (tabla sin migrar, red), se avisa por consola y se sigue.
 *
 * NUNCA registra la key de Gemini del usuario (ni llega hasta aquí) ni valores
 * sensibles: `redact` recorta y enmascara los args.
 */

const SENSITIVE_KEYS = /(key|token|secret|password|apikey|authorization)/i;

/** Enmascara claves sospechosas y trunca strings largas de los argumentos. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "…";
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "«redacted»" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface ToolCallAudit {
  userId: string;
  module: NoaModule;
  tool: string;
  args: Record<string, unknown>;
  outcome: "ok" | "error" | "pending_confirmation" | "rejected";
  ms?: number;
  error?: string;
}

export function logToolCall(entry: ToolCallAudit, supabase?: SupabaseClient): void {
  const args = redact(entry.args);

  // Se serializa a string a propósito: el logger de dev de Next colapsa los
  // objetos anidados a "{}", y así se pierden los args que hacen falta para
  // depurar (p.ej. los weekdays de saveRoutine).
  const payload = JSON.stringify({
    tool: entry.tool,
    module: entry.module,
    outcome: entry.outcome,
    ms: entry.ms,
    args,
    ...(entry.error ? { error: entry.error } : {}),
  });
  console.info(`[noa:tool] ${payload}`);

  if (!supabase) return;
  // Sin await: la auditoría no debe añadir latencia a la respuesta ni romperla.
  void supabase
    .from("noa_tool_calls")
    .insert({
      user_id: entry.userId,
      module: entry.module,
      tool: entry.tool,
      outcome: entry.outcome,
      args,
      duration_ms: entry.ms ?? null,
      error: entry.error ?? null,
    })
    .then(({ error }) => {
      if (error) {
        console.warn("[noa:audit] no se pudo registrar la llamada:", error.message);
      }
    });
}
