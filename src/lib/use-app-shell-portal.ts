"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/** Nodo donde se montan los modales (`#app-shell`).
 *
 *  NO se puede resolver durante el primer render: `HydrationGate` no pinta nada
 *  hasta que hidrata el store, asi que `AppShell` y la pagina se montan en el
 *  MISMO commit y, cuando corre el render de un modal, `#app-shell` todavia no
 *  esta en el DOM. Con `useState(() => document.getElementById("app-shell"))`
 *  el destino quedaba fijado a null para siempre y los modales que devuelven
 *  null sin destino (la hoja de comida, el planificador) no se abrian nunca en
 *  una carga directa de la ruta — entrando por un link del menu si, porque ahi
 *  el shell ya existia. En la PWA/APK, que arranca en una URL concreta, y en
 *  cualquier refresco, quedaban muertos.
 *
 *  `useSyncExternalStore` devuelve false en SSR/hidratacion y true justo
 *  despues, cuando el nodo ya existe. */
export function useAppShellPortal(): Element | null {
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return mounted ? document.getElementById("app-shell") : null;
}
