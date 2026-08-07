"use client";

import { useEffect, useRef } from "react";

/**
 * Cierra un modal con Escape.
 *
 * Los modales se cierran pulsando el fondo (`<div onClick={onClose}>`), que con
 * teclado no existe: sin esto, quien no use raton o tactil se queda atrapado
 * dentro salvo que acierte con el boton de cerrar. El fondo no puede ser un
 * <button> (envuelve al contenido), asi que la via de teclado es esta.
 *
 * Los modales se anidan (planificador -> hoja de comida, despensa -> dialogo de
 * confirmacion), asi que se lleva una PILA y Escape solo cierra el de encima.
 * Con un listener por modal, una sola pulsacion los cerraria todos de golpe.
 */
const stack: Array<() => void> = [];

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (top) {
    e.stopPropagation();
    top();
  }
}

export function useEscapeToClose(open: boolean, onClose: () => void) {
  // El callback va por ref y el efecto solo depende de `open`. Si dependiera de
  // `onClose` (casi siempre una arrow nueva por render), cada render del padre
  // lo sacaria y lo volveria a meter EN LA CIMA de la pila, colandose por
  // delante del modal hijo que si esta abierto.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const entry = () => onCloseRef.current();
    if (stack.length === 0) {
      document.addEventListener("keydown", onKeyDown, true);
    }
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) {
        document.removeEventListener("keydown", onKeyDown, true);
      }
    };
  }, [open]);
}
