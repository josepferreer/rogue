"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";
import { cn } from "@/lib/utils";

/** Navegacion inferior, solo en movil/tablet (el escritorio usa Sidebar). */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
      <nav
        className={cn(
          "pointer-events-auto mx-auto flex w-[96%] max-w-md items-center justify-between gap-0.5 rounded-[28px] px-1.5 py-1.5",
          "bg-white/70 shadow-[0_10px_40px_-8px_rgba(23,24,28,0.25)] backdrop-blur-2xl",
          "dark:bg-white/10 dark:shadow-[0_10px_40px_-8px_rgba(0,0,0,0.55)]"
        )}
      >
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                "flex items-center justify-center gap-1 rounded-full px-2 py-2.5 transition-colors",
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
