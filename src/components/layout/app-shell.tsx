"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./bottom-nav";
import { TopBar } from "./top-bar";

/** Rutas inmersivas: sin barras, a pantalla completa. */
function isImmersive(pathname: string) {
  return pathname === "/onboarding" || pathname.startsWith("/entrenar");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const immersive = isImmersive(pathname);

  return (
    <div className="flex min-h-dvh justify-center bg-muted/50 dark:bg-black">
      <div id="app-shell" className="relative flex h-dvh w-full flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] md:my-6 md:h-[calc(100dvh-3rem)] md:max-w-[440px] md:rounded-[2.5rem] md:border md:border-border md:shadow-2xl md:pt-0">
        {immersive ? (
          <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
        ) : (
          <>
            <TopBar />
            <main className="flex-1 overflow-y-auto px-5 pb-28">{children}</main>
            <BottomNav />
          </>
        )}
      </div>
    </div>
  );
}
