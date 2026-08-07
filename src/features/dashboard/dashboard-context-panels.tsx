import { BarChart3, Megaphone, UsersRound } from "lucide-react";

import type { DashboardMetric } from "@/features/dashboard/analytics-adapter";
import type { EvidenceSelection } from "@/features/dashboard/evidence-drawer";
import { formatComparison, formatMetricValue } from "@/features/dashboard/presentation-formatters";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type DashboardContextPanelsProps = {
  readonly primaryKpis: readonly DashboardMetric[];
  readonly secondaryKpis: readonly DashboardMetric[];
  readonly periodLabel: string;
  readonly onInspectEvidence: (selection: EvidenceSelection) => void;
};

function metricById(
  metrics: readonly DashboardMetric[],
  id: DashboardMetric["id"],
): DashboardMetric {
  const metric = metrics.find((candidate) => candidate.id === id);
  if (!metric) throw new Error(`Dashboard adapter did not provide ${id}.`);
  return metric;
}

function MetricDetail({
  metric,
  onInspectEvidence,
  periodLabel,
}: {
  readonly metric: DashboardMetric;
  readonly onInspectEvidence: (selection: EvidenceSelection) => void;
  readonly periodLabel: string;
}) {
  const comparison = formatComparison(metric.comparison);
  return (
    <div className="border-border border-t py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold">{metric.result.label}</p>
          <p className="mt-1 text-lg font-semibold tracking-[-0.02em] tabular-nums">
            {metric.result.status === "ok" ? formatMetricValue(metric.result.value) : "—"}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onInspectEvidence({
              title: metric.result.label,
              description: "See the calculation context and supporting records for this value.",
              evidence: metric.evidence,
              periodLabel,
            })
          }
        >
          Evidence
        </Button>
      </div>
      <p className="text-muted-foreground mt-1 text-xs" aria-label={comparison.accessibleLabel}>
        {comparison.label}
      </p>
    </div>
  );
}

export function DashboardContextPanels({
  onInspectEvidence,
  periodLabel,
  primaryKpis,
  secondaryKpis,
}: DashboardContextPanelsProps) {
  const uniqueCustomers = metricById(secondaryKpis, "unique_customers");
  const oneTime = metricById(secondaryKpis, "one_time_customers_within_selection");
  const repeat = metricById(secondaryKpis, "repeat_customers_within_selection");
  const repeatRate = metricById(primaryKpis, "repeat_customer_rate_within_selection");
  const spend = metricById(secondaryKpis, "total_marketing_spend");
  const contribution = metricById(secondaryKpis, "marketing_contribution");
  const roi = metricById(secondaryKpis, "marketing_roi");
  const discounts = metricById(secondaryKpis, "total_discounts");
  const revenue = metricById(primaryKpis, "total_revenue");
  const grossProfit = metricById(primaryKpis, "gross_profit");
  const grossMargin = metricById(primaryKpis, "gross_margin");

  return (
    <section aria-labelledby="business-context-title">
      <div className="mb-5">
        <h2 id="business-context-title" className="text-xl font-semibold tracking-[-0.02em]">
          What do customer, marketing, and recent signals add?
        </h2>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-3">
            <span className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-button">
              <UsersRound aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-base font-semibold">Customer mix</h3>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                Repeat status reflects orders placed within the selected period.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-0">
            <MetricDetail
              metric={uniqueCustomers}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <MetricDetail
              metric={repeatRate}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <MetricDetail
              metric={oneTime}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <MetricDetail
              metric={repeat}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
          </div>
        </Card>
        <Card className="p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-3">
            <span className="bg-success-soft text-success-strong flex size-9 shrink-0 items-center justify-center rounded-button">
              <Megaphone aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-base font-semibold">Marketing context</h3>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                These allocation metrics describe the sample; they do not prove marketing impact.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-0">
            <MetricDetail
              metric={spend}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <MetricDetail
              metric={contribution}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <MetricDetail
              metric={roi}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <MetricDetail
              metric={discounts}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
          </div>
        </Card>
        <Card className="p-5 shadow-card sm:p-6">
          <div className="flex items-start gap-3">
            <span className="bg-warning-soft text-warning-strong flex size-9 shrink-0 items-center justify-center rounded-button">
              <BarChart3 aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-base font-semibold">Performance snapshot</h3>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                Key signals for the selection, without reducing the business to one score.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-0">
            <MetricDetail
              metric={revenue}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <MetricDetail
              metric={grossProfit}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <MetricDetail
              metric={grossMargin}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <MetricDetail
              metric={repeatRate}
              periodLabel={periodLabel}
              onInspectEvidence={onInspectEvidence}
            />
          </div>
        </Card>
      </div>
    </section>
  );
}
