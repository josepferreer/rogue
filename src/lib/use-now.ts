"use client";

import { useSyncExternalStore } from "react";

/**
 * La hora actual, como fuente externa y no como `Date.now()` suelto en el
 * render.
 *
 * Llamar a `Date.now()` al pintar es impuro: dos renders seguidos dan valores
 * distintos sin que haya cambiado nada, y en servidor da una hora que no es la
 * del cliente. Aqui el valor solo cambia cuando el temporizador avisa, asi que
 * el render es estable entre tics.
 *
 * Efecto util de paso: lo que dependa de la hora (cuanto falta para que un
 * musculo se recupere) se refresca solo, sin recargar la pagina.
 */

/** Valor compartido: `getSnapshot` DEBE devolver lo mismo entre tics o React
 *  entra en bucle de renders. */
let ahora = Date.now();
const suscriptores = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void) {
  suscriptores.add(onChange);
  if (!timer) {
    // Al enganchar el primer suscriptor hay que refrescar: `ahora` se fijo al
    // cargar el modulo y sin nadie suscrito NADIE lo actualizaba. Si la pestana
    // llevaba una hora abierta, el primer render salia con una hora de retraso
    // (se veia como "faltan 3 d 1 h" donde el umbral son 72 h justas). React
    // vuelve a leer el snapshot despues de suscribirse, asi que se entera.
    ahora = Date.now();
    timer = setInterval(() => {
      ahora = Date.now();
      for (const cb of suscriptores) cb();
    }, 60_000);
  }
  return () => {
    suscriptores.delete(onChange);
    if (suscriptores.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => ahora;
/** En servidor no hay "ahora" que valga: quien lo use debe esperar a hidratar. */
const getServerSnapshot = () => 0;

/** Milisegundos actuales, refrescados cada minuto. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
