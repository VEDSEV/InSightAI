import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-button border text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-fast focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:active:translate-y-px motion-reduce:transition-none",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-white shadow-button hover:border-primary-hover hover:bg-primary-hover",
        secondary:
          "border-border-strong bg-surface text-foreground shadow-control hover:bg-surface-subtle",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
        destructive:
          "border-destructive bg-destructive text-white hover:border-destructive-strong hover:bg-destructive-strong",
      },
      size: {
        sm: "min-h-9 px-3 text-xs",
        default: "px-4",
        icon: "size-10 min-h-10 shrink-0 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size, type = "button", variant, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
    />
  );
});
