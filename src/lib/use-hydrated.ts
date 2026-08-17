"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` en servidor y en el primer render del cliente; `true` a partir de que
 * la app hidrata. Es el interruptor para todo lo que NO puede pintarse en SSR:
 * cosas que leen `localStorage`, `window` o el DOM y que renderizadas en
 * servidor darían un HTML distinto al del cliente (error de hidratación).
 *
 * Sustituye al patrón de `useState(false)` + `useEffect(() => setMounted(true))`,
 * que hace exactamente lo mismo pero provocando un render en cascada: React
 * pinta, el efecto cambia el estado y React vuelve a pintar. Aquí el valor sale
 * directo del snapshot, así que en cliente ya es `true` en la primera pasada.
 *
 * `subscribe` no hace nada a propósito: esto no cambia nunca después de hidratar,
 * así que no hay a qué suscribirse.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
