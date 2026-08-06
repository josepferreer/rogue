import "server-only";
import type { NoaModule } from "@/lib/noa/types";

/**
 * Registro de auditoría de llamadas a tools (quién / qué / cuándo / resultado).
 * De momento va a consola del servidor; el punto de enganche está aislado para
 * mandarlo a una tabla o a un observability sink sin tocar el engine.
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

export function logToolCall(entry: ToolCallAudit): void {
  // TODO: persistir en `noa_audit` cuando exista la tabla.
  // Se serializa a string a propósito: el logger de dev de Next colapsa los
  // objetos anidados a "{}", y así se pierden los args que hacen falta para
  // depurar (p.ej. los weekdays de saveRoutine).
  const payload = JSON.stringify({
    tool: entry.tool,
    module: entry.module,
    outcome: entry.outcome,
    ms: entry.ms,
    args: redact(entry.args),
    ...(entry.error ? { error: entry.error } : {}),
  });
  console.info(`[noa:tool] ${payload}`);
}
