import Link from "next/link";
import { Settings } from "lucide-react";

export function TopBar() {
  return (
    <header className="flex items-center justify-between px-5 pt-6 pb-2">
      <div className="flex items-center gap-2">
        <span className="relative inline-block size-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-mark-black.png"
            alt=""
            width={24}
            height={24}
            className="absolute inset-0 size-full object-contain dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-mark-white.png"
            alt=""
            width={24}
            height={24}
            className="absolute inset-0 hidden size-full object-contain dark:block"
          />
        </span>
        <span className="font-mono text-xs tracking-[0.25em] text-muted-foreground">
          ROGUE
        </span>
      </div>
      <Link
        href="/ajustes"
        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Ajustes"
      >
        <Settings className="size-5" />
      </Link>
    </header>
  );
}
