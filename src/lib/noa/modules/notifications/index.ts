import "server-only";
import type { ToolDef, ToolModule } from "@/lib/noa/types";

/**
 * Módulo NOTIFICATIONS — recordatorios locales que programa NOA.
 *
 * Todo es `client-action`: la notificación la programa el SISTEMA OPERATIVO
 * del móvil (Capacitor), no el servidor. Aquí solo se traduce la intención a
 * una acción tipada que ejecuta la app.
 *
 * Solo funcionan en la app instalada. En web el dispatcher avisa de que no se
 * ha programado nada, en vez de dejar al usuario esperando un aviso que nunca
 * va a sonar.
 */

const scheduleReminder: ToolDef = {
  name: "scheduleReminder",
  description:
    "Programa un recordatorio en el móvil del usuario para un momento futuro (p.ej. «avísame mañana a las 8 de tomar proteína»). La fecha va en ISO 8601 con la hora local del usuario. Elige un id corto y descriptivo para poder cancelarlo después.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Identificador del recordatorio (p.ej. «proteina-manana»).",
      },
      title: { type: "string", description: "Título del aviso (corto)." },
      body: { type: "string", description: "Texto del aviso." },
      atISO: {
        type: "string",
        description: "Cuándo debe saltar, en ISO 8601 (p.ej. 2026-08-08T08:00:00).",
      },
    },
    required: ["id", "title", "body", "atISO"],
  },
  module: "notifications",
  kind: "client-action",
  sensitivity: "confirm",
  summarize(args) {
    const cuando = formatWhen(args.atISO);
    return `Programar un aviso${cuando ? ` para ${cuando}` : ""}: «${args.title}».`;
  },
  toAction(args) {
    return {
      type: "scheduleLocalNotification",
      id: String(args.id ?? ""),
      title: String(args.title ?? "Recordatorio"),
      body: String(args.body ?? ""),
      atISO: String(args.atISO ?? ""),
    };
  },
};

const cancelReminder: ToolDef = {
  name: "cancelReminder",
  description:
    "Cancela un recordatorio que se programó antes, por su id.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Id del recordatorio a cancelar." },
    },
    required: ["id"],
  },
  module: "notifications",
  kind: "client-action",
  // Cancelar no destruye datos y es trivial de rehacer: no merece una
  // confirmación que solo añadiría fricción.
  sensitivity: "safe",
  toAction(args) {
    return { type: "cancelLocalNotification", id: String(args.id ?? "") };
  },
};

export const notificationsModule: ToolModule = {
  id: "notifications",
  tools: [scheduleReminder, cancelReminder],
  intentKeywords: [
    "recordatorio",
    "recuerdame",
    "recuérdame",
    "avisame",
    "avísame",
    "alarma",
    "aviso",
    "notificame",
    "notifícame",
  ],
};

/** Fecha legible para la tarjeta de confirmación; null si el ISO no es válido. */
function formatWhen(value: unknown): string | null {
  const d = new Date(String(value ?? ""));
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
