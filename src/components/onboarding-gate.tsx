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
      if (pathname !== "/onboarding") router.replace("/onboarding");
      return;
    }
    if (pathname === "/login" || pathname === "/onboarding") {
      router.replace("/");
    }
  }, [hydrated, authenticated, profile.onboarded, pathname, router]);

  return null;
}
