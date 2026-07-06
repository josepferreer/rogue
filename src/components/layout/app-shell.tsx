import { BottomNav } from "./bottom-nav";
import { TopBar } from "./top-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-muted/50 dark:bg-black">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-background md:my-6 md:h-[calc(100dvh-3rem)] md:max-w-[440px] md:rounded-[2.5rem] md:border md:border-border md:shadow-2xl">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-5 pb-4">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
