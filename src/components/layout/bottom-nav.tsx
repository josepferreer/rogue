"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Dumbbell, Home, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Hoy", icon: Home },
  { href: "/rutinas", label: "Rutinas", icon: CalendarDays },
  { href: "/biblioteca", label: "Ejercicios", icon: Dumbbell },
  { href: "/rangos", label: "Rangos", icon: Shield },
  { href: "/ajustes", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      <nav
        className={cn(
          "pointer-events-auto mx-auto flex max-w-sm items-center justify-between gap-1 rounded-[28px] px-2 py-2",
          "border border-white/60 bg-white/70 shadow-[0_10px_40px_-8px_rgba(23,24,28,0.25)] backdrop-blur-2xl",
          "dark:border-white/10 dark:bg-white/10 dark:shadow-[0_10px_40px_-8px_rgba(0,0,0,0.55)]"
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
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-1.5 transition-colors",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
              <span className="text-[10px] font-medium leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
