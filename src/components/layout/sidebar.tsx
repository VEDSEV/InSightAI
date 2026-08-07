import Image from "next/image";
import { DatabaseZap } from "lucide-react";

import { primaryNavigation } from "@/components/layout/navigation";
import { SidebarItem } from "@/components/layout/sidebar-item";
import { Badge } from "@/components/ui/badge";
import { appConfig } from "@/lib/app-config";

export function Sidebar() {
  return (
    <aside className="border-border bg-surface sticky top-0 hidden h-dvh border-r lg:flex lg:flex-col">
      <div className="flex h-18 items-center gap-3 px-5">
        <Image src="/brand-mark.svg" alt="" width={32} height={32} priority />
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-semibold tracking-[-0.02em]">
            {appConfig.name}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[0.6875rem]">Commerce intelligence</p>
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3 py-5">
        <p className="text-muted-foreground px-3 pb-2 text-[0.625rem] font-bold tracking-[0.14em] uppercase">
          Workspace
        </p>
        <ul className="space-y-1">
          {primaryNavigation.map((item) => (
            <li key={item.id}>
              <SidebarItem item={item} active={item.id === "overview"} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-border border-t p-4">
        <div className="border-border bg-surface-subtle/60 rounded-card border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <DatabaseZap aria-hidden="true" className="size-3.5" />
              Demo workspace
            </span>
            <Badge variant="neutral">Demo data</Badge>
          </div>
          <p className="text-muted-foreground mt-2 text-[0.6875rem] leading-4.5">
            Sample commerce data for exploring the dashboard.
          </p>
        </div>
      </div>
    </aside>
  );
}
