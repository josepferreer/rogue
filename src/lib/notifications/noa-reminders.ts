import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * Recordatorios que programa NOA ("avísame mañana a las 8 de desayunar").
 *
 * Aparte del aviso de descanso (`rest-notifier.ts`), que tiene un id fijo y un
 * canal propio: estos son arbitrarios en número y momento, así que llevan su
 * propio canal y un id derivado del que da NOA.
 *
 * Solo funcionan en nativo. En web no hay forma fiable de programar sin push,
 * y prefiero no prometer un aviso que no va a sonar: por eso `schedule`
 * devuelve si pudo o no, y NOA lo dice en vez de callarse.
 */

const CHANNEL_ID = "rogue-noa";

const isNative = () => Capacitor.isNativePlatform();

/** Id numérico estable a partir del id de texto que manda NOA. */
function numericId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  // Rango positivo y fuera del que usa el aviso de descanso (1001).
  return 2000 + (Math.abs(hash) % 1_000_000);
}

async function ensureChannel(): Promise<void> {
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== "granted") {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== "granted") throw new Error("sin permiso");
    }
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Recordatorios de NOA",
      description: "Avisos que programa tu asistente",
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch {
    throw new Error("sin permiso de notificaciones");
  }
}

/**
 * ¿Puede el sistema disparar la alarma a la hora EXACTA?
 *
 * En Android 12+ hace falta que el usuario conceda SCHEDULE_EXACT_ALARM desde
 * Ajustes. Sin él la notificación llega igual, pero Android la agrupa con otras
 * para ahorrar batería y puede retrasarse 10-15 min con el móvil en reposo, que
 * es justo lo que rompe un "avísame en 5 minutos".
 */
export async function canScheduleExact(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
    return exact_alarm === "granted";
  } catch {
    // Android < 12 no tiene el concepto: allí las alarmas ya son exactas.
    return true;
  }
}

/**
 * Abre la pantalla de Ajustes donde se concede el permiso de alarmas exactas.
 *
 * OJO: al volver, Android REINICIA la app y borra las notificaciones ya
 * programadas con alarma exacta (documentado en el plugin). Por eso no se llama
 * sola al programar un aviso: sería reiniciar la app a mitad de conversación.
 * Solo se invoca si el usuario lo pide explícitamente.
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    // Si la pantalla no existe (Android < 12) no hay nada que ajustar.
  }
}

export type ScheduleResult =
  | { ok: true; exact: boolean }
  | { ok: false; reason: "web" | "pasado" | "sin-permiso" };

/**
 * Programa un recordatorio.
 *
 * Devuelve `exact: false` cuando el aviso quedó programado pero SIN alarma
 * exacta: se programa igualmente (mejor tarde que nunca) y quien llama decide
 * si avisar al usuario de que puede retrasarse.
 */
export async function scheduleNoaReminder(
  id: string,
  title: string,
  body: string,
  atISO: string,
): Promise<ScheduleResult> {
  if (!isNative()) return { ok: false, reason: "web" };
  const at = new Date(atISO);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) {
    return { ok: false, reason: "pasado" };
  }

  try {
    await ensureChannel();
    const exact = await canScheduleExact();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: numericId(id),
          title,
          body,
          channelId: CHANNEL_ID,
          schedule: { at, allowWhileIdle: true },
        },
      ],
    });
    return { ok: true, exact };
  } catch {
    return { ok: false, reason: "sin-permiso" };
  }
}

export async function cancelNoaReminder(id: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: numericId(id) }] });
    return true;
  } catch {
    return false;
  }
}
