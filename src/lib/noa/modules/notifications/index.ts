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

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Fecha legible para la tarjeta de confirmación; null si el ISO no es válido.
 *
 * Se leen los campos TAL Y COMO VIENEN ESCRITOS en el ISO, sin convertir nada.
 *
 * Antes esto hacía `new Date(iso).toLocaleString("es-ES", …)` sin indicar zona,
 * y el servidor corre en UTC: un aviso para las 12:37 del usuario aparecía en la
 * tarjeta como «10:37». La hora del aviso era correcta --el `atISO` sí lleva el
 * offset del usuario-- pero el texto que se le enseñaba para decidir mentía dos
 * horas, que es peor que fallar del todo: se confirma creyendo otra cosa.
 *
 * El ISO ya viene en la hora local de quien pregunta, así que renderizarlo
 * literal es exactamente lo que hay que hacer.
 */
function formatWhen(value: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value ?? ""));
  if (!m) return null;
  const [, año, mes, dia, hora, minuto] = m;
  const mesIdx = Number(mes) - 1;
  if (mesIdx < 0 || mesIdx > 11) return null;

  // El día de la semana sí se calcula, pero en UTC sobre la fecha de calendario:
  // el día de la semana de un 28 de agosto es el mismo en cualquier huso.
  const soloFecha = new Date(Date.UTC(Number(año), mesIdx, Number(dia)));
  if (!Number.isFinite(soloFecha.getTime())) return null;

  return `${DIAS[soloFecha.getUTCDay()]}, ${Number(dia)} ${MESES[mesIdx]}, ${hora}:${minuto}`;
}
