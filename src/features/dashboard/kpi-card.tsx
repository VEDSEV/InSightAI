import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import type { PreviewKpi, PreviewTrend } from "@/features/dashboard/preview-data";
import { cn } from "@/lib/utils";

const trendConfig: Record<PreviewTrend, { icon: LucideIcon; className: string }> = {
  positive: { icon: ArrowUpRight, className: "text-success-strong bg-success-soft" },
  negative: { icon: ArrowDownRight, className: "text-destructive-strong bg-destructive-soft" },
  neutral: { icon: ArrowRight, className: "text-muted-foreground bg-surface-subtle" },
};

type KpiCardProps = PreviewKpi & {
  icon?: LucideIcon;
};

function SparklinePreview({ points, trend }: { points: readonly number[]; trend: PreviewTrend }) {
  const width = 116;
  const height = 34;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const coordinates = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      className="h-9 w-28 overflow-visible"
    >
      <polyline
        points={coordinates}
        fill="none"
        stroke={trend === "negative" ? "var(--destructive)" : "var(--primary)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * width;
        const y = height - ((point - min) / range) * (height - 6) - 3;
        return (
          <circle
            key={`${index}-${point}`}
            cx={x}
            cy={y}
            r={index === points.length - 1 ? 2.5 : 0}
            fill="var(--surface)"
            stroke={trend === "negative" ? "var(--destructive)" : "var(--primary)"}
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}

export function KpiCard({
  comparison,
  comparisonAccessibleLabel,
  context,
  explanation,
  icon: Icon,
  sparkline,
  title,
  trend,
  value,
}: KpiCardProps) {
  const TrendIcon = trendConfig[trend].icon;

  return (
    <Card className="group relative min-w-0 overflow-hidden p-5 shadow-card transition-[border-color,box-shadow,transform] duration-base hover:border-border-strong hover:shadow-card-hover motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span className="bg-surface-subtle text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-button">
              <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
            </span>
          ) : null}
          <h3 className="text-muted-foreground truncate text-xs font-semibold">{title}</h3>
        </div>
        <Tooltip content={explanation} label={`Explain ${title}`} />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-[-0.04em] tabular-nums sm:text-[1.75rem]">
            {value}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              aria-label={comparisonAccessibleLabel}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.6875rem] font-bold tabular-nums",
                trendConfig[trend].className,
              )}
            >
              <TrendIcon aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
              {comparison}
            </span>
            <span className="text-muted-foreground text-[0.6875rem]">{context}</span>
          </div>
        </div>
        <SparklinePreview points={sparkline} trend={trend} />
      </div>
      <span className="bg-primary absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-base group-hover:scale-x-100 motion-reduce:transition-none" />
    </Card>
  );
}
