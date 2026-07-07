"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// Función para calcular la distancia de Haversine en kilómetros
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radio de la tierra en km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d;
}

export type Coordinate = {
  lat: number;
  lng: number;
  timestamp: number;
};

export function useRouteTracker() {
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinate[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Iniciar cronómetro
  useEffect(() => {
    if (isTracking && !isPaused) {
      timerRef.current = setInterval(() => {
        setDurationSec((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTracking, isPaused]);

  const startTracking = useCallback(() => {
    if (!("geolocation" in navigator)) {
      alert("Tu dispositivo no soporta geolocalización.");
      return;
    }

    setIsTracking(true);
    setIsPaused(false);
    setCoordinates([]);
    setDistanceKm(0);
    setDurationSec(0);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newCoord = { lat: latitude, lng: longitude, timestamp: position.timestamp };
        
        setCoordinates((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = getDistanceFromLatLonInKm(last.lat, last.lng, newCoord.lat, newCoord.lng);
            setDistanceKm((prevDist) => prevDist + dist);
          }
          return [...prev, newCoord];
        });
      },
      (error) => {
        console.warn(`Aviso GPS (Código ${error.code}): ${error.message}`);
        // No usamos console.error para evitar que Next.js lance la pantalla roja de error en desarrollo.
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );
  }, []);

  const pauseTracking = useCallback(() => {
    setIsPaused(true);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const resumeTracking = useCallback(() => {
    setIsPaused(false);
    if (!("geolocation" in navigator)) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newCoord = { lat: latitude, lng: longitude, timestamp: position.timestamp };
        
        setCoordinates((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = getDistanceFromLatLonInKm(last.lat, last.lng, newCoord.lat, newCoord.lng);
            setDistanceKm((prevDist) => prevDist + dist);
          }
          return [...prev, newCoord];
        });
      },
      (error) => {
        console.warn(`Aviso GPS (Código ${error.code}): ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );
  }, []);

  const stopTracking = useCallback(() => {
    setIsTracking(false);
    setIsPaused(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, []);

  return {
    isTracking,
    isPaused,
    coordinates,
    distanceKm,
    durationSec,
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
  };
}
