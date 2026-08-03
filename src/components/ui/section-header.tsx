import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  titleId?: string;
};

export function SectionHeader({
  action,
  className,
  description,
  eyebrow,
  title,
  titleId,
}: SectionHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div>
        {eyebrow ? (
          <p className="text-primary mb-2 text-[0.6875rem] font-bold tracking-[0.12em] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h2
          id={titleId}
          className="text-foreground text-lg font-semibold tracking-[-0.02em] sm:text-xl"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-6">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
