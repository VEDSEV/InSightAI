"use client";

import { useId } from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

type TooltipProps = {
  content: string;
  label?: string;
  className?: string;
};

export function Tooltip({ className, content, label = "More information" }: TooltipProps) {
  const tooltipId = useId();

  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-focus/35 inline-flex size-7 items-center justify-center rounded-full transition-colors duration-fast focus-visible:outline-none focus-visible:ring-3 motion-reduce:transition-none"
      >
        <Info aria-hidden="true" className="size-3.5" strokeWidth={1.9} />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="border-border bg-foreground text-background pointer-events-none invisible absolute top-[calc(100%+0.4rem)] left-1/2 z-50 w-56 -translate-x-1/2 rounded-tooltip border px-3 py-2 text-xs leading-5 opacity-0 shadow-overlay transition-[opacity,visibility] duration-fast group-focus-within/tooltip:visible group-focus-within/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:opacity-100 motion-reduce:transition-none"
      >
        {content}
      </span>
    </span>
  );
}
