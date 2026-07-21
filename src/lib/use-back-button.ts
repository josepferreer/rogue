"use client";

import { useEffect, useRef } from "react";

/**
 * Intercepta el botón/gesto "atrás" (APK de Capacitor, PWA y navegador) mientras
 * `active` es true, ejecutando `onBack()` en vez de salir de la app o cambiar de
 * página. Pensado para modales a pantalla completa (cardio/entreno activos): que
 * "atrás" los minimice en lugar de mandar la app al home.
 *
 * Cómo funciona: al activarse mete una entrada en el historial; el botón atrás
 * la consume disparando `popstate`, donde llamamos a `onBack()` y volvemos a
 * armar la trampa para poder capturar backs consecutivos. Como se apoya solo en
 * el History API, funciona igual en web y dentro del WebView de Capacitor (su
 * back por defecto navega el historial), sin plugins nativos.
 */
export function useBackButton(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    let armed = true;
    window.history.pushState({ __rogueTrap: true }, "");

    const handler = () => {
      onBackRef.current();
      // Re-arma para seguir capturando el "atrás" mientras siga activo.
      if (armed) window.history.pushState({ __rogueTrap: true }, "");
    };

    window.addEventListener("popstate", handler);

    return () => {
      armed = false;
      window.removeEventListener("popstate", handler);
      // Si se cerró por otra vía (botón de la UI) y nuestra entrada sigue
      // arriba, la retiramos para no dejar el historial desbalanceado.
      if (window.history.state?.__rogueTrap) window.history.back();
    };
  }, [active]);
}
