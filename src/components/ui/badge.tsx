import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-[0.01em]",
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-subtle text-muted-foreground",
        primary: "border-primary/20 bg-primary-soft text-primary-strong",
        success: "border-success/20 bg-success-soft text-success-strong",
        warning: "border-warning/20 bg-warning-soft text-warning-strong",
        destructive: "border-destructive/20 bg-destructive-soft text-destructive-strong",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ className, variant }))} {...props} />;
}
