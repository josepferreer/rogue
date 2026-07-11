"use client";

import Image from "next/image";
import { useRogue } from "@/lib/store/rogue-store";

/** Evita el parpadeo de datos vacios/por defecto mientras se lee el estado
 *  guardado en localStorage (perfil, sesiones, rutina). */
export function HydrationGate({ children }: { children: React.ReactNode }) {
  const { hydrated } = useRogue();

  if (!hydrated) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <Image
          src="/brand/logo-mark-black.png"
          alt="Rogue"
          width={56}
          height={56}
          priority
          className="size-14 animate-pulse dark:hidden"
        />
        <Image
          src="/brand/logo-mark-white.png"
          alt="Rogue"
          width={56}
          height={56}
          priority
          className="hidden size-14 animate-pulse dark:block"
        />
      </div>
    );
  }

  return <>{children}</>;
}
