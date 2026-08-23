"use client";

import { useCardio } from "@/lib/store/cardio-store";
import { useWorkoutSession } from "@/lib/store/workout-session-store";
import { cn } from "@/lib/utils";

/**
 * Contenedor UNICO de avisos de la app.
 *
 * Todos los avisos (toasts efimeros y alertas persistentes como el fallo de
 * sincronizacion) se portan a `#notification-stack` en vez de posicionarse por
 * su cuenta. Asi comparten sitio y estilo, y al ser una columna flex se APILAN
 * en vez de solaparse.
 *
 * Se coloca SOBRE la barra de navegacion inferior y, si hay mini-players
 * (entreno/cardio minimizados), por encima de ellos: mismo sistema de escalones
 * que ya usa workout-mini-player.tsx.
 */

/** Estilo compartido de tarjeta de aviso. Cualquier aviso nuevo deberia usarlo
 *  para que todos se vean igual. */
export const NOTIFICATION_CARD_CLASS =
  "pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 shadow-float backdrop-blur-xl";

/** Escalones verticales segun cuantos mini-players haya debajo. Deben ser
 *  cadenas literales: Tailwind no genera clases construidas dinamicamente. */
const OFFSETS = [
  "bottom-[calc(env(safe-area-inset-bottom)+80px)] md:bottom-6",
  "bottom-[calc(env(safe-area-inset-bottom)+148px)] md:bottom-[112px]",
  "bottom-[calc(env(safe-area-inset-bottom)+216px)] md:bottom-[200px]",
] as const;

export function NotificationStack() {
  const cardio = useCardio();
  const workout = useWorkoutSession();

  // Mismas condiciones que usan los propios mini-players para pintarse.
  const miniPlayers =
    (cardio.isTracking && cardio.isMinimized ? 1 : 0) +
    (workout.active && workout.minimized && workout.day ? 1 : 0);

  return (
    <div
      id="notification-stack"
      className={cn(
        "pointer-events-none absolute inset-x-0 z-[70] flex flex-col items-center gap-2 px-4",
        OFFSETS[Math.min(miniPlayers, OFFSETS.length - 1)],
      )}
    />
  );
}

/**
 * Panel de hoja/modal. Habia cinco recetas distintas repartidas por la app
 * (unas con shadow-2xl y otras sin sombra, unas con bg-background y otras con
 * bg-surface, y el alto maximo de escritorio en 80dvh o 85dvh segun el sitio).
 * Cualquier hoja nueva deberia usar esto.
 */
export const SHEET_PANEL_CLASS =
  "flex max-h-[90dvh] flex-col rounded-t-3xl border border-border bg-background shadow-2xl md:max-h-[85dvh] md:rounded-3xl";
