import { CalendarRange } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SelectControl } from "@/components/ui/select-control";

export function SiteHeader() {
  return (
    <header className="border-border bg-surface border-b">
      <div className="mx-auto flex max-w-[100rem] flex-col gap-5 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[1.75rem]">
              Overview
            </h1>
            <Badge variant="primary">Sample workspace</Badge>
          </div>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-6">
            Monitor the signals that will shape weekly commerce decisions.
          </p>
        </div>
        <div className="border-border bg-surface-subtle flex items-center gap-3 rounded-card border p-2.5 sm:self-start">
          <span className="bg-surface text-primary hidden size-9 items-center justify-center rounded-button shadow-control sm:flex">
            <CalendarRange aria-hidden="true" className="size-4" />
          </span>
          <SelectControl id="global-date-range" label="Global date range" value="Last 90 days" />
        </div>
      </div>
    </header>
  );
}
