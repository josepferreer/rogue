import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

// Aviso de "fin de descanso" con dos implementaciones, igual que geo-tracker:
//  - NATIVO (Capacitor): @capacitor/local-notifications. Dispara una
//    notificacion del sistema real aunque la app este en 2.o plano o la
//    pantalla bloqueada. Es lo que el WebView de Android NO da via la
//    Web Notification API (ahi `Notification` ni existe).
//  - WEB/PWA: Web Notification API, solo cuando la pestana no esta visible.
// El store llama a esta interfaz sin saber cual corre debajo.

const REST_END_NOTIFICATION_ID = 1001;

/** Pide permiso de notificacion. Llamar desde un gesto de usuario (ej. start). */
export async function requestNotifyPermission(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== "granted") {
        await LocalNotifications.requestPermissions();
      }
    } catch {
      // Silencioso: si falla, el aviso simplemente no saldra.
    }
    return;
  }

  // --- Web / PWA ---
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }
}

/** Lanza el aviso de fin de descanso. Inmediato. */
export async function fireRestEndNotification(): Promise<void> {
  const title = "Descanso terminado";
  const body = "Toca para seguir con la siguiente serie.";

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: REST_END_NOTIFICATION_ID,
            title,
            body,
            // Sin `schedule.at`: se muestra de inmediato.
          },
        ],
      });
    } catch {
      // Silencioso.
    }
    return;
  }

  // --- Web / PWA: solo si la pestana no esta visible. ---
  if (
    typeof document !== "undefined" &&
    document.hidden &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    new Notification(title, {
      body,
      icon: "/icon-192.png",
      tag: "rogue-rest-end",
    });
  }
}
