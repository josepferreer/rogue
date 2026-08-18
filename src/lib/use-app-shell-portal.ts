"use client";

import { useEffect, useState } from "react";

/**
 * Nodo donde se monta contenido por portal, buscado por id.
 *
 * NO se puede resolver durante el render, y tampoco basta con mirarlo una sola
 * vez tras montar: `HydrationGate` no pinta nada hasta que hidrata el store,
 * asi que hay componentes (los que cuelgan del layout FUERA del gate: NOA, el
 * aviso de sync) que se montan cuando el nodo destino todavia no existe.
 * Mirandolo una vez, el destino quedaba en null para siempre y esos
 * componentes no llegaban a aparecer nunca.
 *
 * Por eso reintenta hasta encontrarlo. Para los modales, que se montan con el
 * shell ya pintado, lo encuentra al primer intento.
 *
 * El reintento va con temporizador y NO con requestAnimationFrame: el
 * navegador no ejecuta rAF en una pestaña que no se esta pintando (segundo
 * plano, app minimizada, pestaña oculta). Si la app arrancaba asi, el destino
 * se quedaba en null PARA SIEMPRE —ni volviendo al primer plano se arreglaba,
 * porque la cadena de reintentos ya se habia cortado— y NOA no aparecia hasta
 * recargar. Los temporizadores sí corren en segundo plano (mas espaciados, que
 * para esto da igual).
 */
export function usePortalTarget(id: string): Element | null {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    let timer = 0;
    const find = () => {
      const el = document.getElementById(id);
      if (el) setTarget(el);
      else timer = window.setTimeout(find, 50);
    };
    find();
    return () => clearTimeout(timer);
  }, [id]);

  return target;
}

/** Destino de los modales: el frame de la app (`#app-shell`). */
export function useAppShellPortal(): Element | null {
  return usePortalTarget("app-shell");
}
