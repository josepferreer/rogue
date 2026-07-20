import { AppShell } from "@/components/layout/app-shell";
import { HydrationGate } from "@/components/hydration-gate";
import { RogueProvider } from "@/lib/store/rogue-store";
import { CardioProvider } from "@/lib/store/cardio-store";
import { WorkoutSessionProvider } from "@/lib/store/workout-session-store";
import { MealsProvider } from "@/lib/store/meals-store";
import { OnboardingGate } from "@/components/onboarding-gate";
import { SyncErrorToast } from "@/components/sync-error-toast";

/**
 * Layout de la aplicacion autenticada (`/app/*`). Aqui viven todos los stores
 * y el AppShell: la landing publica (`/`) y el login quedan fuera, asi no
 * cargan los contextos ni el dataset de ejercicios (mejor SEO y arranque).
 * El guard de sesion lo hace `proxy.ts` en servidor; OnboardingGate solo
 * resuelve el paso de onboarding en cliente.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <RogueProvider>
      <WorkoutSessionProvider>
        <MealsProvider>
          <CardioProvider>
            <HydrationGate>
              <AppShell>{children}</AppShell>
            </HydrationGate>
            <OnboardingGate />
            <SyncErrorToast />
          </CardioProvider>
        </MealsProvider>
      </WorkoutSessionProvider>
    </RogueProvider>
  );
}
