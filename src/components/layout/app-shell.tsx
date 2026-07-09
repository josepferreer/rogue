"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { CardioMiniPlayer } from "@/components/cardio/cardio-mini-player";
import { RouteTrackerModal } from "@/components/cardio/route-tracker-modal";
import { WorkoutMiniPlayer } from "@/components/workout/workout-mini-player";
import { WorkoutSessionModal } from "@/components/workout/workout-session-modal";

/** Paginas que gestionan su propio layout completo (cabecera, scroll, ancho):
 *  no reciben el padding/max-width del AppShell ni la barra inferior. */
function isFullBleed(pathname: string) {
  return pathname === "/onboarding" || pathname === "/perfil";
}

/** El onboarding es el unico flujo sin navegacion principal, en cualquier
 *  tamano de pantalla (primer uso, aun no hay perfil configurado). */
function hidesSidebar(pathname: string) {
  return pathname === "/onboarding";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = isFullBleed(pathname);
  const showSidebar = !hidesSidebar(pathname);

  return (
    <div className="flex min-h-dvh bg-background">
      {showSidebar && <Sidebar />}
      <div
        id="app-shell"
        className="relative flex h-dvh w-full flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0"
      >
        {fullBleed ? (
          <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
        ) : (
          <>
            <TopBar />
            <main className="mx-auto w-full flex-1 overflow-y-auto px-5 pt-8 pb-28 md:max-w-2xl md:pb-12">
              {children}
            </main>
            <CardioMiniPlayer />
            <WorkoutMiniPlayer />
            <BottomNav />
            <RouteTrackerModal />
            <WorkoutSessionModal />
          </>
        )}
      </div>
    </div>
  );
}
