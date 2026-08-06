import "server-only";
import type {
  NoaClientAction,
  NoaProposedAction,
  NoaToolContext,
  ToolDef,
} from "@/lib/noa/types";
import { buildProposal, needsConfirmation } from "@/lib/noa/action-gate";
import { logToolCall } from "@/lib/noa/audit";

/**
 * Tool Executor — ejecuta UNA llamada a tool ya resuelta.
 *
 *   read / write safe   → corre el handler en servidor (bajo RLS) → resultado.
 *   client-action safe  → traduce a acción tipada para el móvil.
 *   * / confirm         → NO ejecuta: devuelve una propuesta para el Action Gate.
 *
 * Nota: las escrituras se ejecutan aquí server-side bajo la RLS del usuario.
 * Para escrituras críticas en offline, más adelante pueden emitirse como
 * `SyncOp` hacia la cola persistente del cliente (idempotente, sobrevive a
 * recargas). El punto de decisión es este; no hay que tocar el resto.
 */
export type ExecOutcome =
  | { status: "result"; value: unknown }
  | { status: "action"; action: NoaClientAction }
  | { status: "pending"; proposal: NoaProposedAction }
  | { status: "error"; message: string };

export async function executeTool(
  tool: ToolDef,
  args: Record<string, unknown>,
  ctx: NoaToolContext,
): Promise<ExecOutcome> {
  // Action Gate: lo que requiere confirmación no se ejecuta todavía.
  if (needsConfirmation(tool)) {
    logToolCall({
      userId: ctx.userId,
      module: tool.module,
      tool: tool.name,
      args,
      outcome: "pending_confirmation",
    });
    return { status: "pending", proposal: buildProposal(tool, args) };
  }

  return runTool(tool, args, ctx);
}

/**
 * Ejecuta la tool SIN pasar por el gate. Lo usa el camino de confirmación:
 * el usuario ya dijo "sí", así que un write con `confirm` se ejecuta aquí.
 */
export async function runTool(
  tool: ToolDef,
  args: Record<string, unknown>,
  ctx: NoaToolContext,
): Promise<ExecOutcome> {
  const started = Date.now();
  try {
    if (tool.kind === "client-action") {
      if (!tool.toAction) throw new Error(`"${tool.name}" no define toAction`);
      const action = tool.toAction(args);
      logToolCall({
        userId: ctx.userId,
        module: tool.module,
        tool: tool.name,
        args,
        outcome: "ok",
        ms: Date.now() - started,
      });
      return { status: "action", action };
    }

    // read / write safe
    if (!tool.handler) throw new Error(`"${tool.name}" no define handler`);
    const value = await tool.handler(args, ctx);
    logToolCall({
      userId: ctx.userId,
      module: tool.module,
      tool: tool.name,
      args,
      outcome: "ok",
      ms: Date.now() - started,
    });
    return { status: "result", value };
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    logToolCall({
      userId: ctx.userId,
      module: tool.module,
      tool: tool.name,
      args,
      outcome: "error",
      ms: Date.now() - started,
      error: message,
    });
    return { status: "error", message };
  }
}
