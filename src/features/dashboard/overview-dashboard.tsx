"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleDollarSign,
  Gauge,
  PackageCheck,
  RefreshCw,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import type { DashboardMetric, DashboardViewModel } from "@/features/dashboard/analytics-adapter";
import type { ValidatedDataset } from "@/analytics";
import type { Finding } from "@/findings";
import { DashboardContextPanels } from "@/features/dashboard/dashboard-context-panels";
import { DashboardFilterBar } from "@/features/dashboard/dashboard-filter-bar";
import { BreakdownChart, RevenueTrendChart } from "@/features/dashboard/dashboard-charts";
import { EvidenceDrawer, type EvidenceSelection } from "@/features/dashboard/evidence-drawer";
import { FindingDetailsDrawer } from "@/features/dashboard/finding-details-drawer";
import { FindingsPanel } from "@/features/dashboard/findings-panel";
import { FounderHome } from "@/features/dashboard/founder-home";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { ProductPerformanceTable } from "@/features/dashboard/product-performance-table";
import { SampleDataBanner } from "@/features/dashboard/sample-data-banner";
import { UploadWorkflow } from "@/features/ingestion/upload-workflow";
import { useDashboardAnalytics } from "@/features/dashboard/use-dashboard-analytics";
import {
  type DashboardDatePreset,
  type DashboardFilterState,
  useDashboardFilters,
} from "@/features/dashboard/dashboard-filter-state";
import type { DashboardFilterOptions } from "@/features/dashboard/analytics-adapter";

type WorkspaceExperience = "founder" | "advanced";

function readWorkspaceExperience(): WorkspaceExperience {
  if (typeof window === "undefined") return "founder";
  return new URLSearchParams(window.location.search).get("view") === "advanced"
    ? "advanced"
    : "founder";
}

function ExperienceSwitch({
  experience,
  onChange,
}: {
  readonly experience: WorkspaceExperience;
  readonly onChange: (experience: WorkspaceExperience) => void;
}) {
  return (
    <nav
      aria-label="Workspace experience"
      className="border-border bg-surface/85 mx-auto flex max-w-[100rem] gap-1 border-b px-4 py-2 sm:px-6 lg:px-8"
    >
      <Button
        aria-pressed={experience === "founder"}
        size="sm"
        variant={experience === "founder" ? "secondary" : "ghost"}
        onClick={() => onChange("founder")}
      >
        Home
      </Button>
      <Button
        aria-pressed={experience === "advanced"}
        size="sm"
        variant={experience === "advanced" ? "secondary" : "ghost"}
        onClick={() => onChange("advanced")}
      >
        Explore
      </Button>
    </nav>
  );
}

const primaryKpiPresentation = {
  total_revenue: {
    icon: CircleDollarSign,
    title: "Revenue",
    explanation: "Net line revenue after explicit discounts for the active filter context.",
  },
  gross_profit: {
    icon: WalletCards,
    title: "Gross profit",
    explanation: "Revenue minus line-level cost of goods; this is not accounting net income.",
  },
  gross_margin: {
    icon: Gauge,
    title: "Gross margin",
    explanation: "Gross profit as a share of net revenue, rounded only for display.",
  },
  distinct_orders: {
    icon: PackageCheck,
    title: "Orders",
    explanation: "Distinct order IDs represented by the filtered order-line records.",
  },
  average_order_value: {
    icon: CircleDollarSign,
    title: "Average order value",
    explanation: "Net revenue per distinct order in the active selection.",
  },
  repeat_customer_rate_within_selection: {
    icon: UsersRound,
    title: "Repeat-customer rate",
    explanation:
      "Customers with at least two distinct orders within the active selection, divided by unique customers.",
  },
} as const;

/** A local source identity only; raw rows never leave the browser to form it. */
function createDatasetFingerprint(dataset: ValidatedDataset): string {
  const serialized = JSON.stringify({ metadata: dataset.metadata, rows: dataset.rows });
  let hash = 2_166_136_261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `uploaded-fnv1a-${(hash >>> 0).toString(16)}-${dataset.rows.length}`;
}

function DashboardSkeleton() {
  return (
    <>
      <SiteHeader />
      <div
        className="mx-auto max-w-[100rem] space-y-9 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="sr-only">Loading the demo workspace.</p>
        <div className="skeleton-shimmer h-20 rounded-card" />
        <div className="skeleton-shimmer h-52 rounded-card" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skeleton-shimmer h-48 rounded-card" />
          ))}
        </div>
        <div className="skeleton-shimmer h-80 rounded-card" />
      </div>
    </>
  );
}

function ErrorState({ message }: { readonly message: string }) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-[100rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Card className="max-w-2xl p-6 shadow-card" role="alert">
          <p className="text-destructive-strong text-sm font-semibold">
            Analytics dataset unavailable
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">
            The dashboard could not prepare its source data.
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-6">{message}</p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Try again
          </Button>
        </Card>
      </div>
    </>
  );
}

function metricSelection(metric: DashboardMetric, periodLabel: string): EvidenceSelection {
  return {
    title: metric.result.label,
    description: "See the calculation context and a bounded sample of supporting records.",
    evidence: metric.evidence,
    periodLabel,
  };
}

function DashboardContent({
  activeFilterChips,
  choosePreset,
  filters,
  isPending,
  onInspectEvidence,
  onInspectFinding,
  onReset,
  onUpdateFilters,
  onClearUploaded,
  onOpenFounder,
  onOpenUpload,
  onUseDemo,
  options,
  aiDatasetFingerprint,
  uploadedFilename,
  viewModel,
}: {
  readonly activeFilterChips: readonly string[];
  readonly choosePreset: (preset: DashboardDatePreset) => void;
  readonly filters: DashboardFilterState;
  readonly isPending: boolean;
  readonly onInspectEvidence: (selection: EvidenceSelection) => void;
  readonly onInspectFinding: (finding: Finding) => void;
  readonly onReset: () => void;
  readonly onUpdateFilters: (update: Partial<DashboardFilterState>) => void;
  readonly onClearUploaded: () => void;
  readonly onOpenFounder: () => void;
  readonly onOpenUpload: () => void;
  readonly onUseDemo: () => void;
  readonly options: DashboardFilterOptions;
  readonly aiDatasetFingerprint: string;
  readonly uploadedFilename: string | null;
  readonly viewModel: DashboardViewModel;
}) {
  return (
    <>
      <SiteHeader />
      <ExperienceSwitch
        experience="advanced"
        onChange={(experience) => experience === "founder" && onOpenFounder()}
      />
      <div
        className="mx-auto max-w-[100rem] space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7"
        data-dashboard-calculation-ms={viewModel.calculatedInMs}
      >
        <section
          aria-label="Dataset workspace"
          className="border-border bg-surface-subtle/60 flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-foreground text-sm font-semibold">
              {uploadedFilename ? "Uploaded dataset workspace" : "Demo dataset workspace"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {uploadedFilename
                ? `${uploadedFilename} is available only in this browser session.`
                : "Try the synthetic demo or bring your own CSV."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onOpenUpload}>
              Upload CSV
            </Button>
            {uploadedFilename ? (
              <>
                <Button variant="ghost" onClick={onUseDemo}>
                  Use demo dataset
                </Button>
                <Button variant="ghost" onClick={onClearUploaded}>
                  Clear session data
                </Button>
              </>
            ) : null}
          </div>
        </section>
        <SampleDataBanner
          datasetVersion={viewModel.datasetVersion}
          rowCount={viewModel.rowCount}
          timezone={viewModel.timezone}
          source={uploadedFilename ? "uploaded" : "demo"}
          filename={uploadedFilename}
        />

        <DashboardFilterBar
          filters={filters}
          options={options}
          activeFilterChips={activeFilterChips}
          isPending={isPending}
          onChoosePreset={choosePreset}
          onUpdate={onUpdateFilters}
          onReset={onReset}
        />

        <section aria-labelledby="kpi-summary-title" aria-busy={isPending}>
          <SectionHeader
            title="What is the business delivering?"
            titleId="kpi-summary-title"
            description="Selected period: comparisons appear when a matching prior period is available."
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {viewModel.primaryKpis.map((metric) => {
              const presentation =
                primaryKpiPresentation[metric.id as keyof typeof primaryKpiPresentation];
              return (
                <KpiCard
                  key={metric.id}
                  metric={metric}
                  title={presentation.title}
                  explanation={presentation.explanation}
                  icon={presentation.icon}
                  onInspectEvidence={() =>
                    onInspectEvidence(metricSelection(metric, viewModel.filterContextLabel))
                  }
                />
              );
            })}
          </div>
        </section>

        {viewModel.trend.status === "ok" ? (
          <RevenueTrendChart
            trend={viewModel.trend}
            periodLabel={viewModel.filterContextLabel}
            onInspectEvidence={onInspectEvidence}
          />
        ) : (
          <Card className="p-6 shadow-card" role="status">
            <h2 className="text-lg font-semibold">
              How is business performance changing over time?
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              {viewModel.trend.message}
            </p>
          </Card>
        )}

        <FindingsPanel
          findings={viewModel.findings}
          onInspect={onInspectFinding}
          datasetFingerprint={aiDatasetFingerprint}
          uploadedDataset={Boolean(uploadedFilename)}
        />

        <section aria-labelledby="breakdown-analysis-title">
          <SectionHeader
            title="Which parts of the business explain the picture?"
            titleId="breakdown-analysis-title"
            description="Rankings reflect the active selection."
          />
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <BreakdownChart
              title="Which categories are driving revenue?"
              description="Compare category contribution without relying on a pie chart."
              breakdown={viewModel.breakdowns.category}
              periodLabel={viewModel.filterContextLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <BreakdownChart
              title="Which regions are strongest?"
              description="Compare revenue across the sales regions in this workspace."
              breakdown={viewModel.breakdowns.region}
              periodLabel={viewModel.filterContextLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <BreakdownChart
              title="Which channels generate the most value?"
              description="Channel revenue is observational and should not be interpreted as incremental lift."
              breakdown={viewModel.breakdowns.channel}
              periodLabel={viewModel.filterContextLabel}
              onInspectEvidence={onInspectEvidence}
            />
            <BreakdownChart
              title="Which products combine revenue with healthy margins?"
              description="Compare leading products before exploring the full performance table."
              breakdown={viewModel.breakdowns.product}
              periodLabel={viewModel.filterContextLabel}
              onInspectEvidence={onInspectEvidence}
            />
          </div>
        </section>

        <DashboardContextPanels
          primaryKpis={viewModel.primaryKpis}
          secondaryKpis={viewModel.secondaryKpis}
          periodLabel={viewModel.filterContextLabel}
          onInspectEvidence={onInspectEvidence}
        />

        <section aria-label="Product performance detail">
          <ProductPerformanceTable
            breakdown={viewModel.breakdowns.product}
            periodLabel={viewModel.filterContextLabel}
            onInspectEvidence={onInspectEvidence}
          />
        </section>

        <footer className="border-border text-muted-foreground flex flex-col gap-2 border-t pt-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>
            {uploadedFilename ? "InsightAI session workspace" : "InsightAI sample workspace"}
          </span>
          <span>
            {uploadedFilename
              ? "Session data — not uploaded or stored"
              : "Demo data — no real customer information"}
          </span>
        </footer>
      </div>
    </>
  );
}

function DashboardWorkspace() {
  const { choosePreset, filters, isPending, replaceFilters, resetFilters, updateFilters } =
    useDashboardFilters();
  const [uploadedDataset, setUploadedDataset] = useState<{
    readonly dataset: ValidatedDataset;
    readonly filename: string;
    readonly aiDatasetFingerprint: string;
  } | null>(null);
  const uploadGeneration = useRef(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const analytics = useDashboardAnalytics(filters, uploadedDataset?.dataset ?? null);
  const [evidenceSelection, setEvidenceSelection] = useState<EvidenceSelection | null>(null);
  const [findingSelection, setFindingSelection] = useState<Finding | null>(null);
  const [experience, setExperience] = useState<WorkspaceExperience>("founder");

  useEffect(() => {
    const syncExperience = () => setExperience(readWorkspaceExperience());
    syncExperience();
    window.addEventListener("popstate", syncExperience);
    return () => window.removeEventListener("popstate", syncExperience);
  }, []);

  const changeExperience = useCallback((next: WorkspaceExperience) => {
    const query = new URLSearchParams(window.location.search);
    if (next === "advanced") query.set("view", "advanced");
    else query.delete("view");
    const search = query.toString();
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
    setExperience(next);
  }, []);

  const openUpload = useCallback(() => setUploadOpen(true), []);
  const useDemo = useCallback(() => {
    setUploadedDataset(null);
    setEvidenceSelection(null);
    setFindingSelection(null);
    resetFilters();
  }, [resetFilters]);
  const clearUploaded = useCallback(() => {
    setUploadedDataset(null);
    setEvidenceSelection(null);
    setFindingSelection(null);
    resetFilters();
  }, [resetFilters]);
  const completeUpload = useCallback(
    (dataset: ValidatedDataset, filename: string) => {
      uploadGeneration.current += 1;
      setUploadedDataset({
        dataset,
        filename,
        aiDatasetFingerprint: `${createDatasetFingerprint(dataset)}-session-${uploadGeneration.current}`,
      });
      setEvidenceSelection(null);
      setFindingSelection(null);
      changeExperience("founder");
      replaceFilters({
        preset: "custom",
        start: dataset.metadata.dateRange.start,
        end: dataset.metadata.dateRange.end,
        category: null,
        region: null,
        channel: null,
        productId: null,
      });
      setUploadOpen(false);
    },
    [changeExperience, replaceFilters],
  );

  const exploreFinding = useCallback(
    (finding: Finding) => {
      const segment = finding.affectedSegment;
      if (segment && finding.affectedDimension === "category") updateFilters({ category: segment });
      if (segment && finding.affectedDimension === "region") updateFilters({ region: segment });
      if (segment && finding.affectedDimension === "channel") updateFilters({ channel: segment });
      if (segment && finding.affectedDimension === "product") updateFilters({ productId: segment });
      changeExperience("advanced");
    },
    [changeExperience, updateFilters],
  );

  if (uploadOpen) {
    return <UploadWorkflow onComplete={completeUpload} onCancel={() => setUploadOpen(false)} />;
  }

  if (analytics.status === "loading") return <DashboardSkeleton />;
  if (analytics.status === "error") return <ErrorState message={analytics.message} />;
  if (analytics.status === "invalid_filter") {
    return (
      <>
        <SiteHeader />
        <div className="mx-auto max-w-[100rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Card className="max-w-2xl p-6 shadow-card" role="status">
            <p className="text-warning-strong text-sm font-semibold">
              This filter combination cannot be calculated
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-6">{analytics.message}</p>
            <Button className="mt-5" onClick={resetFilters}>
              Reset filters
            </Button>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      {experience === "founder" ? (
        <>
          <ExperienceSwitch experience="founder" onChange={changeExperience} />
          <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 lg:px-8">
            <SampleDataBanner
              datasetVersion={analytics.value.datasetVersion}
              rowCount={analytics.value.rowCount}
              timezone={analytics.value.timezone}
              source={uploadedDataset ? "uploaded" : "demo"}
              filename={uploadedDataset?.filename ?? null}
            />
          </div>
          <FounderHome
            activeFilterChips={analytics.value.activeFilterChips}
            aiDatasetFingerprint={
              uploadedDataset?.aiDatasetFingerprint ?? analytics.value.datasetVersion
            }
            viewModel={analytics.value}
            uploadedDataset={Boolean(uploadedDataset)}
            uploadedFilename={uploadedDataset?.filename ?? null}
            onClearFilters={resetFilters}
            onOpenAdvanced={() => changeExperience("advanced")}
            onOpenUpload={openUpload}
            onInspectFinding={setFindingSelection}
            onInspectMetric={(metric) =>
              setEvidenceSelection(metricSelection(metric, analytics.value.filterContextLabel))
            }
            onExploreFinding={exploreFinding}
          />
        </>
      ) : (
        <DashboardContent
          activeFilterChips={analytics.value.activeFilterChips}
          choosePreset={choosePreset}
          filters={filters}
          isPending={isPending}
          viewModel={analytics.value}
          onInspectEvidence={setEvidenceSelection}
          onInspectFinding={setFindingSelection}
          onReset={resetFilters}
          onUpdateFilters={updateFilters}
          onOpenUpload={openUpload}
          onUseDemo={useDemo}
          onClearUploaded={clearUploaded}
          onOpenFounder={() => changeExperience("founder")}
          uploadedFilename={uploadedDataset?.filename ?? null}
          aiDatasetFingerprint={
            uploadedDataset?.aiDatasetFingerprint ?? analytics.value.datasetVersion
          }
          options={analytics.value.filterOptions}
        />
      )}
      <EvidenceDrawer selection={evidenceSelection} onClose={() => setEvidenceSelection(null)} />
      <FindingDetailsDrawer finding={findingSelection} onClose={() => setFindingSelection(null)} />
    </>
  );
}

export function OverviewDashboard() {
  return <DashboardWorkspace />;
}
