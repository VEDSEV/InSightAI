import { DatabaseZap, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/features/dashboard/presentation-formatters";

type SampleDataBannerProps = {
  readonly datasetVersion: string;
  readonly rowCount: number;
  readonly timezone: string;
};

export function SampleDataBanner({ datasetVersion, rowCount, timezone }: SampleDataBannerProps) {
  return (
    <aside
      aria-label="Demo data notice"
      className="border-border bg-surface-subtle/70 flex flex-col gap-2.5 rounded-card border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="bg-surface text-primary flex size-8 shrink-0 items-center justify-center rounded-button shadow-control">
          <DatabaseZap aria-hidden="true" className="size-4" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">Demo data</Badge>
            <p className="text-foreground text-sm font-semibold">Demo commerce dataset</p>
          </div>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            No real customer data. Explore representative order performance and business signals.
          </p>
        </div>
      </div>
      <details className="text-muted-foreground self-start text-xs sm:self-auto">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium hover:text-foreground [&::-webkit-details-marker]:hidden">
          <Info aria-hidden="true" className="size-3.5" />
          About this sample
        </summary>
        <p className="mt-2 max-w-xs leading-5">
          {formatCount(rowCount)} order lines · {datasetVersion} · {timezone} business-day time
          zone.
        </p>
      </details>
    </aside>
  );
}
