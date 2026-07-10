"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

// --- Types ---

export type Coordinate = { lat: number; lng: number; timestamp: number };

export type CardioSession = {
  id: string;
  dateISO: string;
  coordinates: Coordinate[];
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
  startTracking: () => void;
  pauseTracking: () => void;
  resumeTracking: () => void;
  stopTracking: () => void;
  minimize: () => void;
  maximize: () => void;
};

type CardioRow = {
  id: string;
  date: string;
  distance_km: number;
  duration_sec: number;
  coordinates: Coordinate[];
};

function rowToSession(row: CardioRow): CardioSession {
  return {
    id: row.id,
    dateISO: row.date,
    coordinates: row.coordinates,
    distanceKm: Number(row.distance_km),
    durationSec: row.duration_sec,
  };
}

type SupabaseClient = ReturnType<typeof createClient>;

async function fetchHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<CardioSession[]> {
  const { data } = await supabase
    .from("cardio_sessions")
    .select("id, date, distance_km, duration_sec, coordinates")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  return (data ?? []).map(rowToSession);
}

async function insertCardioSession(
  supabase: SupabaseClient,
  userId: string,
  session: CardioSession,
) {
  await supabase.from("cardio_sessions").insert({
    id: session.id,
    user_id: userId,
    date: session.dateISO,
    distance_km: session.distanceKm,
    duration_sec: session.durationSec,
    coordinates: session.coordinates,
  });
}

function gpsErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Sin acceso a tu ubicacion. Activa el permiso de GPS para esta app en los ajustes del navegador.";
    case err.POSITION_UNAVAILABLE:
      return "No se puede obtener tu ubicacion ahora mismo. Comprueba tu senal GPS.";
    case err.TIMEOUT:
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
        userIdRef.current = null;
        if (active) {
          setHistory([]);
          setHydrated(true);
        }
        return;
      }

      // Mismo usuario ya cargado: no repetir la consulta en cada navegacion.
      if (user.id === userIdRef.current) {
        if (active) setHydrated(true);
        return;
      }

      const sessions = await fetchHistory(supabase, user.id);
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

  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cronómetro
  useEffect(() => {
    if (isTracking && !isPaused) {
      timerRef.current = setInterval(() => setDurationSec((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTracking, isPaused]);

  const watchGPS = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("Este dispositivo no soporta geolocalizacion.");
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        const newCoord: Coordinate = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp,
        };
        setCoordinates((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            setDistanceKm((d) => d + haversineKm(last.lat, last.lng, newCoord.lat, newCoord.lng));
          }
          return [...prev, newCoord];
        });
      },
      (err) => {
        console.warn(`GPS (${err.code}): ${err.message}`);
        setGpsError(gpsErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }, []);

  const clearGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startTracking = useCallback(() => {
    setIsTracking(true);
    setIsPaused(false);
    setIsMinimized(false);
    setCoordinates([]);
    setDistanceKm(0);
    setDurationSec(0);
    setGpsError(null);
    watchGPS();
  }, [watchGPS]);

  const pauseTracking = useCallback(() => {
    setIsPaused(true);
    clearGPS();
  }, [clearGPS]);

  const resumeTracking = useCallback(() => {
    setIsPaused(false);
    watchGPS();
  }, [watchGPS]);

  const stopTracking = useCallback(() => {
    setIsTracking(false);
    setIsPaused(false);
    setIsMinimized(false);
    setGpsError(null);
    clearGPS();
    if (timerRef.current) clearInterval(timerRef.current);

    setDistanceKm((finalDistance) => {
      setDurationSec((finalDuration) => {
        setCoordinates((finalCoordinates) => {
          if (finalDistance > 0 || finalDuration > 10) {
            const newSession: CardioSession = {
              id: crypto.randomUUID(),
              dateISO: new Date().toISOString(),
              coordinates: finalCoordinates,
              distanceKm: finalDistance,
              durationSec: finalDuration,
            };
            setHistory((prev) => [newSession, ...prev]);
            const userId = userIdRef.current;
            if (userId) {
              insertCardioSession(supabase, userId, newSession).catch(() => {});
            }
          }
          return finalCoordinates; // We keep it in memory for now, although startTracking resets it
        });
        return finalDuration;
      });
      return finalDistance;
    });
  }, [clearGPS, supabase]);

  const minimize = useCallback(() => setIsMinimized(true), []);
  const maximize = useCallback(() => setIsMinimized(false), []);

  return (
    <CardioContext.Provider
      value={{
        hydrated,
        isTracking,
        isPaused,
        isMinimized,
        coordinates,
        distanceKm,
        durationSec,
        history,
        gpsError,
        startTracking,
        pauseTracking,
        resumeTracking,
        stopTracking,
        minimize,
        maximize,
      }}
    >
      {children}
    </CardioContext.Provider>
  );
}

// --- Hook ---

export function useCardio(): CardioContextValue {
  const ctx = useContext(CardioContext);
  if (!ctx) throw new Error("useCardio debe usarse dentro de CardioProvider");
  return ctx;
}
