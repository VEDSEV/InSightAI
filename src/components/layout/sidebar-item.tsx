import Link from "next/link";

import type { NavigationItem } from "@/components/layout/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SidebarItemProps = {
  item: NavigationItem;
  active?: boolean;
  onNavigate?: () => void;
};

const itemClassName =
  "group flex min-h-11 w-full items-center gap-3 rounded-button px-3 text-sm font-medium transition-[background-color,color] duration-fast focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/35 motion-reduce:transition-none";

export function SidebarItem({ active = false, item, onNavigate }: SidebarItemProps) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon
        aria-hidden="true"
        className={cn(
          "size-[1.125rem] shrink-0",
          active ? "text-primary" : "text-muted-foreground",
        )}
        strokeWidth={1.8}
      />
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
      {!item.enabled ? <Badge className="px-2 text-[0.625rem]">Soon</Badge> : null}
    </>
  );

  if (!item.enabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(itemClassName, "text-muted-foreground cursor-not-allowed opacity-70")}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        itemClassName,
        active
          ? "bg-primary-soft text-primary-strong shadow-control"
          : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
      )}
    >
      {content}
    </Link>
  );
}
