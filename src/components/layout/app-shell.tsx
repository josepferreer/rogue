"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { CardioMiniPlayer } from "@/components/cardio/cardio-mini-player";
import { WorkoutMiniPlayer } from "@/components/workout/workout-mini-player";
import { WorkoutSessionModal } from "@/components/workout/workout-session-modal";
import { NotificationStack } from "@/components/ui/notification-stack";

// Carga dinámica para cortar la cadena de imports estáticos hacia maplibre-gl.
// Si se importa directamente, Turbopack traza: layout(Server) → app-shell →
// route-tracker-modal → map-view → maplibre-gl.mjs, y falla al analizar
// el `new URL('./worker.mjs', import.meta.url)` de maplibre en build-time.
const RouteTrackerModal = dynamic(
  () => import("@/components/cardio/route-tracker-modal").then((m) => ({ default: m.RouteTrackerModal })),
  { ssr: false }
);

/** Paginas que gestionan su propio layout completo (cabecera, scroll, ancho):
 *  no reciben el padding/max-width del AppShell ni la barra inferior. */
function isFullBleed(pathname: string) {
  return pathname === "/app/onboarding";
}

/** Onboarding es el unico flujo dentro de la app sin navegacion principal, en
 *  cualquier tamano de pantalla (el perfil aun no esta configurado). El login
 *  vive fuera del AppShell (zona publica). */
function hidesSidebar(pathname: string) {
  return pathname === "/app/onboarding";
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
            <main className="mx-auto w-full flex-1 overflow-y-auto px-5 pb-28 md:max-w-2xl md:pb-12">
              {children}
            </main>
            <CardioMiniPlayer />
            <WorkoutMiniPlayer />
            <NotificationStack />
            <BottomNav />
            <RouteTrackerModal />
            <WorkoutSessionModal />
          </>
        )}
      </div>
    </div>
  );
}
