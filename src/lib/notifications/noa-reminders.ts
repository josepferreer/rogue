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

/** Programa un recordatorio. Devuelve false si no se pudo (web o sin permiso). */
export async function scheduleNoaReminder(
  id: string,
  title: string,
  body: string,
  atISO: string,
): Promise<boolean> {
  if (!isNative()) return false;
  const at = new Date(atISO);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) return false;

  try {
    await ensureChannel();
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
    return true;
  } catch {
    return false;
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
