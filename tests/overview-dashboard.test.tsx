import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import type { DashboardViewModel } from "@/features/dashboard/analytics-adapter";
import { OverviewDashboard } from "@/features/dashboard/overview-dashboard";

const useDashboardAnalytics = vi.hoisted(() => vi.fn());

vi.mock("@/features/dashboard/use-dashboard-analytics", () => ({ useDashboardAnalytics }));

const evidence = {
  evidenceId: "evidence:test:overview",
  datasetVersion: "insightai-synthetic-orders-v1",
  engineVersion: "3.0.0",
  ruleVersion: null,
  matchingRowCount: 12,
  distinctOrderCount: 8,
  affectedDateBuckets: [],
  segmentKeys: [],
  numerator: null,
  denominator: null,
  metricDependencies: ["total_revenue"],
  sampleOrderLineIds: ["LINE-0000001"],
  sampleOrderIds: ["ORD-000001"],
  sampleLimit: 12,
  truncated: false,
};

function metric(id: string, label: string, value: object) {
  return {
    id,
    result: {
      resultType: "metric",
      status: "ok",
      metricId: id,
      label,
      value,
      evidence,
    },
    comparison: null,
    evidence,
  };
}

const unavailableBreakdown = {
  resultType: "non_computable",
  status: "not_applicable",
  message: "No rows are available for this fixture.",
};

const viewModel = {
  datasetVersion: "insightai-synthetic-orders-v1",
  engineVersion: "3.0.0",
  rowCount: 6909,
  timezone: "America/Chicago",
  filter: {
    preset: "full",
    start: "2024-01-01",
    end: "2025-12-31",
    category: null,
    region: null,
    channel: null,
    productId: null,
  },
  filterContextLabel: "Full dataset: 2024-01-01 to 2025-12-31",
  activeFilterChips: [],
  filterOptions: {
    categories: [{ value: "Home", label: "Home" }],
    regions: [{ value: "West", label: "West" }],
    channels: [{ value: "Web", label: "Web" }],
    products: [{ value: "PROD-HOM-001", label: "Linen Throw Set" }],
  },
  primaryKpis: [
    metric("total_revenue", "Total revenue", { kind: "money", cents: 77_823_110 }),
    metric("gross_profit", "Gross profit", { kind: "money", cents: 31_781_410 }),
    metric("gross_margin", "Gross margin", {
      kind: "rate",
      ratio: { numerator: 408_380, denominator: 1_000_000 },
      basisPoints: 4_084,
    }),
    metric("distinct_orders", "Distinct orders", { kind: "count", value: 4310 }),
    metric("average_order_value", "Average order value", { kind: "money", cents: 18_056 }),
    metric("repeat_customer_rate_within_selection", "Repeat customer rate within selection", {
      kind: "rate",
      ratio: { numerator: 517, denominator: 1200 },
      basisPoints: 4308,
    }),
  ],
  secondaryKpis: [
    metric("unique_customers", "Unique customers", { kind: "count", value: 1200 }),
    metric("one_time_customers_within_selection", "One-time customers within selection", {
      kind: "count",
      value: 683,
    }),
    metric("repeat_customers_within_selection", "Repeat customers within selection", {
      kind: "count",
      value: 517,
    }),
    metric("total_marketing_spend", "Total marketing spend", { kind: "money", cents: 7_340_221 }),
    metric("marketing_contribution", "Marketing contribution", {
      kind: "money",
      cents: 24_441_189,
    }),
    metric("marketing_roi", "Marketing ROI", {
      kind: "rate",
      ratio: { numerator: 1, denominator: 2 },
      basisPoints: 5000,
    }),
    metric("total_discounts", "Total discounts", { kind: "money", cents: 2_522_290 }),
    metric("total_quantity", "Total quantity", { kind: "quantity", value: 9044 }),
  ],
  breakdowns: {
    category: unavailableBreakdown,
    region: unavailableBreakdown,
    channel: unavailableBreakdown,
    product: unavailableBreakdown,
  },
  trend: {
    resultType: "non_computable",
    status: "not_applicable",
    message: "No rows are available.",
  },
  findings: {
    engineVersion: "1.0.0",
    ruleSetVersion: "findings-rules-v1",
    filterContext: {
      period: { start: "2024-01-01", end: "2025-12-31", boundary: "inclusive" },
    },
    suppressed: [],
    findings: [
      {
        findingId: "aggregate-negative-margin-product:product:PROD-HOM-001:2024-01-01:2025-12-31",
        findingType: "aggregate_negative_margin_product",
        title: "Linen Throw Set has negative aggregate margin",
        summary: "Linen Throw Set produced negative gross profit in the active selection.",
        explanation: "The signal uses aggregate product revenue and line-level cost.",
        category: "margin_issue",
        severity: "high",
        priority: 410,
        status: "current",
        affectedMetric: "gross_profit",
        affectedDimension: "product",
        affectedSegment: "PROD-HOM-001",
        currentValue: { kind: "money", cents: -8100 },
        comparisonValue: null,
        absoluteChange: null,
        percentageChangeBasisPoints: null,
        period: { start: "2024-01-01", end: "2025-12-31", boundary: "inclusive" },
        filterContext: {
          period: { start: "2024-01-01", end: "2025-12-31", boundary: "inclusive" },
        },
        evidence: [evidence],
        evidenceStrength: "strong",
        ruleId: "aggregate-negative-margin-product",
        ruleVersion: "findings-rules-v1",
        thresholds: { aggregateNegative: true },
        materiality: {
          absoluteExposureCents: 8100,
          affectedRevenueShareBasisPoints: null,
          supportingOrderCount: 8,
          persistencePeriods: 0,
        },
      },
    ],
    generatedInMs: 4,
  },
  calculatedInMs: 8.4,
} as unknown as DashboardViewModel;

describe("Overview dashboard", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("starts in Founder Home with real-engine values and approachable insights", async () => {
    const user = userEvent.setup();
    useDashboardAnalytics.mockReturnValue({ status: "ready", value: viewModel });

    render(
      <AppShell>
        <OverviewDashboard />
      </AppShell>,
    );

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByLabelText("Demo data notice")).toHaveTextContent("Demo commerce dataset");
    expect(screen.getByLabelText("Demo data notice")).toHaveTextContent("No real customer data");
    expect(
      screen.getByRole("heading", { name: "How is your business doing?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$778.2K")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "What deserves your attention" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Linen Throw Set may be losing money")).toBeInTheDocument();
    expect(screen.getByText("Jan 2024 – Dec 2025")).toBeInTheDocument();
    expect(screen.queryByText("Comparison unavailable")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Explore your business with InsightAI" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What should I investigate first?" })).toBeEnabled();
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open advanced analytics" }));
    expect(screen.getByLabelText("Category")).not.toBeDisabled();
    expect(screen.getByLabelText("Region")).not.toBeDisabled();
    expect(screen.getByLabelText("Channel")).not.toBeDisabled();
    expect(screen.getByLabelText("Product")).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Inspect evidence for Revenue" }));
    expect(screen.getByRole("dialog", { name: /Evidence details/ })).toHaveTextContent(
      "Matching lines",
    );
    expect(screen.getByText("LINE-0000001")).toBeInTheDocument();
  });

  it("keeps detailed findings inspectable without recreating a business formula", async () => {
    const user = userEvent.setup();
    useDashboardAnalytics.mockReturnValue({ status: "ready", value: viewModel });
    render(<OverviewDashboard />);

    await user.click(screen.getAllByRole("button", { name: "Explore" })[1]);
    expect(screen.getByText("Linen Throw Set has negative aggregate margin")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(
      screen.getByRole("dialog", { name: /Finding details: Linen Throw Set/i }),
    ).toHaveTextContent("Rule and evidence details");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /Finding details:/i })).not.toBeInTheDocument();
  });

  it("keeps global filter controls shareable through the URL and can reset them", async () => {
    const user = userEvent.setup();
    useDashboardAnalytics.mockReturnValue({ status: "ready", value: viewModel });
    render(<OverviewDashboard />);

    await user.click(screen.getByRole("button", { name: "Open advanced analytics" }));

    await user.selectOptions(screen.getByLabelText("Category"), "Home");
    expect(window.location.search).toContain("category=Home");
    expect(screen.getByRole("button", { name: "Reset filters" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(window.location.search).not.toContain("category=Home");
    expect(window.location.search).toContain("view=advanced");

    await user.selectOptions(screen.getByLabelText("Region"), "West");
    await user.click(screen.getByRole("button", { name: "Home" }));
    expect(
      screen.getByRole("heading", { name: "How is your business doing?" }),
    ).toBeInTheDocument();
    expect(window.location.search).toContain("region=West");
  });

  it("uses a compact mobile sheet that applies one complete filter state", async () => {
    const user = userEvent.setup();
    useDashboardAnalytics.mockReturnValue({ status: "ready", value: viewModel });
    render(<OverviewDashboard />);

    await user.click(screen.getByRole("button", { name: "Open advanced analytics" }));

    const trigger = screen.getByRole("button", { name: "Filters" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Filters" });
    const closeButton = within(dialog).getByRole("button", { name: "Close filters" });
    const applyButton = within(dialog).getByRole("button", { name: "Apply filters" });
    expect(closeButton).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(applyButton).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(closeButton).toHaveFocus();
    await user.selectOptions(within(dialog).getByLabelText("Category"), "Home");
    expect(window.location.search).not.toContain("category=Home");

    await user.click(applyButton);
    expect(window.location.search).toContain("category=Home");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("offers an accessible CSV upload workspace without replacing the demo dataset", async () => {
    const user = userEvent.setup();
    useDashboardAnalytics.mockReturnValue({ status: "ready", value: viewModel });
    render(<OverviewDashboard />);

    await user.click(screen.getByRole("button", { name: "Upload sales data" }));
    expect(
      screen.getByRole("heading", { name: "Bring your sales data to life" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/UTF-8 CSV only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose CSV" })).toBeInTheDocument();
  });
});
