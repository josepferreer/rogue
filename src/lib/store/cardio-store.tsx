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
import {
  ensureGeoPermissions,
  openLocationSettings,
  startGeoWatch,
  type StopWatch,
} from "@/lib/cardio/geo-tracker";

// --- Helpers ---

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Rechazo de outliers para el calculo de distancia (mismos umbrales que el map
// limpieza de lib/cardio/clean-trace). Un tramo que implica una velocidad imposible a pie
// (>28.8 km/h) es un salto del sensor, no movimiento real: sin esto, la deriva
// del GPS inflaba los km guardados. Un salto tras un apagon largo (dt grande)
// da velocidad baja y SI cuenta, que es lo correcto (desplazamiento real).
const MAX_SPEED_MPS = 8;
// Sin timestamps fiables (dt<=0), cae a un umbral de distancia bruto.
const MAX_JUMP_M = 80;

// --- Types ---

export type Coordinate = { lat: number; lng: number; timestamp: number };

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
  distanceKm: number;
  durationSec: number;
  history: CardioSession[];
  gpsError: string | null;
  /** El error de GPS es por falta de permiso: la UI ofrece abrir ajustes. */
  gpsNeedsSettings: boolean;
  startTracking: () => void;
  pauseTracking: () => void;
  resumeTracking: () => void;
  stopTracking: () => void;
  minimize: () => void;
  maximize: () => void;
  openLocationSettings: () => void;
  /** Borra una ruta del historial (optimista + delete en Supabase). */
  deleteSession: (id: string) => void;
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
};

/** Cada cuanto se vuelca el progreso de la ruta a Supabase. */
const FLUSH_INTERVAL_MS = 30_000;
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

  // Cronometro por timestamps: aunque el navegador congele los timers en
  // segundo plano, al volver el tiempo mostrado se recalcula y es correcto.
  const accumulatedSecRef = useRef(0);
  const runningSinceRef = useRef<number | null>(null);

  // Identidad de la ruta en curso: se crea al empezar, no al finalizar, porque
  // ahora la fila existe en servidor desde el primer volcado.
  const activeIdRef = useRef<string | null>(null);
  const activeDateRef = useRef<string | null>(null);
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

  // El wake lock se libera solo al ocultar la pestana; se re-adquiere al
  // volver si la grabacion sigue activa.
  useEffect(() => {
    if (!isTracking || isPaused) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isTracking, isPaused, acquireWakeLock]);

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
            const newCoord: Coordinate = { lat: p.lat, lng: p.lng, timestamp: p.timestamp };
            const last = lastAcceptedRef.current;
            if (last) {
              const distKm = haversineKm(last.lat, last.lng, newCoord.lat, newCoord.lng);
              const dtSec = (newCoord.timestamp - last.timestamp) / 1000;
              const isOutlier =
                dtSec > 0
                  ? (distKm * 1000) / dtSec > MAX_SPEED_MPS
                  : distKm * 1000 > MAX_JUMP_M;
              // Solo cuenta (y avanza el punto de referencia) si no es un salto
              // imposible. Un outlier se guarda igual en coordinatesRef para el
              // mapa (que re-limpia al dibujar), pero no infla la distancia.
              if (!isOutlier) {
                distanceKmRef.current += distKm;
                lastAcceptedRef.current = newCoord;
              }
            } else {
              lastAcceptedRef.current = newCoord;
            }
            coordinatesRef.current = [...coordinatesRef.current, newCoord];
            setCoordinates(coordinatesRef.current);
            setDistanceKm(distanceKmRef.current);
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
    });
  }, [isTracking, coordinates, distanceKm, isPaused]);

  const startTracking = useCallback(() => {
    setIsTracking(true);
    setIsPaused(false);
    setIsMinimized(false);
    coordinatesRef.current = [];
    distanceKmRef.current = 0;
    lastAcceptedRef.current = null;
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
  }, [watchGPS, acquireWakeLock]);

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

  const stopTracking = useCallback(() => {
    const finalDuration = computeDuration();
    const finalCoordinates = coordinatesRef.current;
    const finalDistance = distanceKmRef.current;
    accumulatedSecRef.current = 0;
    runningSinceRef.current = null;
    setIsTracking(false);
    setIsPaused(false);
    setIsMinimized(false);
    setGpsError(null);
    setGpsNeedsSettings(false);
    releaseWakeLock();
    clearGPS();
    clearSnapshot();
    setDurationSec(finalDuration);

    const id = activeIdRef.current;
    const dateISO = activeDateRef.current ?? new Date().toISOString();
    const storedLen = storedLenRef.current;
    activeIdRef.current = null;
    activeDateRef.current = null;
    storedLenRef.current = 0;

    if (id && (finalDistance > 0 || finalDuration > 10)) {
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
      }
    } else if (id && userIdRef.current && storedLen > 0) {
      // Ruta descartada por insignificante pero con volcados ya en servidor:
      // hay que borrar la fila o quedaria una ruta fantasma en el historial.
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
    accumulatedSecRef.current = duration;
    runningSinceRef.current = null;
    // Se reengancha a la MISMA fila que ya se estaba escribiendo: si no, al
    // finalizar se crearia una ruta nueva y la anterior quedaria huerfana en el
    // historial con la traza a medias.
    activeIdRef.current = snap.sessionId ?? crypto.randomUUID();
    activeDateRef.current = snap.dateISO ?? new Date().toISOString();
    storedLenRef.current = snap.storedLen ?? 0;
    // Hidratacion unica desde localStorage tras el montaje (protegida por
    // recoveredRef). Va en efecto a proposito: en el initializer romperia la
    // hidratacion SSR al no existir localStorage en servidor.
    /* eslint-disable react-hooks/set-state-in-effect */
    setCoordinates(snap.coordinates);
    setDistanceKm(snap.distanceKm);
    setDurationSec(duration);
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
      distanceKm,
      durationSec,
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
    }),
    [
      hydrated,
      isTracking,
      isPaused,
      isMinimized,
      coordinates,
      distanceKm,
      durationSec,
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
