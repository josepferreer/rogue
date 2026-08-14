"use client";

import { usePathname } from "next/navigation";

/**
 * Transición de entrada al cambiar de página (fade + 8px de subida, 200 ms).
 * La animación vive en `globals.css` (`.page-transition` / `@keyframes
 * page-in`); aquí solo se le da una `key` nueva para que el navegador la
 * rearranque en cada navegación.
 *
 * La key es el `pathname` PELADO, sin search params, y por dos motivos:
 *  - cambiar la key remonta el subárbol. Entre páginas distintas eso pasa de
 *    todos modos, pero incluir los params haría que un simple `?tab=buscar`
 *    tirase el estado de la página y repitiese sus fetches.
 *  - un cambio de params no es un cambio de pantalla; animarlo se ve como un
 *    parpadeo, no como una transición.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
