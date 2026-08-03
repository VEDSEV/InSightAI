import type { ReactNode } from "react";

import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-screen lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="bg-foreground text-background focus-visible:ring-focus fixed top-3 left-3 z-[100] -translate-y-20 rounded-button px-4 py-2 text-sm font-semibold shadow-overlay transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-3 motion-reduce:transition-none"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="min-w-0">
        <MobileNavigation />
        <main id="main-content" tabIndex={-1} className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
