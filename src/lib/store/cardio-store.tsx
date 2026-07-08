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
  isTracking: boolean;
  isPaused: boolean;
  isMinimized: boolean;
  coordinates: Coordinate[];
  distanceKm: number;
  durationSec: number;
  history: CardioSession[];
  startTracking: () => void;
  pauseTracking: () => void;
  resumeTracking: () => void;
  stopTracking: () => void;
  minimize: () => void;
  maximize: () => void;
};

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
  const [history, setHistory] = useState<CardioSession[]>([
    {
      id: "demo-session-1",
      dateISO: new Date(Date.now() - 24 * 60 * 60 * 1000 * 2).toISOString(), // Hace 2 días
      coordinates: [
        { lat: 40.4168, lng: -3.7038, timestamp: 1 },
        { lat: 40.4180, lng: -3.7020, timestamp: 2 },
        { lat: 40.4200, lng: -3.7000, timestamp: 3 },
      ],
      distanceKm: 5.2,
      durationSec: 45 * 60, // 45 minutos
    },
    {
      id: "demo-session-2",
      dateISO: new Date(Date.now() - 24 * 60 * 60 * 1000 * 5).toISOString(), // Hace 5 días
      coordinates: [
        { lat: 40.4200, lng: -3.7000, timestamp: 1 },
        { lat: 40.4150, lng: -3.7050, timestamp: 2 },
      ],
      distanceKm: 3.1,
      durationSec: 25 * 60, // 25 minutos
    },
  ]);

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
    if (!("geolocation" in navigator)) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
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
      (err) => console.warn(`GPS (${err.code}): ${err.message}`),
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
        isTracking,
        isPaused,
        isMinimized,
        coordinates,
        distanceKm,
        durationSec,
        history,
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
