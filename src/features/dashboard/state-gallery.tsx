import { ChevronDown } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback-state";

export function StateGallery() {
  return (
    <details className="border-border bg-surface group rounded-card border shadow-card">
      <summary className="focus-visible:ring-focus/35 flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-card px-5 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <span>
          Component state gallery
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            Design QA · non-production
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="text-muted-foreground size-4 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-border grid gap-4 border-t p-5 md:grid-cols-3">
        <LoadingState />
        <EmptyState
          compact
          title="No matching rows"
          description="This state will explain when a valid dataset has no rows in the active filter context."
        />
        <ErrorState
          compact
          title="Preview unavailable"
          description="This state preserves unaffected content and explains the next safe recovery step."
        />
      </div>
    </details>
  );
}
