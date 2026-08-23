"use client";

import { useEffect, useRef } from "react";

/**
 * Atrapa el foco dentro de un modal mientras esta abierto.
 *
 * Los paneles de la app declaran `role="dialog"` y `aria-modal="true"`, que le
 * PROMETEN al lector de pantalla que el resto de la pagina esta inerte. No lo
 * estaba: con Tab se salia del modal a la pagina de detras, que seguia siendo
 * navegable aunque visualmente estuviera tapada por el velo. Quien navega con
 * teclado o lector se perdia fuera del dialogo sin saberlo.
 *
 * Hace tres cosas:
 *   1. mueve el foco dentro al abrir,
 *   2. cicla Tab / Shift+Tab entre los elementos focalizables del panel,
 *   3. devuelve el foco a quien lo abrio al cerrar.
 *
 * El cierre con Escape va aparte, en `useEscapeToClose`.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const previousRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    if (!panel) return;

    previousRef.current = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Al abrir, el foco entra en el panel. Si no hay nada focalizable dentro,
    // se enfoca el propio panel (por eso lleva tabIndex={-1}).
    const first = focusables()[0];
    (first ?? panel).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === firstItem || !panel.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      // Devolver el foco a quien abrio el modal: si no, tras cerrar queda en
      // <body> y el siguiente Tab empieza desde el principio de la pagina.
      previousRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return ref;
}
