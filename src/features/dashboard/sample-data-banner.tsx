import { FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { previewWorkspace } from "@/features/dashboard/preview-data";

export function SampleDataBanner() {
  return (
    <aside
      aria-label="Demonstration data notice"
      className="border-primary/20 bg-primary-soft/70 flex flex-col gap-3 rounded-card border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="bg-surface text-primary flex size-8 shrink-0 items-center justify-center rounded-button shadow-control">
          <FlaskConical aria-hidden="true" className="size-4" />
        </span>
        <div>
          <p className="text-primary-strong text-sm font-semibold">
            {previewWorkspace.dataLabel} · Not connected to business data
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-5">
            Every value on this page is synthetic and exists only to review layout, hierarchy, and
            states.
          </p>
        </div>
      </div>
      <Badge variant="primary" className="self-start sm:self-auto">
        Phase 1 visual preview
      </Badge>
    </aside>
  );
}
