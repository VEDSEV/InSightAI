import Image from "next/image";

import { appConfig } from "@/lib/app-config";

export function SiteHeader() {
  return (
    <header className="border-border/80 border-b bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <Image src="/brand-mark.svg" alt="" width={30} height={30} priority />
          <span className="text-foreground text-base font-semibold tracking-tight">
            {appConfig.name}
          </span>
        </div>
        <span className="border-border bg-surface text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium">
          Phase {appConfig.currentPhase} · Foundation
        </span>
      </div>
    </header>
  );
}
