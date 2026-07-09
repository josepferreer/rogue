"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";
import { useRogue } from "@/lib/store/rogue-store";
import { cn } from "@/lib/utils";

/** Navegacion lateral, solo en escritorio (el movil usa BottomNav). */
export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useRogue();

  const initials =
    profile.name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "R";

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 md:flex">
      <Link href="/" className="flex items-center gap-2 px-2">
        <Image
          src="/brand/logo-mark-black.png"
          alt=""
          width={28}
          height={28}
          className="dark:hidden"
        />
        <Image
          src="/brand/logo-mark-white.png"
          alt=""
          width={28}
          height={28}
          className="hidden dark:block"
        />
        <span className="font-mono text-sm font-medium tracking-[0.2em]">
          ROGUE
        </span>
      </Link>

      <nav className="mt-8 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/perfil"
        className={cn(
          "mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted",
          pathname === "/perfil" && "bg-muted"
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {profile.name || "Atleta"}
          </p>
          <p className="truncate text-xs text-muted-foreground">Tu perfil</p>
        </div>
      </Link>
    </aside>
  );
}
