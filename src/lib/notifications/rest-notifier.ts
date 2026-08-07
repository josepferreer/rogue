import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

// Aviso de "fin de descanso" con dos implementaciones, igual que geo-tracker:
//
//  - NATIVO (Capacitor): la notificacion se PROGRAMA en el sistema operativo
//    para el instante en que acaba el descanso. Es la unica forma de que suene
//    con la pantalla bloqueada: Android congela los timers de JavaScript de un
//    WebView en 2.o plano, asi que la version anterior --que esperaba a que un
//    setInterval detectase el fin y solo entonces lanzaba la notificacion-- no
//    disparaba nunca en el caso de uso real (el movil en el bolsillo entre
//    series). Llegaba tarde, al desbloquear, o no llegaba.
//
//  - WEB/PWA: no hay forma fiable de programar sin service worker con push, asi
//    que se mantiene el aviso inmediato desde el temporizador de la pagina,
//    solo cuando la pestana no esta visible.
//
// El store llama a esta interfaz sin saber cual corre debajo.

const REST_END_NOTIFICATION_ID = 1001;
const REST_CHANNEL_ID = "rogue-rest";

const isNative = () => Capacitor.isNativePlatform();

/** Pide permiso de notificacion. Llamar desde un gesto de usuario (ej. start). */
export async function requestNotifyPermission(): Promise<void> {
  if (isNative()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== "granted") {
        await LocalNotifications.requestPermissions();
      }
      // Android 8+: sin un canal propio la notificacion cae en el canal por
      // defecto, que puede estar silenciado y no vibra. Importancia alta para
      // que suene con la pantalla apagada.
      await LocalNotifications.createChannel({
        id: REST_CHANNEL_ID,
        name: "Descansos",
        description: "Aviso al terminar el descanso entre series",
        importance: 5,
        visibility: 1,
        vibration: true,
      });
    } catch {
      // Silencioso: si falla, el aviso simplemente no saldra.
    }
    return;
  }

  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }
}

const TITLE = "Descanso terminado";
const BODY = "Toca para seguir con la siguiente serie.";

/**
 * Programa el aviso para `at` (timestamp en ms). Reemplaza cualquier aviso
 * pendiente: el id es fijo, asi que reprogramar tras un +15/-15 s no acumula
 * notificaciones. En web no hace nada (lo cubre notifyRestEndNow).
 */
export async function scheduleRestEndNotification(at: number): Promise<void> {
  if (!isNative()) return;
  // Ya vencido: no tiene sentido programarlo en el pasado.
  if (at <= Date.now()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: REST_END_NOTIFICATION_ID }],
    });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_END_NOTIFICATION_ID,
          title: TITLE,
          body: BODY,
          channelId: REST_CHANNEL_ID,
          schedule: { at: new Date(at), allowWhileIdle: true },
        },
      ],
    });
  } catch {
    // Silencioso.
  }
}

/** Cancela el aviso pendiente (saltar descanso, finalizar o descartar entreno). */
export async function cancelRestEndNotification(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: REST_END_NOTIFICATION_ID }],
    });
  } catch {
    // Silencioso.
  }
}

/**
 * Aviso inmediato en el momento en que el temporizador de la pagina detecta el
 * fin del descanso. En nativo NO lanza notificacion --ya la programo el sistema
 * en scheduleRestEndNotification, lanzarla aqui la duplicaria-- pero si vibra,
 * que es lo que se espera con la app en primer plano.
 */
export function notifyRestEndNow(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }

  if (isNative()) return;

  // --- Web / PWA: solo si la pestana no esta visible. ---
  if (
    typeof document !== "undefined" &&
    document.hidden &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    new Notification(TITLE, {
      body: BODY,
      icon: "/icon-192.png",
      tag: "rogue-rest-end",
    });
  }
}
