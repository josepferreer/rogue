"use client";

import { useCallback, useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { useCardio } from "@/lib/store/cardio-store";
import { useWorkoutSession } from "@/lib/store/workout-session-store";

/**
 * Detecta que hay una versión nueva desplegada y recarga.
 *
 * EL PROBLEMA: la APK es un contenedor que abre la URL UNA vez, y ese documento
 * vive en el WebView durante días. Aunque despliegues, nadie vuelve a pedir el
 * HTML, así que nadie descubre que hay bundles nuevos. Pasó de verdad: un fallo
 * del GPS ya corregido en `main` siguió dando la lata en el móvil horas
 * después, y hubo que borrar la caché de la app a mano para salir.
 *
 * Ojo, el problema NO era la estrategia de caché: los bundles de Next llevan
 * hash en el nombre, así que cachearlos es seguro. Lo que faltaba era que
 * alguien se enterase de que hay build nuevo.
 *
 * REGLA DE ORO: no recargar nunca con un entreno o una ruta en marcha. Una
 * recarga a mitad de carrera deja la sesión recuperada EN PAUSA y el usuario se
 * queda sin el tramo. Si hay algo activo se deja para la próxima comprobación:
 * el código viejo aguanta un rato más sin problema, perder una sesión no.
 */

/**
 * La versión con la que se compiló ESTE bundle. Sale de `NEXT_PUBLIC_BUILD_ID`,
 * que next.config rellena desde `VERCEL_GIT_COMMIT_SHA` en build (mismo origen
 * que `/api/version`). En local queda "" → tratamos como "dev" y no molesta.
 */
const VERSION_CARGADA = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

/** Margen mínimo entre comprobaciones, para no preguntar en cada parpadeo. */
const MIN_ENTRE_CHEQUEOS_MS = 60_000;

export function DeployWatch() {
  const { isTracking } = useCardio();
  const session = useWorkoutSession();
  const sesionActiva = isTracking || session.active;

  /** Refs y no estado: esto no pinta nada, solo decide si recargar. */
  const ultimoChequeoRef = useRef(0);
  // Espejo de `sesionActiva` en un ref, para leerlo dentro de `comprobar` sin
  // recrear el callback. Se sincroniza en efecto (no en render: tocar un ref
  // durante el render es justo lo que la regla de React prohíbe).
  const activaRef = useRef(sesionActiva);
  useEffect(() => {
    activaRef.current = sesionActiva;
  }, [sesionActiva]);

  const comprobar = useCallback(async () => {
    // En local no hay versión que comparar; no molestar en desarrollo.
    if (VERSION_CARGADA === "dev") return;
    if (activaRef.current) return; // hay algo en marcha: ni tocarlo
    const ahora = Date.now();
    if (ahora - ultimoChequeoRef.current < MIN_ENTRE_CHEQUEOS_MS) return;
    ultimoChequeoRef.current = ahora;

    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const { version } = (await res.json()) as { version?: string };
      if (!version || version === VERSION_CARGADA) return;
      // Se comprueba otra vez por si arrancó una sesión mientras se preguntaba.
      if (activaRef.current) return;
      window.location.reload();
    } catch {
      // Sin red o endpoint caído: se reintenta en la próxima vuelta a la app.
    }
  }, []);

  useEffect(() => {
    // Volver a primer plano es el momento natural: es cuando el usuario va a
    // usar la app y cuando menos molesta una recarga.
    const onVisible = () => {
      if (document.visibilityState === "visible") void comprobar();
    };
    document.addEventListener("visibilitychange", onVisible);

    // En la APK, `appStateChange` es más fiable que visibilitychange.
    const handle = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void comprobar();
    });

    void comprobar(); // y una al arrancar

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void handle.then((h) => h.remove()).catch(() => {});
    };
  }, [comprobar]);

  return null;
}
