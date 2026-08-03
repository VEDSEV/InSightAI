import type { ReactNode, TableHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TableShellProps = TableHTMLAttributes<HTMLTableElement> & {
  caption: string;
  children: ReactNode;
};

export function TableShell({ caption, children, className, ...props }: TableShellProps) {
  return (
    <div className="border-border overflow-x-auto rounded-control border">
      <table className={cn("w-full min-w-180 border-collapse text-left", className)} {...props}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
