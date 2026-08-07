import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, FileSearch } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import type { DashboardMetric } from "@/features/dashboard/analytics-adapter";
import {
  formatComparison,
  formatMetricCompactValue,
} from "@/features/dashboard/presentation-formatters";
import { cn } from "@/lib/utils";

const directionStyle = {
  positive: { icon: ArrowUpRight, className: "text-success-strong bg-success-soft" },
  negative: { icon: ArrowDownRight, className: "text-destructive-strong bg-destructive-soft" },
  neutral: { icon: ArrowRight, className: "text-muted-foreground bg-surface-subtle" },
} as const;

type KpiCardProps = {
  readonly metric: DashboardMetric;
  readonly title?: string;
  readonly explanation: string;
  readonly icon?: LucideIcon;
  readonly onInspectEvidence: () => void;
};

export function KpiCard({
  explanation,
  icon: Icon,
  metric,
  onInspectEvidence,
  title,
}: KpiCardProps) {
  const label = title ?? metric.result.label;
  const comparison = formatComparison(metric.comparison);
  const DirectionIcon = directionStyle[comparison.direction].icon;
  const unavailable = metric.result.status !== "ok";

  return (
    <Card className="group relative min-w-0 overflow-hidden p-4 shadow-card transition-[border-color,box-shadow,transform] duration-base hover:border-border-strong hover:shadow-card-hover sm:p-5 motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span className="bg-surface-subtle text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-button">
              <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
            </span>
          ) : null}
          <h3 className="text-muted-foreground truncate text-xs font-semibold">{label}</h3>
        </div>
        <Tooltip content={explanation} label={`Explain ${label}`} />
      </div>

      <div className="mt-4">
        <p className="text-[1.75rem] font-semibold tracking-[-0.045em] tabular-nums sm:text-[1.9rem]">
          {unavailable ? "—" : formatMetricCompactValue(metric.result.value)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            aria-label={comparison.accessibleLabel}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.6875rem] font-bold tabular-nums",
              directionStyle[comparison.direction].className,
            )}
          >
            <DirectionIcon aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
            {comparison.label}
          </span>
          <span className="text-muted-foreground text-[0.6875rem]">
            {metric.comparison?.comparisonPeriod
              ? `vs. ${metric.comparison.comparisonPeriod.start} to ${metric.comparison.comparisonPeriod.end}`
              : unavailable
                ? metric.result.message
                : "vs. previous year when available"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onInspectEvidence}
        className="text-primary mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-button text-xs font-semibold underline-offset-4 hover:text-primary-hover hover:underline focus-visible:outline-none"
        aria-label={`Inspect evidence for ${label}`}
      >
        <FileSearch aria-hidden="true" className="size-3.5" />
        Inspect evidence
      </button>
      <span className="bg-primary absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-base group-hover:scale-x-100 motion-reduce:transition-none" />
    </Card>
  );
}
