import type { NextRequest } from "next/server";
import {
  rateLimit,
  requireUser,
  tooManyRequests,
  unauthorized,
} from "@/lib/api/guard";
import { runNoa, runNoaConfirm } from "@/lib/noa/engine";
import type { NoaTurn } from "@/lib/noa/types";

/**
 * Endpoint de NOA. Guard igual que el resto de /api: exige sesión y limita por
 * usuario. Toda la orquestación (intent, tools, Gemini, acciones) vive en el
 * engine; aquí solo se valida la entrada y se delega.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  // Cada turno gasta al menos una llamada a Gemini: límite prudente por usuario.
  if (!rateLimit(`noa:${userId}`, 30, 60_000)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const { message, history, confirm } = (body ?? {}) as {
    message?: unknown;
    history?: unknown;
    confirm?: unknown;
  };

  // Rama de confirmación: el usuario aceptó una acción propuesta (Action Gate).
  if (confirm && typeof confirm === "object") {
    const { toolName, args } = confirm as { toolName?: unknown; args?: unknown };
    if (typeof toolName !== "string" || toolName.length === 0) {
      return Response.json({ error: "toolName_required" }, { status: 400 });
    }
    const response = await runNoaConfirm({
      userId,
      toolName,
      args: args && typeof args === "object" ? (args as Record<string, unknown>) : {},
    });
    return Response.json(response);
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "message_required" }, { status: 400 });
  }

  const response = await runNoa({
    userId,
    message: message.trim(),
    history: sanitizeHistory(history),
  });

  return Response.json(response);
}

/** Acepta solo turnos con la forma esperada; descarta el resto. */
function sanitizeHistory(raw: unknown): NoaTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: NoaTurn[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      (item as NoaTurn).role &&
      typeof (item as NoaTurn).content === "string"
    ) {
      const role = (item as NoaTurn).role;
      if (role === "user" || role === "assistant") {
        out.push({ role, content: (item as NoaTurn).content });
      }
    }
  }
  // Ventana corta: los últimos turnos bastan y acotan el coste.
  return out.slice(-12);
}
