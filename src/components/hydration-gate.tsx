"use client";

import { useRogue } from "@/lib/store/rogue-store";

/** Evita el parpadeo de datos vacios/por defecto mientras se lee el estado
 *  guardado en localStorage (perfil, sesiones, rutina). */
export function HydrationGate({ children }: { children: React.ReactNode }) {
  const { hydrated } = useRogue();

  if (!hydrated) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <span className="flex size-14 animate-pulse items-center justify-center rounded-2xl bg-accent text-lg font-semibold text-accent-foreground">
          R
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
