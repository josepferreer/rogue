"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRogue } from "@/lib/store/rogue-store";

/** Exige sesion de Supabase y onboarding completado antes de usar la app. */
export function OnboardingGate() {
  const { hydrated, authenticated, profile } = useRogue();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;

    if (!authenticated) {
      if (pathname !== "/login") router.replace("/login");
      return;
    }
    if (!profile.onboarded) {
      if (pathname !== "/app/onboarding") router.replace("/app/onboarding");
      return;
    }
    if (pathname === "/app/onboarding") {
      router.replace("/app");
    }
  }, [hydrated, authenticated, profile.onboarded, pathname, router]);

  return null;
}
