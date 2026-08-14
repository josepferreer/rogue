"use client";

import { useEffect, useState } from "react";

/** Debe coincidir con la animación más larga de globals.css (`sheet-in`). */
const DEFAULT_DURATION_MS = 260;

export type PresenceState = "open" | "closing";

/** Lectura puntual, no suscripción: solo se consulta al abrir/cerrar, nunca en
 *  el render inicial, así que no puede desajustar la hidratación. */
function prefiereMenosMovimiento(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Mantiene un panel montado un rato más después de cerrarlo, para que le dé
 * tiempo a reproducir su animación de salida.
 *
 * El problema: los overlays de la app hacen `if (!open) return null`, así que
 * al cerrar desaparecen en el mismo frame y no hay nada que animar. Una hoja
 * que sube suave al abrir y se esfuma de golpe al cerrar se nota MÁS rota que
 * una sin animación ninguna.
 *
 * Uso, sustituyendo el guard:
 *
 *   const { mounted, state } = usePresence(open);
 *   if (!mounted || !portalTarget) return null;
 *   ...
 *   <div className="overlay-anim" data-state={state}>
 *     <div className="sheet-anim" data-state={state}>
 *
 * `data-state="closing"` es lo que en CSS invierte la animación.
 */
export function usePresence(open: boolean, durationMs = DEFAULT_DURATION_MS) {
  const [closing, setClosing] = useState(false);
  // `useState` y no `useRef` para el valor anterior: escribir en una ref
  // durante el render no es seguro con renders concurrentes (y el lint lo
  // prohíbe). Este es el patrón de "ajustar estado cuando cambia una prop".
  const [prevOpen, setPrevOpen] = useState(open);

  // Se deriva DURANTE el render, no en un efecto. Es la parte delicada de todo
  // esto: un efecto corre DESPUÉS del commit, así que al cerrar quedaba un
  // pintado intermedio con `open` ya false y `closing` todavía false — o sea
  // `mounted` false — y el panel se desmontaba de golpe; al render siguiente
  // volvía a montarse para animar la salida. Eso se veía como un parpadeo: el
  // panel desaparecía, reaparecía y entonces se cerraba. Poniendo el estado
  // aquí, React reintenta el render antes de tocar el DOM y no hay commit
  // intermedio. Es el patrón oficial de "estado derivado de props".
  if (prevOpen !== open) {
    setPrevOpen(open);
    // Al abrir, además, cancela un cierre a medias: si no, reabrir antes de que
    // termine dejaba el panel marcado como cerrándose (animación invertida con
    // `forwards`, es decir, invisible).
    //
    // Con "reducir movimiento" la animación dura 0.01 ms (globals.css): esperar
    // igualmente dejaría el panel invisible y bloqueando 260 ms.
    setClosing(!open && !prefiereMenosMovimiento());
  }

  // El desmontaje va por temporizador y no por `animationend`: el panel y el
  // fondo son dos elementos con dos animaciones, y si el navegador descarta una
  // (pestaña en segundo plano) el evento no llega y el panel se queda pegado en
  // pantalla para siempre.
  useEffect(() => {
    if (!closing) return;
    const id = setTimeout(() => setClosing(false), durationMs);
    return () => clearTimeout(id);
  }, [closing, durationMs]);

  return {
    /** Hay que renderizar (abierto, o cerrándose todavía). */
    mounted: open || closing,
    /** Para el atributo `data-state` del contenedor y del panel. */
    state: (closing ? "closing" : "open") satisfies PresenceState as PresenceState,
  };
}
