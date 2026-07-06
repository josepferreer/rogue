export function TopBar() {
  return (
    <header className="flex items-center px-5 pt-6 pb-2">
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
    </header>
  );
}
