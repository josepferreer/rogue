"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

/**
 * Intercepta el botón/gesto "atrás" mientras `active` es true, ejecutando
 * `onBack()` en vez de salir de la app o cambiar de página.
 *
 * PILA, no listeners sueltos. La versión anterior registraba un listener nativo
 * por cada llamada y Capacitor los invoca TODOS en un mismo "atrás", sin
 * prioridad ni forma de detener la propagación. Con un entreno abierto en
 * /app/rutinas se disparaban a la vez el de BottomNav y el del modal: una sola
 * pulsación minimizaba el entreno Y navegaba a /app. Ahora solo se ejecuta el
 * handler registrado más arriba (el más reciente = el más "interior"), que es
 * el comportamiento que espera cualquiera al pulsar atrás.
 *
 * En APK (Capacitor), usa la API nativa de App para interceptar el gesto sin
 * corromper el historial del WebView (lo que previene el glitch de la animación
 * predictiva de Chrome 116+ en Android 14+).
 *
 * En Web/PWA, usa una "trampa" en el History API inyectando un estado dummy.
 */

type Entry = { id: number; run: () => void };

const stack: Entry[] = [];
let nextId = 0;
let teardown: (() => void) | null = null;

/** Ejecuta solo el handler del tope de la pila. */
function dispatch() {
  const top = stack[stack.length - 1];
  top?.run();
}

function installListener() {
  if (teardown || typeof window === "undefined") return;

  if (Capacitor.isNativePlatform()) {
    const handle = App.addListener("backButton", dispatch);
    teardown = () => {
      handle.then((l) => l.remove());
    };
    return;
  }

  // --- Web / PWA: trampa de historial ---
  let armed = true;
  window.history.pushState({ __rogueTrap: true }, "");
  const onPopState = () => {
    dispatch();
    // Re-arma para seguir capturando mientras quede algo en la pila.
    if (armed && stack.length > 0) {
      window.history.pushState({ __rogueTrap: true }, "");
    }
  };
  window.addEventListener("popstate", onPopState);
  teardown = () => {
    armed = false;
    window.removeEventListener("popstate", onPopState);
    // Si se cerró por otra vía y nuestra entrada sigue arriba, la retiramos.
    if (window.history.state?.__rogueTrap) window.history.back();
  };
}

function removeListener() {
  teardown?.();
  teardown = null;
}

export function useBackButton(active: boolean, onBack: () => void) {
  // El handler se lee por referencia: así cambiar la función (p.ej. una closure
  // que depende de estado) no obliga a desmontar y remontar la entrada de la
  // pila, que alteraría su orden.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const entry: Entry = { id: nextId++, run: () => onBackRef.current() };
    stack.push(entry);
    if (stack.length === 1) installListener();

    return () => {
      const i = stack.findIndex((e) => e.id === entry.id);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) removeListener();
    };
  }, [active]);
}
