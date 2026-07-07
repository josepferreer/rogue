"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Dumbbell, Home, Shield, Footprints } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/rutinas", label: "Rutinas", icon: CalendarDays },
  { href: "/cardio", label: "Cardio", icon: Footprints },
  { href: "/biblioteca", label: "Ejercicios", icon: Dumbbell },
  { href: "/rangos", label: "Rangos", icon: Shield },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      <nav
        className={cn(
          "pointer-events-auto mx-auto flex max-w-sm items-center justify-between gap-1 rounded-[28px] px-2 py-2",
          "bg-white/70 shadow-[0_10px_40px_-8px_rgba(23,24,28,0.25)] backdrop-blur-2xl",
          "dark:bg-white/10 dark:shadow-[0_10px_40px_-8px_rgba(0,0,0,0.55)]"
        )}
      >
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-full px-3 py-2 transition-colors",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
              {active && (
                <span className="text-xs font-medium leading-none">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
