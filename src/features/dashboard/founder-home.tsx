"use client";

import {
  ArrowRight,
  BrainCircuit,
  ChartNoAxesCombined,
  CircleDollarSign,
  FileSearch,
  type LucideIcon,
  PackageCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import type { Finding } from "@/findings";

import { AiExplanation } from "@/features/dashboard/ai-explanation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DashboardMetric, DashboardViewModel } from "@/features/dashboard/analytics-adapter";
import {
  formatComparison,
  formatFounderDateRange,
  formatMetricCompactValue,
  formatMetricValue,
} from "@/features/dashboard/presentation-formatters";

type FounderHomeProps = Readonly<{
  activeFilterChips: readonly string[];
  aiDatasetFingerprint: string;
  onClearFilters: () => void;
  onExploreFinding: (finding: Finding) => void;
  onInspectFinding: (finding: Finding) => void;
  onInspectMetric: (metric: DashboardMetric) => void;
  onOpenAdvanced: () => void;
  onOpenUpload: () => void;
  uploadedDataset: boolean;
  uploadedFilename: string | null;
  viewModel: DashboardViewModel;
}>;

const SNAPSHOT = Object.freeze([
  {
    id: "total_revenue",
    title: "Revenue",
    description: "Sales across the selected period",
    icon: CircleDollarSign,
  },
  {
    id: "gross_profit",
    title: "Gross profit",
    description: "Revenue left after direct product costs",
    icon: ChartNoAxesCombined,
  },
  {
    id: "distinct_orders",
    title: "Orders",
    description: "Completed purchases in this period",
    icon: PackageCheck,
  },
  {
    id: "unique_customers",
    title: "Customers",
    description: "People who placed at least one order",
    icon: UsersRound,
  },
] as const);

function metricFor(viewModel: DashboardViewModel, id: string): DashboardMetric | undefined {
  return [...viewModel.primaryKpis, ...viewModel.secondaryKpis].find((metric) => metric.id === id);
}

function insightHeadline(finding: Finding): string {
  const segment = finding.affectedSegment;
  if (finding.findingType === "revenue_concentration" && segment)
    return `${segment} drives a large share of your sales`;
  if (finding.findingType === "aggregate_negative_margin_product" && segment)
    return `${finding.title.replace("has negative aggregate margin", "may be losing money")}`;
  if (finding.findingType === "consecutive-revenue-decline")
    return "Sales have declined across several recent periods";
  if (finding.findingType === "unusual-revenue-drop")
    return "Sales were unusually low in one period";
  if (finding.findingType === "high-spend-weak-marketing-contribution")
    return "Marketing spend needs a closer look";
  return finding.title;
}

function whyLookAtThis(finding: Finding): string {
  if (finding.findingType === "revenue_concentration")
    return "A large share of sales relies on one part of the business.";
  if (
    finding.findingType === "aggregate_negative_margin_product" ||
    finding.findingType === "repeated-negative-margin-rows"
  )
    return "This product’s direct costs may be greater than the revenue it brings in.";
  if (finding.category === "opportunity")
    return "This is a positive change worth understanding and protecting.";
  return "This signal is worth reviewing before you make a business decision.";
}

function nextStep(finding: Finding): string {
  if (finding.affectedDimension === "channel")
    return "Review the products and orders that drive this channel.";
  if (finding.affectedDimension === "product")
    return "Review pricing, discounts, and direct costs for this product.";
  if (finding.affectedDimension === "region")
    return "Compare this region with the rest of the business.";
  return "Open the details, then compare the affected area in Explore.";
}

function FounderMetricCard({
  metric,
  title,
  description,
  icon: Icon,
  onInspect,
}: {
  readonly metric: DashboardMetric;
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly onInspect: () => void;
}) {
  const comparison = formatComparison(metric.comparison);
  return (
    <Card className="min-w-0 p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-button">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        {!comparison.unavailable ? (
          <span className="text-muted-foreground text-xs font-semibold">{comparison.label}</span>
        ) : null}
      </div>
      <h3 className="mt-5 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-3xl font-semibold tracking-[-0.045em] tabular-nums">
        {metric.result.status === "ok" ? formatMetricCompactValue(metric.result.value) : "—"}
      </p>
      <p className="text-muted-foreground mt-2 text-sm leading-5">{description}</p>
      <button
        type="button"
        className="text-primary mt-4 inline-flex min-h-8 items-center gap-1.5 rounded-button text-xs font-semibold hover:text-primary-hover focus-visible:outline-none"
        onClick={onInspect}
      >
        <FileSearch aria-hidden="true" className="size-3.5" />
        How we know
      </button>
    </Card>
  );
}

function FounderInsightCard({
  aiDatasetFingerprint,
  finding,
  onExplore,
  onInspect,
  uploadedDataset,
}: {
  readonly aiDatasetFingerprint: string;
  readonly finding: Finding;
  readonly onExplore: () => void;
  readonly onInspect: () => void;
  readonly uploadedDataset: boolean;
}) {
  return (
    <Card className="flex min-w-0 flex-col p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant={finding.category === "opportunity" ? "success" : "primary"}>Insight</Badge>
        <span className="text-muted-foreground text-xs font-medium">
          {finding.evidenceStrength} evidence
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-[-0.025em]">{insightHeadline(finding)}</h3>
      <p className="text-primary-strong mt-2 text-2xl font-semibold tracking-[-0.035em] tabular-nums">
        {formatMetricValue(finding.currentValue)}
      </p>
      <div className="mt-3 space-y-2 text-sm leading-5">
        <p className="text-muted-foreground">{whyLookAtThis(finding)}</p>
        <p className="text-foreground">
          <span className="font-semibold">Next step: </span>
          {nextStep(finding)}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onExplore}>
          Explore
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Button>
        <AiExplanation
          compactTrigger
          datasetFingerprint={aiDatasetFingerprint}
          finding={finding}
          uploadedDataset={uploadedDataset}
        />
        <Button size="sm" variant="ghost" onClick={onInspect}>
          <FileSearch aria-hidden="true" className="size-3.5" />
          How we know
        </Button>
      </div>
    </Card>
  );
}

export function FounderHome({
  activeFilterChips,
  aiDatasetFingerprint,
  onClearFilters,
  onExploreFinding,
  onInspectFinding,
  onInspectMetric,
  onOpenAdvanced,
  onOpenUpload,
  uploadedDataset,
  uploadedFilename,
  viewModel,
}: FounderHomeProps) {
  const insights = viewModel.findings.findings.slice(0, 3);
  const topInsight = insights[0];
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <section className="relative overflow-hidden rounded-[1.35rem] border border-border bg-surface p-5 shadow-card sm:p-7">
        <div className="bg-primary/12 pointer-events-none absolute -top-28 -right-24 size-56 rounded-full blur-3xl" />
        <div className="relative max-w-3xl">
          <Badge variant="primary">Founder home</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
            How is your business doing?
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-base leading-6">
            See the important changes first, then explore the details when you are ready. You are
            looking at {uploadedFilename ? uploadedFilename : "the demo sales data"} for the
            selected period.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => document.getElementById("insights")?.scrollIntoView()}>
              See what needs attention
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            <Button variant="secondary" onClick={onOpenAdvanced}>
              <ChartNoAxesCombined aria-hidden="true" className="size-4" />
              Open advanced analytics
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="business-snapshot-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-primary text-sm font-semibold">Business snapshot</p>
            <h2
              id="business-snapshot-title"
              className="mt-1 text-2xl font-semibold tracking-[-0.03em]"
            >
              Your business at a glance
            </h2>
          </div>
          <p className="text-muted-foreground text-sm">
            {formatFounderDateRange(viewModel.filter.start, viewModel.filter.end)}
          </p>
        </div>
        {activeFilterChips.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
            <span className="text-muted-foreground text-xs font-semibold">Showing</span>
            {activeFilterChips.map((chip) => (
              <Badge key={chip} variant="neutral">
                {chip}
              </Badge>
            ))}
            <Button size="sm" variant="ghost" onClick={onClearFilters}>
              Clear filters
            </Button>
          </div>
        ) : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SNAPSHOT.map((item) => {
            const metric = metricFor(viewModel, item.id);
            return metric ? (
              <FounderMetricCard
                key={item.id}
                metric={metric}
                title={item.title}
                description={item.description}
                icon={item.icon}
                onInspect={() => onInspectMetric(metric)}
              />
            ) : null;
          })}
        </div>
      </section>

      <section
        aria-labelledby="ask-insightai-title"
        className="rounded-[1.25rem] border border-primary/30 bg-primary-soft/45 p-5 sm:p-7"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-primary">
              <BrainCircuit aria-hidden="true" className="size-5" />
              <p className="text-sm font-semibold">InsightAI assistance</p>
            </div>
            <h2 id="ask-insightai-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
              Explore your business with InsightAI
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              Start with a verified question based on the insights and metrics already calculated
              for this view.
            </p>
            <p className="text-muted-foreground mt-2 text-xs leading-5">
              These guided prompts open the relevant analysis; conversational questions are coming
              later.
            </p>
          </div>
          <Sparkles aria-hidden="true" className="text-primary size-8" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            "What should I investigate first?",
            "Which sales channel is strongest?",
            "Where are margins weakest?",
            "What changed in this period?",
          ].map((question) => (
            <Button
              key={question}
              size="sm"
              variant="secondary"
              disabled={!topInsight}
              onClick={() => topInsight && onInspectFinding(topInsight)}
            >
              {question}
            </Button>
          ))}
        </div>
      </section>

      <section id="insights" aria-labelledby="insights-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-primary text-sm font-semibold">Insights</p>
            <h2 id="insights-title" className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
              What deserves your attention
            </h2>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
              These observations are calculated from the selected data. They point to where to look,
              not why something happened.
            </p>
          </div>
          <Button variant="ghost" onClick={onOpenAdvanced}>
            View all in Explore
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
        {insights.length ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {insights.map((finding) => (
              <FounderInsightCard
                key={finding.findingId}
                aiDatasetFingerprint={aiDatasetFingerprint}
                finding={finding}
                uploadedDataset={uploadedDataset}
                onInspect={() => onInspectFinding(finding)}
                onExplore={() => onExploreFinding(finding)}
              />
            ))}
          </div>
        ) : (
          <Card className="mt-5 p-6" role="status">
            <h3 className="text-lg font-semibold">Nothing urgent stands out in this view</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              Try a different period or open Explore to compare products, regions, and channels.
            </p>
          </Card>
        )}
      </section>

      <section
        id="data"
        className="border-border flex flex-col gap-4 border-t pt-8 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="text-lg font-semibold">Ready to look deeper?</h2>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Explore filters, charts, data checks, and the full performance table whenever you need
            more detail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onOpenUpload}>
            Upload sales data
          </Button>
          <Button onClick={onOpenAdvanced}>Explore analytics</Button>
        </div>
      </section>
    </div>
  );
}
