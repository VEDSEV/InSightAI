"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

import { primaryNavigation } from "@/components/layout/navigation";
import { SidebarItem } from "@/components/layout/sidebar-item";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { appConfig } from "@/lib/app-config";
import { cn } from "@/lib/utils";

const focusableSelector =
  'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = toggleRef.current;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(focusableSelector);
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <div className="border-border bg-surface/95 sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 backdrop-blur-lg lg:hidden">
        <div className="flex items-center gap-2.5">
          <Image src="/brand-mark.svg" alt="" width={30} height={30} priority />
          <span className="text-sm font-semibold tracking-[-0.02em]">{appConfig.name}</span>
        </div>
        <IconButton
          ref={toggleRef}
          label="Open navigation"
          aria-expanded={open}
          aria-controls="mobile-navigation-panel"
          onClick={() => setOpen(true)}
        >
          <Menu aria-hidden="true" className="size-5" />
        </IconButton>
      </div>

      <div
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[2px] transition-opacity duration-base lg:hidden motion-reduce:transition-none",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div
          ref={panelRef}
          id="mobile-navigation-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={cn(
            "bg-surface flex h-full w-[min(88vw,22rem)] flex-col shadow-overlay transition-transform duration-base motion-reduce:transition-none",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="border-border flex h-16 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2.5">
              <Image src="/brand-mark.svg" alt="" width={30} height={30} />
              <span className="text-sm font-semibold">{appConfig.name}</span>
            </div>
            <IconButton label="Close navigation" onClick={() => setOpen(false)}>
              <X aria-hidden="true" className="size-5" />
            </IconButton>
          </div>
          <nav aria-label="Mobile primary" className="flex-1 overflow-y-auto px-3 py-5">
            <ul className="space-y-1">
              {primaryNavigation.map((item) => (
                <li key={item.id}>
                  <SidebarItem
                    item={item}
                    active={item.id === "overview"}
                    onNavigate={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          </nav>
          <div className="border-border border-t p-4">
            <Badge variant="neutral">Demo data</Badge>
          </div>
        </div>
      </div>
    </>
  );
}
