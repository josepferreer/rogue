"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import { syncWrite } from "@/lib/supabase/sync";
import { haversineM } from "@/lib/cardio/clean-trace";
import {
  ensureGeoPermissions,
  openLocationSettings,
  startGeoWatch,
  type StopWatch,
} from "@/lib/cardio/geo-tracker";

// --- Types ---

export type Coordinate = { lat: number; lng: number; alt?: number; timestamp: number };

/**
 * Ruta del historial. `coordinates` es OPCIONAL a proposito: el listado no las
 * trae (son ~130 KB por ruta y solo hacen falta para pintar el mapa), se cargan
 * bajo demanda al abrir el detalle. undefined = "aun no cargadas", [] = "ruta
 * sin puntos".
 */
export type CardioSession = {
  id: string;
  dateISO: string;
  coordinates?: Coordinate[];
  distanceKm: number;
  durationSec: number;
};

export type CardioContextValue = {
  hydrated: boolean;
  isTracking: boolean;
  isPaused: boolean;
  isMinimized: boolean;
  coordinates: Coordinate[];
  /**
   * Ultima posicion conocida. Se actualiza con TODA fijacion que llegue, sin
   * excepcion: es lo que pinta el punto azul, y que el punto siga vivo es como
   * el usuario comprueba que el GPS responde. Nada puede impedir que cambie.
   *
   * Es DISTINTA de `coordinates` a proposito. La traza solo avanza con
   * movimiento real, para que estando quieto no se dibuje la estrella de la
   * deriva del sensor. Confundir las dos cosas fue el fallo: al filtrar los
   * puntos de la traza se filtraba tambien el punto azul, y se quedaba clavado.
   */
  currentPosition: Coordinate | null;
  distanceKm: number;
  durationSec: number;
  history: CardioSession[];
  gpsError: string | null;
  /** El error de GPS es por falta de permiso: la UI ofrece abrir ajustes. */
  gpsNeedsSettings: boolean;
  /** Ruta que se está siguiendo (modo repetir), para pintarla de fondo; vacía
   *  en una ruta libre. */
  followRoute: Coordinate[];
  /** Inicia el tracking. Con `routeId`, la sesión resultante se marca como
   *  seguimiento de esa ruta guardada; con `ghostRoute`, se pinta esa ruta de
   *  fondo para seguirla. */
  startTracking: (routeId?: string, ghostRoute?: Coordinate[]) => void;
  pauseTracking: () => void;
  resumeTracking: () => void;
  /**
   * Cierra la sesion en curso. Con `{ discard: true }` no se guarda nada: ni en
   * el historial local ni en Supabase. Y no basta con "no guardar", porque
   * mientras grabas se van volcando los puntos al servidor cada poco: hay que
   * borrar ademas la fila ya escrita o queda una ruta fantasma en el historial.
   */
  stopTracking: (options?: { discard?: boolean }) => void;
  minimize: () => void;
  maximize: () => void;
  openLocationSettings: () => void;
  /** Borra una ruta del historial (optimista + delete en Supabase). */
  deleteSession: (id: string) => void;
  /** Re-lee el historial desde Supabase. La usa NOA tras borrar una ruta
   *  server-side (canal de refetch), para refrescar la lista sin recargar. */
  reloadHistory: () => Promise<void>;
};

type CardioRow = {
  id: string;
  date: string;
  distance_km: number;
  duration_sec: number;
};

function rowToSession(row: CardioRow): CardioSession {
  return {
    id: row.id,
    dateISO: row.date,
    distanceKm: Number(row.distance_km),
    durationSec: row.duration_sec,
  };
}

type SupabaseClient = ReturnType<typeof createClient>;

async function fetchHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<CardioSession[]> {
  // Paginado con .range() para no toparse con el limite silencioso de 1000
  // filas por respuesta de PostgREST.
  const rows = await fetchAllPages<CardioRow>(async (from, to) => {
    const { data, error } = await supabase
      .from("cardio_sessions")
      // SIN `coordinates`: son ~130 KB por ruta y el listado no las pinta.
      // Se cargan por id al abrir el detalle (fetchCoordinates).
      .select("id, date, distance_km, duration_sec")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as CardioRow[];
  });
  return rows.map(rowToSession);
}

/** Trae la polilinea de una ruta concreta (solo al abrir su detalle). */
export async function fetchCoordinates(
  supabase: SupabaseClient,
  id: string,
): Promise<Coordinate[]> {
  const { data, error } = await supabase
    .from("cardio_sessions")
    .select("coordinates")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return ((data?.coordinates as Coordinate[] | null) ?? []) as Coordinate[];
}

/**
 * Vuelca el progreso de la ruta EN CURSO. Manda solo los puntos nuevos desde el
 * ultimo volcado; el servidor los concatena (ver upsert_cardio_progress).
 * Devuelve cuantos puntos han quedado guardados, para saber por donde seguir.
 */
async function pushCardioProgress(
  supabase: SupabaseClient,
  id: string,
  dateISO: string,
  distanceKm: number,
  durationSec: number,
  storedLen: number,
  newPoints: Coordinate[],
): Promise<number> {
  const { data, error } = await supabase.rpc("upsert_cardio_progress", {
    p_id: id,
    p_date: dateISO,
    p_distance_km: distanceKm,
    p_duration_sec: durationSec,
    p_stored_len: storedLen,
    p_new_points: newPoints,
  });
  if (error) throw error;
  return Number(data ?? storedLen + newPoints.length);
}

// --- Sesion en curso: snapshot para sobrevivir a que el SO mate la PWA ---

const ACTIVE_SNAPSHOT_KEY = "rogue.cardio.active.v1";

type ActiveSnapshot = {
  coordinates: Coordinate[];
  distanceKm: number;
  /** Segundos acumulados hasta la ultima pausa/reanudacion. */
  accumulatedSec: number;
  /** Timestamp (ms) de la ultima reanudacion; null si esta en pausa. */
  runningSince: number | null;
  /** Id de la fila que ya se esta escribiendo en servidor, para que al
   *  recuperar se siga volcando sobre la misma ruta en vez de crear otra. */
  sessionId?: string;
  dateISO?: string;
  /** Puntos ya confirmados en servidor. */
  storedLen?: number;
  /** Ruta que se estaba siguiendo, si la habia. Sin esto, al recuperar la
   *  sesion el seguimiento se degradaba a ruta libre: desaparecia la linea de
   *  referencia y su progreso en verde, y la sesion se guardaba sin `route_id`. */
  followRouteId?: string | null;
  followRoute?: Coordinate[];
};

/** Cada cuanto se vuelca el progreso de la ruta a Supabase. */
const FLUSH_INTERVAL_MS = 30_000;

/**
 * Topes para descartar un salto imposible del GPS (tunel, rebote urbano).
 * (28,8 km/h: mas rapido que cualquier carrera a pie).
 */
const MAX_SPEED_MPS = 8;
/** Salto maximo aceptable cuando no se puede calcular velocidad (dt <= 0). */
const MAX_JUMP_M = 80;
/**
 * Desplazamiento minimo base para que un tramo consolide traza y sume metros.
 * 7 metros evita crear segmentos con el ruido natural estatico.
 */
const MIN_MOVE_M = 7;
/**
 * Precision maxima aceptada (en metros). Cualquier fijacion con radio de error
 * superior a 25 m (torre de telefonia o rebote) se descarta por completo
 * (no mueve el punto azul ni la traza).
 */
const ACC_MAX_M = 25;
/**
 * Umbral de velocidad minimo para considerar desplazamiento fisico humano (1,6 km/h).
 * Por debajo de esto, cualquier variacion de posicion se considera ruido de sensor en reposo.
 */
const MIN_WALK_SPEED_MPS = 0.45;
/** Cada cuanto, como maximo, se reescribe el snapshot local. */
const SNAPSHOT_THROTTLE_MS = 10_000;

function readSnapshot(): ActiveSnapshot | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as ActiveSnapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snap: ActiveSnapshot) {
  try {
    localStorage.setItem(ACTIVE_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    /* sin almacenamiento: la recuperacion no estara disponible */
  }
}

function clearSnapshot() {
  try {
    localStorage.removeItem(ACTIVE_SNAPSHOT_KEY);
  } catch {
    /* nada */
  }
}

// Mensaje segun el codigo de GeolocationPositionError (1/2/3). Los errores del
// plugin nativo no traen codigo: se muestra su propio mensaje.
function gpsErrorMessage(code?: number): string {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return "Sin acceso a tu ubicacion. Activa el permiso de GPS para esta app en los ajustes.";
    case 2: // POSITION_UNAVAILABLE
      return "No se puede obtener tu ubicacion ahora mismo. Comprueba tu senal GPS.";
    case 3: // TIMEOUT
      return "Tardamos demasiado en localizarte. Sal a espacio abierto e intentalo de nuevo.";
    default:
      return "No se pudo acceder al GPS.";
  }
}

// --- Context ---

const CardioContext = createContext<CardioContextValue | null>(null);

// --- Provider ---

export function CardioProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();

  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinate[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  /** Ruta "fantasma" a seguir (modo repetir): la pinta de fondo la pantalla de
   *  tracking. Vacía = ruta libre. */
  const [followRoute, setFollowRoute] = useState<Coordinate[]>([]);
  const [history, setHistory] = useState<CardioSession[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsNeedsSettings, setGpsNeedsSettings] = useState(false);

  const userIdRef = useRef<string | null>(null);

  // Hidrata el historial desde Supabase para el usuario autenticado. Se
  // re-comprueba en cada cambio de ruta porque el login/logout ocurre via
  // Server Actions y este cliente no se entera solo por su cuenta.
  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // No tocar userIdRef si este efecto ya no esta vigente: un efecto
        // abortado no debe "desmarcar" el usuario que un efecto posterior
        // (valido) ya confirmo como autenticado.
        if (!active) return;
        userIdRef.current = null;
        setHistory([]);
        setHydrated(true);
        return;
      }

      // Mismo usuario ya cargado: no repetir la consulta en cada navegacion.
      if (user.id === userIdRef.current) {
        if (active) setHydrated(true);
        return;
      }

      let sessions: CardioSession[];
      try {
        sessions = await fetchHistory(supabase, user.id);
      } catch (err) {
        // El historial queda vacio hasta la proxima navegacion (userIdRef no
        // se fija, asi que se reintentara); no bloquea el resto de la app.
        console.error("No se pudo cargar el historial de cardio:", err);
        if (active) setHydrated(true);
        return;
      }
      if (!active) return;

      userIdRef.current = user.id;
      setHistory(sessions);
      setHydrated(true);
    }

    load();
    return () => {
      active = false;
    };
  }, [pathname, supabase]);

  // Funcion para detener el seguimiento (nativo o web), disponible cuando el
  // arranque asincrono se resuelve. watchingRef refleja la intencion actual: si
  // se detiene antes de resolver, el watcher se cierra en cuanto exista.
  const stopWatchRef = useRef<StopWatch | null>(null);
  const watchingRef = useRef(false);

  // Copia sincrona de coordenadas/distancia: stopTracking necesita leer los
  // valores finales sin recurrir a updaters de estado (deben ser puros; hacer
  // el insert dentro duplicaba la sesion cuando React los re-invoca).
  const coordinatesRef = useRef<Coordinate[]>([]);
  const distanceKmRef = useRef(0);
  // Ultimo punto ACEPTADO para la distancia (no el ultimo crudo): al rechazar un
  // salto no se actualiza, para que el siguiente punto se compare con el ultimo
  // bueno y la traza se auto-corrija (igual que cleanTrace al dibujar).
  const lastAcceptedRef = useRef<Coordinate | null>(null);
  const [currentPosition, setCurrentPosition] = useState<Coordinate | null>(null);
  /** ULTIMA fijacion recibida, aceptada o no. Es contra esta que se mide la
   *  velocidad: contra el ancla, un rechazo agranda el hueco de tiempo y el
   *  siguiente salto igual de imposible se cuela por parecer lento. */
  const lastFixRef = useRef<Coordinate | null>(null);

  // Cronometro por timestamps: aunque el navegador congele los timers en
  // segundo plano, al volver el tiempo mostrado se recalcula y es correcto.
  const accumulatedSecRef = useRef(0);
  const runningSinceRef = useRef<number | null>(null);

  // Identidad de la ruta en curso: se crea al empezar, no al finalizar, porque
  // ahora la fila existe en servidor desde el primer volcado.
  const activeIdRef = useRef<string | null>(null);
  const activeDateRef = useRef<string | null>(null);
  /** Ruta que se está siguiendo (modo "repetir ruta"); null en una ruta libre.
   *  Al finalizar, la sesión guardada se marca con este `route_id`. */
  const followRouteIdRef = useRef<string | null>(null);
  /** Copia síncrona de `isTracking`: `startTracking` tiene que poder rechazar un
   *  segundo arranque en el mismo tick, antes de que React repinte. */
  const isTrackingRef = useRef(false);
  /** Puntos ya confirmados en servidor, para mandar solo los nuevos. */
  const storedLenRef = useRef(0);
  const flushingRef = useRef(false);

  const computeDuration = useCallback(() => {
    const running =
      runningSinceRef.current !== null
        ? (Date.now() - runningSinceRef.current) / 1000
        : 0;
    return Math.floor(accumulatedSecRef.current + running);
  }, []);

  useEffect(() => {
    if (!isTracking || isPaused) return;
    const id = setInterval(() => setDurationSec(computeDuration()), 1000);
    return () => clearInterval(id);
  }, [isTracking, isPaused, computeDuration]);

  // Wake Lock: mantiene la pantalla encendida mientras se graba. Con la
  // pantalla apagada el navegador suspende el GPS; esto es lo que permite
  // que una PWA siga registrando la ruta (no hay geolocalizacion en
  // segundo plano real en la web).
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const acquireWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      /* denegado o no soportado: la app funciona igual */
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);


  const watchGPS = useCallback(() => {
    if (watchingRef.current) return; // ya hay un seguimiento activo
    watchingRef.current = true;
    // Pide permisos (y espera) ANTES de addWatcher: con la app en primer plano
    // y los permisos ya concedidos, el foreground service nativo arranca a la
    // primera. Ver ensureGeoPermissions() para el motivo (bug del 1.er arranque).
    (async () => {
      const granted = await ensureGeoPermissions();
      // Se detuvo mientras se pedian los permisos: no arrancar nada.
      if (!watchingRef.current) return;
      if (!granted) {
        watchingRef.current = false;
        setGpsError(gpsErrorMessage(1)); // PERMISSION_DENIED
        setGpsNeedsSettings(true);
        return;
      }
      try {
        const stop = await startGeoWatch(
          (p) => {
            setGpsError(null);
            setGpsNeedsSettings(false);

            // 1. FILTRO DE PRECISIÓN ESTRICTO:
            // Si la precisión es deficiente (> 25 m), es un rebote de señal o celda lejana.
            // Se ignora por completo: ni mueve el punto azul ni ensucia la traza.
            if (p.accuracy != null && p.accuracy > ACC_MAX_M) return;

            const newCoord: Coordinate = { lat: p.lat, lng: p.lng, alt: p.alt, timestamp: p.timestamp };

            // 2. VELOCIDAD Y FILTRO DE SALTO IMPOSIBLE / OUTLIER:
            const prev = lastFixRef.current;
            lastFixRef.current = newCoord;
            const dtSec = prev ? Math.max(0.1, (newCoord.timestamp - prev.timestamp) / 1000) : 0;
            const saltoM = prev ? haversineM(prev, newCoord) : 0;
            const calcSpeedMps = dtSec > 0 ? saltoM / dtSec : 0;
            const esSalto = prev
              ? (dtSec > 0 && calcSpeedMps > MAX_SPEED_MPS) || saltoM > MAX_JUMP_M
              : false;

            if (esSalto) return; // Descartar saltos imposibles (> 28,8 km/h o > 80m de golpe)

            // 3. DETECCIÓN DE REPOSO / ESTACIONARIO:
            // Comprobamos la velocidad Doppler por hardware del sensor (p.speed) y la calculada.
            const sensorSpeed = p.speed != null ? p.speed : null;
            const isEffectivelyStationary =
              (sensorSpeed != null && sensorSpeed < MIN_WALK_SPEED_MPS) ||
              (prev != null && calcSpeedMps < MIN_WALK_SPEED_MPS && saltoM < 4);

            // 4. ACTUALIZACIÓN AMORTIGUADA DEL MARCADOR EN PANTALLA:
            // Mantiene el punto azul vivo y fluido, pero amortigua el micro-temblor en reposo.
            setCurrentPosition((curPos) => {
              if (!curPos) return newCoord;
              const distFromCur = haversineM(curPos, newCoord);
              if (isEffectivelyStationary && distFromCur < 4) {
                // Amortiguación exponencial suave mientras se está quieto
                return {
                  lat: curPos.lat * 0.75 + newCoord.lat * 0.25,
                  lng: curPos.lng * 0.75 + newCoord.lng * 0.25,
                  alt: newCoord.alt,
                  timestamp: newCoord.timestamp,
                };
              }
              return newCoord;
            });

            // 5. CONSOLIDACIÓN DE TRAZA Y DISTANCIA:
            // Solo consolida vértices y suma kilómetros cuando hay desplazamiento físico real.
            const anchor = lastAcceptedRef.current;
            if (!anchor) {
              lastAcceptedRef.current = newCoord;
              coordinatesRef.current = [newCoord];
              setCoordinates(coordinatesRef.current);
            } else if (!isEffectivelyStationary) {
              const distM = haversineM(anchor, newCoord);
              // Umbral dinámico: al menos 7 metros Y superar el radio de error del sensor
              const minThreshold = Math.max(MIN_MOVE_M, (p.accuracy ?? 10) * 0.5);
              if (distM >= minThreshold) {
                distanceKmRef.current += distM / 1000;
                lastAcceptedRef.current = newCoord;
                coordinatesRef.current = [...coordinatesRef.current, newCoord];
                setCoordinates(coordinatesRef.current);
                setDistanceKm(distanceKmRef.current);
              }
            }
          },
          (e) => {
            console.warn(`GPS: ${e.message}`);
            setGpsError(e.code != null ? gpsErrorMessage(e.code) : e.message);
            if (e.permissionDenied) setGpsNeedsSettings(true);
          },
        );
        // Si se detuvo mientras arrancaba, cerrar el watcher ya mismo.
        if (watchingRef.current) stopWatchRef.current = stop;
        else stop();
      } catch {
        setGpsError(gpsErrorMessage());
      }
    })();
  }, []);

  const clearGPS = useCallback(() => {
    watchingRef.current = false;
    stopWatchRef.current?.();
    stopWatchRef.current = null;
  }, []);

  // El wake lock se libera solo al ocultar la pestana; se re-adquiere al
  // volver si la grabacion sigue activa.
  useEffect(() => {
    if (!isTracking || isPaused) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isTracking, isPaused, acquireWakeLock]);

  /**
   * Vuelca a Supabase lo grabado desde el ultimo volcado. Sin esto la ruta solo
   * existia en memoria hasta pulsar "Finalizar", y una hora de carrera se
   * perdia entera si la app moria por el camino.
   */
  const flushProgress = useCallback(async () => {
    const id = activeIdRef.current;
    const userId = userIdRef.current;
    if (!id || !userId || flushingRef.current) return;

    const all = coordinatesRef.current;
    const nuevos = all.slice(storedLenRef.current);
    if (nuevos.length === 0) return;

    flushingRef.current = true;
    try {
      storedLenRef.current = await pushCardioProgress(
        supabase,
        id,
        activeDateRef.current ?? new Date().toISOString(),
        distanceKmRef.current,
        computeDuration(),
        storedLenRef.current,
        nuevos,
      );
    } catch (err) {
      // Sin ruido en la UI: es un volcado intermedio y el siguiente reintenta
      // con los mismos puntos (storedLenRef no avanza). Lo que no puede fallar
      // en silencio es el volcado final, que va por syncWrite.
      console.warn("No se pudo volcar el progreso de la ruta:", err);
    } finally {
      flushingRef.current = false;
    }
  }, [supabase, computeDuration]);

  useEffect(() => {
    if (!isTracking || isPaused) return;
    const id = setInterval(flushProgress, FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isTracking, isPaused, flushProgress]);

  // Snapshot de la sesion en curso: si el SO mata la PWA a mitad de ruta,
  // al reabrir se recupera lo grabado en vez de perderlo todo.
  //
  // Con throttle: antes se reescribia en CADA punto GPS (~cada 5 m), lo que al
  // final de una carrera larga significaba serializar y escribir ~130 KB de
  // forma sincrona en el hilo principal cada pocos segundos. localStorage
  // bloquea, y eso se notaba como tirones en el mapa.
  const lastSnapshotAtRef = useRef(0);
  useEffect(() => {
    if (!isTracking) return;
    const now = Date.now();
    const forzar = isPaused || coordinates.length === 0;
    if (!forzar && now - lastSnapshotAtRef.current < SNAPSHOT_THROTTLE_MS) return;
    lastSnapshotAtRef.current = now;
    writeSnapshot({
      coordinates,
      distanceKm,
      accumulatedSec: accumulatedSecRef.current,
      runningSince: runningSinceRef.current,
      sessionId: activeIdRef.current ?? undefined,
      dateISO: activeDateRef.current ?? undefined,
      storedLen: storedLenRef.current,
      followRouteId: followRouteIdRef.current,
      followRoute,
    });
  }, [isTracking, coordinates, distanceKm, isPaused, followRoute]);

  const startTracking = useCallback((routeId?: string, ghostRoute?: Coordinate[]) => {
    // Red de seguridad contra un segundo arranque (doble toque, otra pantalla,
    // una accion de NOA...). Sin esto no se abrian "dos rutas": se BORRABA la
    // que estaba en marcha — coordenadas, distancia y id de sesion a cero — y
    // lo grabado hasta entonces quedaba huerfano. La UI ademas desactiva los
    // botones de arranque, pero la garantia tiene que estar aqui.
    if (isTrackingRef.current) return;
    isTrackingRef.current = true;

    clearGPS();
    followRouteIdRef.current = routeId ?? null;
    setFollowRoute(ghostRoute ?? []);
    setIsTracking(true);
    setIsPaused(false);
    setIsMinimized(false);
    coordinatesRef.current = [];
    distanceKmRef.current = 0;
    lastAcceptedRef.current = null;
    lastFixRef.current = null;
    setCurrentPosition(null);
    setCoordinates([]);
    setDistanceKm(0);
    setDurationSec(0);
    setGpsError(null);
    setGpsNeedsSettings(false);
    accumulatedSecRef.current = 0;
    runningSinceRef.current = Date.now();
    // La ruta tiene identidad desde el principio: la fila en servidor se crea
    // en el primer volcado, no al finalizar.
    activeIdRef.current = crypto.randomUUID();
    activeDateRef.current = new Date().toISOString();
    storedLenRef.current = 0;
    acquireWakeLock();
    watchGPS();
  }, [clearGPS, watchGPS, acquireWakeLock]);

  const pauseTracking = useCallback(() => {
    accumulatedSecRef.current = computeDuration();
    runningSinceRef.current = null;
    setDurationSec(accumulatedSecRef.current);
    setIsPaused(true);
    releaseWakeLock();
    clearGPS();
    // Pausar es un buen momento para asegurar lo grabado: puede pasar mucho
    // rato hasta que se reanude, o no reanudarse nunca.
    flushProgress();
  }, [clearGPS, computeDuration, releaseWakeLock, flushProgress]);

  const resumeTracking = useCallback(() => {
    runningSinceRef.current = Date.now();
    setIsPaused(false);
    acquireWakeLock();
    watchGPS();
  }, [watchGPS, acquireWakeLock]);

  const stopTracking = useCallback((options?: { discard?: boolean }) => {
    const discard = options?.discard ?? false;
    const finalDuration = computeDuration();
    const finalCoordinates = coordinatesRef.current;
    const finalDistance = distanceKmRef.current;
    accumulatedSecRef.current = 0;
    runningSinceRef.current = null;
    isTrackingRef.current = false;
    setIsTracking(false);
    setIsPaused(false);
    setIsMinimized(false);
    setFollowRoute([]);
    setGpsError(null);
    setGpsNeedsSettings(false);
    releaseWakeLock();
    clearGPS();
    clearSnapshot();
    setDurationSec(finalDuration);

    const id = activeIdRef.current;
    const dateISO = activeDateRef.current ?? new Date().toISOString();
    const storedLen = storedLenRef.current;
    const followRouteId = followRouteIdRef.current;
    activeIdRef.current = null;
    activeDateRef.current = null;
    followRouteIdRef.current = null;
    storedLenRef.current = 0;

    if (!discard && id && (finalDistance > 0 || finalDuration > 10)) {
      const newSession: CardioSession = {
        id,
        dateISO,
        coordinates: finalCoordinates,
        distanceKm: finalDistance,
        durationSec: finalDuration,
      };
      setHistory((prev) => [newSession, ...prev]);
      const userId = userIdRef.current;
      if (userId) {
        // Volcado final por la cola de sync (reintentos + aviso si falla).
        // Solo viajan los puntos que aun no estuviesen confirmados, y el RPC es
        // idempotente, asi que un reintento no duplica la traza.
        syncWrite("la ruta de cardio", {
          kind: "rpc",
          fn: "upsert_cardio_progress",
          args: {
            p_id: id,
            p_date: dateISO,
            p_distance_km: finalDistance,
            p_duration_sec: finalDuration,
            p_stored_len: storedLen,
            p_new_points: finalCoordinates.slice(storedLen),
          },
        });
        // Si era un seguimiento de ruta, se marca la sesión con su route_id. Va
        // DESPUÉS del upsert (la cola es FIFO), así que la fila ya existe.
        if (followRouteId) {
          syncWrite("el enlace de la ruta", {
            kind: "update",
            table: "cardio_sessions",
            values: { route_id: followRouteId },
            match: { id, user_id: userId },
          });
        }
      }
    } else if (id && userIdRef.current && storedLen > 0) {
      // Ruta descartada (a mano o por insignificante) pero con volcados ya en
      // servidor: hay que borrar la fila o queda una ruta fantasma.
      const userId = userIdRef.current;
      syncWrite("el descarte de la ruta", {
        kind: "delete",
        table: "cardio_sessions",
        match: { id, user_id: userId },
      });
    }
    // coordinates/distanceKm se quedan como estan para la pantalla de
    // resumen; startTracking los resetea.
  }, [clearGPS, computeDuration, releaseWakeLock]);

  // Recuperacion: al arrancar, si quedo una sesion a medias (la PWA se cerro
  // sin pasar por stopTracking), se REANUDA en pausa en vez de finalizarla. Asi
  // la sesion "sigue en marcha" hasta que el usuario decida continuar (retoma el
  // GPS) o finalizar. No se inventa tiempo: mientras la app estuvo cerrada el
  // GPS no grababa, asi que el cronometro se corta en la ultima posicion real.
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (!hydrated || isTracking || recoveredRef.current) return;
    recoveredRef.current = true;
    const snap = readSnapshot();
    if (!snap) return;

    const lastCoord = snap.coordinates[snap.coordinates.length - 1];
    const lastTs = lastCoord?.timestamp ?? 0;
    // Sesion "zombie" (>12 h desde el ultimo dato): no tiene sentido reanudar.
    if (!lastTs || Date.now() - lastTs > 12 * 60 * 60 * 1000) {
      clearSnapshot();
      return;
    }

    // El tiempo "corriendo" tras el ultimo dato es humo: se corta en la
    // ultima posicion registrada.
    const runningSec =
      snap.runningSince !== null && lastCoord
        ? Math.max(0, (lastCoord.timestamp - snap.runningSince) / 1000)
        : 0;
    const duration = Math.floor(snap.accumulatedSec + runningSec);
    // Nada util grabado: descartar.
    if (snap.distanceKm <= 0 && duration <= 10) {
      clearSnapshot();
      return;
    }

    // Restaura el estado en pausa. El snapshot se mantiene (sesion aun activa);
    // el efecto de escritura lo refresca en cuanto isTracking pasa a true.
    coordinatesRef.current = snap.coordinates;
    distanceKmRef.current = snap.distanceKm;
    lastAcceptedRef.current = snap.coordinates[snap.coordinates.length - 1] ?? null;
    lastFixRef.current = lastAcceptedRef.current;
    accumulatedSecRef.current = duration;
    runningSinceRef.current = null;
    // Se reengancha a la MISMA fila que ya se estaba escribiendo: si no, al
    // finalizar se crearia una ruta nueva y la anterior quedaria huerfana en el
    // historial con la traza a medias.
    activeIdRef.current = snap.sessionId ?? crypto.randomUUID();
    activeDateRef.current = snap.dateISO ?? new Date().toISOString();
    storedLenRef.current = snap.storedLen ?? 0;
    followRouteIdRef.current = snap.followRouteId ?? null;
    isTrackingRef.current = true;
    // Hidratacion unica desde localStorage tras el montaje (protegida por
    // recoveredRef). Va en efecto a proposito: en el initializer romperia la
    // hidratacion SSR al no existir localStorage en servidor.
    /* eslint-disable react-hooks/set-state-in-effect */
    setCoordinates(snap.coordinates);
    setDistanceKm(snap.distanceKm);
    setDurationSec(duration);
    setFollowRoute(snap.followRoute ?? []);
    setIsPaused(true);
    setIsMinimized(true);
    setIsTracking(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [hydrated, isTracking]);

  const minimize = useCallback(() => setIsMinimized(true), []);
  const maximize = useCallback(() => setIsMinimized(false), []);

  const deleteSession = useCallback(
    (id: string) => {
      // Optimista: fuera de la lista al instante; el borrado en Supabase va por
      // la cola de sync (si falla tras reintentos, SyncErrorToast avisa).
      setHistory((prev) => prev.filter((s) => s.id !== id));
      const userId = userIdRef.current;
      if (userId) {
        syncWrite("el borrado de la ruta", {
          kind: "delete",
          table: "cardio_sessions",
          match: { id, user_id: userId },
        });
      }
    },
    [],
  );

  const reloadHistory = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    try {
      const sessions = await fetchHistory(supabase, userId);
      setHistory(sessions);
    } catch (err) {
      console.error("No se pudo recargar el historial de cardio:", err);
    }
  }, [supabase]);

  // Memoizado: sin esto se creaba un objeto nuevo en CADA render del provider,
  // y durante una carrera el reloj avanza cada segundo y las coordenadas en
  // cada punto GPS. Eso re-renderizaba a todos los consumidores --incluido el
  // mapa de Leaflet-- de forma continua durante toda la actividad, con el coste
  // de bateria que eso supone en una app de running.
  const value = useMemo<CardioContextValue>(
    () => ({
      hydrated,
      isTracking,
      isPaused,
      isMinimized,
      coordinates,
      currentPosition,
      distanceKm,
      durationSec,
      followRoute,
      history,
      gpsError,
      gpsNeedsSettings,
      startTracking,
      pauseTracking,
      resumeTracking,
      stopTracking,
      minimize,
      maximize,
      openLocationSettings,
      deleteSession,
      reloadHistory,
    }),
    [
      hydrated,
      isTracking,
      isPaused,
      isMinimized,
      coordinates,
      distanceKm,
      durationSec,
      followRoute,
      history,
      gpsError,
      gpsNeedsSettings,
      startTracking,
      pauseTracking,
      resumeTracking,
      stopTracking,
      minimize,
      maximize,
      deleteSession,
      reloadHistory,
    ],
  );

  return (
    <CardioContext.Provider value={value}>{children}</CardioContext.Provider>
  );
}

// --- Hook ---

export function useCardio(): CardioContextValue {
  const ctx = useContext(CardioContext);
  if (!ctx) throw new Error("useCardio debe usarse dentro de CardioProvider");
  return ctx;
}
