import { Capacitor, registerPlugin } from "@capacitor/core";

// Abstraccion de seguimiento GPS con dos implementaciones:
//  - NATIVO (Capacitor): @capacitor-community/background-geolocation, que sigue
//    grabando con la app en segundo plano o la pantalla apagada (mantiene un
//    servicio en primer plano con notificacion). Es lo que la web no puede dar.
//  - WEB/PWA: navigator.geolocation.watchPosition (solo en primer plano).
// El resto de la app (cardio-store) usa esta interfaz sin saber cual corre.
//
// IMPORTANTE: los tipos del plugin se definen AQUI, no se importan del paquete.
// Ese paquete no trae JS (solo tipos + codigo nativo), asi que cualquier import
// desde el rompe el bundle web de Turbopack. En nativo, registerPlugin enruta
// las llamadas al codigo nativo via el puente de Capacitor por su nombre.

type BgLocation = {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  time?: number | null;
};
// El plugin nativo pone code = "NOT_AUTHORIZED" cuando le falta el permiso de
// ubicacion (denegado, o solo "mientras se usa" cuando hace falta background).
type BgError = { code?: string; message?: string };
// Estados que devuelve la API de permisos de Capacitor.
type PermissionState =
  | "prompt"
  | "prompt-with-rationale"
  | "granted"
  | "denied";
interface BgGeoPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (position?: BgLocation, error?: BgError) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  // checkPermissions/requestPermissions los genera Capacitor para cualquier
  // plugin que declare @Permission. El alias "location" del plugin agrupa
  // ACCESS_*_LOCATION y (por el patch de este repo) POST_NOTIFICATIONS, asi
  // que una sola solicitud cubre ubicacion + notificacion del servicio.
  checkPermissions(): Promise<{ location: PermissionState }>;
  requestPermissions(): Promise<{ location: PermissionState }>;
  // Abre los ajustes de la app (para conceder "Permitir todo el tiempo", que el
  // sistema no ofrece desde el dialogo in-app en Android 10+).
  openSettings(): Promise<void>;
}

const BackgroundGeolocation =
  registerPlugin<BgGeoPlugin>("BackgroundGeolocation");

/**
 * Pide los permisos de ubicacion (y notificacion en Android 13+) ANTES de
 * arrancar el watcher, y espera a que el usuario responda.
 *
 * Es lo que evita el bug del primer arranque: si `addWatcher` fuera quien
 * pidiese el permiso (requestPermissions: true), el dialogo del sistema manda
 * la app a segundo plano y el foreground service falla al promoverse — la
 * grabacion en background no arranca hasta pausar/reanudar (que vuelve a llamar
 * a addWatcher con los permisos ya concedidos). Solicitandolos aqui primero, el
 * addWatcher posterior corre con la app en primer plano y los permisos ya dados,
 * y el servicio arranca a la primera.
 *
 * Devuelve true si quedaron concedidos. En web no aplica (navigator.geolocation
 * pide permiso al usarse), asi que resuelve true sin hacer nada.
 */
export async function ensureGeoPermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    let status = await BackgroundGeolocation.checkPermissions();
    if (status.location !== "granted") {
      status = await BackgroundGeolocation.requestPermissions();
    }
    return status.location === "granted";
  } catch {
    // Version del plugin sin API de permisos: dejamos que addWatcher los pida
    // (comportamiento anterior); no bloqueamos el arranque.
    return true;
  }
}

/**
 * Abre los ajustes del sistema para esta app, donde el usuario puede conceder
 * "Permitir todo el tiempo". Solo tiene efecto en nativo; en web no hay nada
 * que abrir (el navegador gestiona el permiso). No lanza.
 */
export async function openLocationSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await BackgroundGeolocation.openSettings();
  } catch {
    /* si el plugin no lo soporta, no hay accion posible */
  }
}

export type GeoPosition = { lat: number; lng: number; alt?: number; timestamp: number };
export type GeoError = {
  code?: number;
  message: string;
  /** El permiso de ubicacion falta o es insuficiente: conviene ofrecer ajustes. */
  permissionDenied?: boolean;
};
export type StopWatch = () => void;

/** Arranca el seguimiento. Devuelve una funcion para detenerlo. */
export async function startGeoWatch(
  onPosition: (p: GeoPosition) => void,
  onError: (e: GeoError) => void,
): Promise<StopWatch> {
  if (Capacitor.isNativePlatform()) {
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "Grabando tu ruta de cardio.",
        backgroundTitle: "Rogue · cardio en marcha",
        requestPermissions: true,
        // No entregar posiciones "viejas" cacheadas al arrancar.
        stale: false,
        // Metros minimos entre lecturas: reduce ruido y bateria.
        distanceFilter: 5,
      },
      (location, error) => {
        if (error) {
          onError({
            message: error.message ?? "No se pudo acceder al GPS.",
            permissionDenied: error.code === "NOT_AUTHORIZED",
          });
          return;
        }
        if (location) {
          onPosition({
            lat: location.latitude,
            lng: location.longitude,
            alt: location.altitude ?? undefined,
            timestamp: location.time ?? Date.now(),
          });
        }
      },
    );
    return () => {
      BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
    };
  }

  // --- Web / PWA ---
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError({ message: "Este dispositivo no soporta geolocalizacion." });
    return () => {};
  }
  const wid = navigator.geolocation.watchPosition(
    (pos) =>
      onPosition({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        alt: pos.coords.altitude ?? undefined,
        timestamp: pos.timestamp,
      }),
    (err) =>
      onError({
        code: err.code,
        message: err.message,
        permissionDenied: err.code === 1, // PERMISSION_DENIED
      }),
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 },
  );
  return () => navigator.geolocation.clearWatch(wid);
}
