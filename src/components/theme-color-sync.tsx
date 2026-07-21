"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * Mantiene el `<meta name="theme-color">` en sincronia con el tema REAL de la
 * app (no solo el del sistema). En una PWA instalada, ese meta es lo que tine
 * la barra de estado en Android; asi que al alternar claro/oscuro dentro de la
 * app, la barra del sistema cambia con ella.
 *
 * Observa la clase de <html> (que next-themes cambia en cada cambio de tema) y
 * reescribe el color leyendolo de la variable CSS --background ya resuelta. Al
 * no depender del ciclo de render de useTheme, reacciona a cualquier cambio de
 * tema, incluido el toggle manual en vivo.
 */
export function ThemeColorSync() {
  useEffect(() => {
    const apply = async () => {
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue("--background")
        .trim();
      if (!bg) return;
      
      const isDark = document.documentElement.classList.contains("dark");

      // Sobrescribe TODOS los theme-color (incluidos los que Next genera con
      // media queries) con el color real, para un resultado deterministico.
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      if (metas.length === 0) {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        meta.setAttribute("content", bg);
        document.head.appendChild(meta);
      } else {
        metas.forEach((m) => m.setAttribute("content", bg));
      }

      if (Capacitor.isNativePlatform()) {
        try {
          await StatusBar.setStyle({
            style: isDark ? Style.Dark : Style.Light,
          });
          await StatusBar.setBackgroundColor({ color: bg });
        } catch (e) {
          console.error("Error setting status bar style:", e);
        }
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
