"use client";

import { useRogue } from "@/lib/store/rogue-store";

/** Evita el parpadeo de datos vacios/por defecto mientras se lee el estado
 *  guardado en localStorage (perfil, sesiones, rutina). */
export function HydrationGate({ children }: { children: React.ReactNode }) {
  const { hydrated } = useRogue();

  if (!hydrated) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <div className="animate-pulse">
          <img src="/brand/logo-mark-black.png" alt="Rogue" className="size-16 block dark:hidden" />
          <img src="/brand/logo-mark-white.png" alt="Rogue" className="size-16 hidden dark:block" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
