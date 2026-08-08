import { DatabaseZap, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/features/dashboard/presentation-formatters";

type SampleDataBannerProps = {
  readonly datasetVersion: string;
  readonly rowCount: number;
  readonly timezone: string;
  readonly source?: "demo" | "uploaded";
  readonly filename?: string | null;
};

export function SampleDataBanner({
  datasetVersion,
  rowCount,
  timezone,
  source = "demo",
  filename = null,
}: SampleDataBannerProps) {
  const demo = source === "demo";
  return (
    <aside
      aria-label={demo ? "Demo data notice" : "Uploaded dataset notice"}
      className="border-border bg-surface-subtle/70 flex flex-col gap-2.5 rounded-card border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="bg-surface text-primary flex size-8 shrink-0 items-center justify-center rounded-button shadow-control">
          <DatabaseZap aria-hidden="true" className="size-4" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={demo ? "primary" : "success"}>
              {demo ? "Demo data" : "Session data"}
            </Badge>
            <p className="text-foreground text-sm font-semibold">
              {demo ? "Demo commerce dataset" : (filename ?? "Uploaded commerce dataset")}
            </p>
          </div>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {demo
              ? "No real customer data. Explore representative order performance and business signals."
              : "Prepared in this browser session. It is not uploaded, persisted, or sent to AI."}
          </p>
        </div>
      </div>
      <details className="text-muted-foreground self-start text-xs sm:self-auto">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium hover:text-foreground [&::-webkit-details-marker]:hidden">
          <Info aria-hidden="true" className="size-3.5" />
          {demo ? "About this sample" : "About this session dataset"}
        </summary>
        <p className="mt-2 max-w-xs leading-5">
          {formatCount(rowCount)} order lines · {datasetVersion} · {timezone} business-day time
          zone.
        </p>
      </details>
    </aside>
  );
}
