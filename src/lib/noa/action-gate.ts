/**
 * Action Gate — decide si una tool se ejecuta al vuelo o requiere confirmación.
 *
 *   - `read`                          → autoejecuta (nunca pasa por aquí).
 *   - `write` / `client-action` safe  → autoejecuta.
 *   - `write` / `client-action` confirm → se propone al usuario y espera "sí".
 *
 * Las escrituras confirmadas se ejecutan por la cola persistente (`SyncOp`),
 * heredando idempotencia y supervivencia a recargas.
 */
import type { NoaProposedAction, ToolDef } from "@/lib/noa/types";

export function needsConfirmation(tool: ToolDef): boolean {
  if (tool.kind === "read") return false;
  return tool.sensitivity === "confirm";
}

let counter = 0;
function proposalId(): string {
  counter += 1;
  return `noa-act-${Date.now().toString(36)}-${counter}`;
}

/**
 * Construye la propuesta que verá el usuario. El resumen por defecto sale de la
 * descripción de la tool; un módulo puede afinarlo más adelante.
 */
export function buildProposal(
  tool: ToolDef,
  args: Record<string, unknown>,
): NoaProposedAction {
  return {
    id: proposalId(),
    toolName: tool.name,
    summary: tool.summarize ? tool.summarize(args) : tool.description,
    args,
    action: tool.toAction ? tool.toAction(args) : undefined,
  };
}
