import { forwardRef, type ButtonHTMLAttributes } from "react";

import { Button } from "@/components/ui/button";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  "aria-label"?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, title, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      size="icon"
      variant="ghost"
      aria-label={props["aria-label"] ?? label}
      title={title ?? label}
      {...props}
    />
  );
});
