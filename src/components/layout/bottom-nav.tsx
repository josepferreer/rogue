"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";
import { cn } from "@/lib/utils";
import { useBackButton } from "@/lib/use-back-button";

/** Navegacion inferior, solo en movil/tablet (el escritorio usa Sidebar). */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Activar la trampa del botón "atrás" solo si estamos exactamente en la raíz
  // de una pestaña que no sea el Home. Si estamos dentro de una sub-página
  // (ej. /app/rutinas/123), queremos el comportamiento nativo de "atrás".
  const isOtherRootTab = NAV_ITEMS.some(
    (item) => item.href !== "/app" && pathname === item.href
  );

  useBackButton(isOtherRootTab, () => {
    router.replace("/app");
  });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
      <nav
        className={cn(
          "pointer-events-auto mx-auto flex w-full items-center justify-between gap-0 rounded-[28px] px-1.5 py-1.5",
          "bg-white/70 shadow-[0_10px_40px_-8px_rgba(23,24,28,0.25)] backdrop-blur-2xl",
          "dark:bg-white/10 dark:shadow-[0_10px_40px_-8px_rgba(0,0,0,0.55)]"
        )}
      >
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              replace
              aria-label={item.label}
              className={cn(
                "flex items-center justify-center rounded-full px-3.5 py-3.5 transition-colors",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
              {/* La etiqueta se renderiza SIEMPRE y se colapsa con `max-width`.
                  Montándola y desmontándola no hay nada que animar: el ancho de
                  la píldora pegaba un salto seco en cada navegación.

                  `max-width` y no `grid-template-columns` (que daría el ancho
                  exacto): la interpolación de las pistas de grid es reciente y
                  no la tienen todos los motores, y esto tiene que verse igual en
                  el WebView del APK que en un Safari viejo. El tope, 6rem, está
                  muy por encima de la etiqueta más ancha ("Comidas", 54 px), así
                  que no recorta ni con el texto del sistema agrandado; a cambio
                  la etiqueta llega a su ancho final algo antes de que termine la
                  transición, que no se nota. */}
              <span
                className={cn(
                  "overflow-hidden whitespace-nowrap text-xs font-medium leading-none",
                  "transition-[max-width,opacity,padding] duration-200 ease-out",
                  active ? "max-w-24 pl-1 opacity-100" : "max-w-0 pl-0 opacity-0"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
