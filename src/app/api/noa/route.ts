import type { NextRequest } from "next/server";
import {
  rateLimit,
  requireUser,
  tooManyRequests,
  unauthorized,
} from "@/lib/api/guard";
import { runNoa, runNoaConfirm } from "@/lib/noa/engine";
import { GeminiError } from "@/lib/noa/gemini/client";
import type { NoaResponse, NoaTurn } from "@/lib/noa/types";

/**
 * Endpoint de NOA. Guard igual que el resto de /api: exige sesión y limita por
 * usuario. Toda la orquestación (intent, tools, Gemini, acciones) vive en el
 * engine; aquí solo se valida la entrada y se delega.
 */

/**
 * Un turno que planifica una semana encadena varias llamadas a Gemini y puede
 * pasar de 30 s. El límite por defecto de la plataforma es bastante menor, y al
 * cortarse el usuario solo veía "no he podido responder".
 */
export const maxDuration = 60;
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
    try {
      const response = await runNoaConfirm({
        userId,
        toolName,
        args: args && typeof args === "object" ? (args as Record<string, unknown>) : {},
      });
      return Response.json(response);
    } catch (err) {
      return Response.json(errorResponse(err, "confirm"));
    }
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "message_required" }, { status: 400 });
  }

  try {
    const response = await runNoa({
      userId,
      message: message.trim(),
      history: sanitizeHistory(history),
    });
    return Response.json(response);
  } catch (err) {
    return Response.json(errorResponse(err, "turno"));
  }
}

/**
 * Convierte un fallo del engine en una respuesta NORMAL del chat.
 *
 * Antes no había try/catch: cualquier excepción salía como 500 opaco y el chat
 * mostraba un "no he podido responder" idéntico para un timeout, una cuota
 * agotada o una clave inválida. Aquí se traduce a algo accionable, se responde
 * 200 (la conversación sigue viva) y el detalle queda en el log del servidor.
 */
function errorResponse(err: unknown, fase: string): NoaResponse {
  console.error(`[noa] fallo en ${fase}:`, err);

  let reply =
    "Me he encontrado un problema al procesar esto. Vuelve a intentarlo en un momento.";
  if (err instanceof GeminiError) {
    if (err.status === 504) {
      reply =
        "La respuesta ha tardado demasiado. Si me pedías un plan largo, prueba a pedirme menos días de una vez.";
    } else if (err.status === 429) {
      reply =
        "Has llegado al límite de peticiones de tu clave de Gemini. Espera un poco y volvemos.";
    } else if (err.status === 400 || err.status === 403) {
      reply =
        "Tu clave de Gemini no ha sido aceptada. Revísala en Ajustes > NOA.";
    } else {
      reply = "Gemini no está respondiendo ahora mismo. Inténtalo en un minuto.";
    }
  }

  return {
    reply,
    actions: [],
    pending: [],
    meta: { modules: [], usedTools: [], iterations: 0 },
  };
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
