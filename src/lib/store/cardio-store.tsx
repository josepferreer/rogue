"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

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

const STORAGE_KEY = "rogue.cardio.v1";

/** Historial de demo: solo se usa la primera vez, si no hay nada guardado. */
const DEMO_HISTORY: CardioSession[] = [
  {
    id: "demo-session-1",
    dateISO: new Date(Date.now() - 24 * 60 * 60 * 1000 * 2).toISOString(),
    coordinates: [
      { lat: 40.4168, lng: -3.7038, timestamp: 1 },
      { lat: 40.418, lng: -3.702, timestamp: 2 },
      { lat: 40.42, lng: -3.7, timestamp: 3 },
    ],
    distanceKm: 5.2,
    durationSec: 45 * 60,
  },
  {
    id: "demo-session-2",
    dateISO: new Date(Date.now() - 24 * 60 * 60 * 1000 * 5).toISOString(),
    coordinates: [
      { lat: 40.42, lng: -3.7, timestamp: 1 },
      { lat: 40.415, lng: -3.705, timestamp: 2 },
    ],
    distanceKm: 3.1,
    durationSec: 25 * 60,
  },
];

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
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinate[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [history, setHistory] = useState<CardioSession[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [gpsError, setGpsError] = useState<string | null>(null);

  // Hidrata el historial desde localStorage (o siembra el demo la 1a vez).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setHistory(raw ? (JSON.parse(raw) as CardioSession[]) : DEMO_HISTORY);
    } catch {
      setHistory(DEMO_HISTORY);
    }
    setHydrated(true);
  }, []);

  // Persiste cualquier cambio real del historial (nunca antes de hidratar).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [history, hydrated]);

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
          }
          return finalCoordinates; // We keep it in memory for now, although startTracking resets it
        });
        return finalDuration;
      });
      return finalDistance;
    });
  }, [clearGPS]);

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
