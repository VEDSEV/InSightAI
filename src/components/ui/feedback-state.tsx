import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox, LoaderCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type FeedbackStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  compact?: boolean;
};

export function LoadingState({
  description = "Preparing the dashboard preview.",
  title = "Loading workspace",
}: Partial<FeedbackStateProps>) {
  return (
    <Card role="status" aria-live="polite" className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <LoaderCircle
          aria-hidden="true"
          className="text-primary size-4 motion-safe:animate-spin motion-reduce:animate-none"
        />
        {title}
      </div>
      <p className="text-muted-foreground mt-2 text-xs leading-5">{description}</p>
      <div className="mt-5 space-y-3">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Card>
  );
}

export function EmptyState({
  compact = false,
  description,
  icon: Icon = Inbox,
  title,
}: FeedbackStateProps) {
  return (
    <Card
      role="status"
      className={cn(
        "flex flex-col items-center justify-center p-6 text-center",
        !compact && "min-h-52",
      )}
    >
      <span className="border-border bg-surface-subtle text-muted-foreground flex size-10 items-center justify-center rounded-full border">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 max-w-sm text-xs leading-5">{description}</p>
    </Card>
  );
}

export function ErrorState({
  compact = false,
  description,
  icon: Icon = CircleAlert,
  title,
}: FeedbackStateProps) {
  return (
    <Card
      role="alert"
      className={cn(
        "border-destructive/25 bg-destructive-soft/35 flex flex-col items-center justify-center p-6 text-center",
        !compact && "min-h-52",
      )}
    >
      <span className="border-destructive/20 bg-surface text-destructive flex size-10 items-center justify-center rounded-full border">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 max-w-sm text-xs leading-5">{description}</p>
    </Card>
  );
}
