"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

/** Colores de fondo por tema, en sincronia con --background de globals.css.
 *  Son los que pinta la barra de estado (bateria, reloj...) del sistema. */
const THEME_COLORS: Record<string, string> = {
  light: "#f6f6f8",
  dark: "#0c0c0e",
};

/** Ajusta la meta `theme-color` al tema REAL aplicado en la app (incluye el
 *  selector interno claro/oscuro/sistema), no solo al `prefers-color-scheme`
 *  del dispositivo. Asi la barra de estado se adapta al aspecto de la PWA.
 *
 *  Gestiona una unica meta sin `media` para que tenga prioridad, y retira las
 *  que Next genera por media-query (viewport.themeColor) y entrarian en
 *  conflicto. */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    const color = THEME_COLORS[resolvedTheme] ?? THEME_COLORS.dark;

    // Retira las meta theme-color con media (las de viewport.themeColor).
    document
      .querySelectorAll('meta[name="theme-color"][media]')
      .forEach((el) => el.remove());

    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]:not([media])',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [resolvedTheme]);

  return null;
}
