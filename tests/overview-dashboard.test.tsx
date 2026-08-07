import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
  calculatedInMs: 8.4,
} as unknown as DashboardViewModel;

describe("Overview dashboard", () => {
  it("renders real-engine view-model values, active controls, and evidence details", async () => {
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
    expect(screen.queryByText(/deterministic analytics engine/i)).not.toBeInTheDocument();
    expect(screen.getByText("$778.2K")).toBeInTheDocument();
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

  it("keeps global filter controls shareable through the URL and can reset them", async () => {
    const user = userEvent.setup();
    useDashboardAnalytics.mockReturnValue({ status: "ready", value: viewModel });
    render(<OverviewDashboard />);

    await user.selectOptions(screen.getByLabelText("Category"), "Home");
    expect(window.location.search).toContain("category=Home");
    expect(screen.getByRole("button", { name: "Reset filters" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(window.location.search).not.toContain("category=Home");
  });

  it("uses a compact mobile sheet that applies one complete filter state", async () => {
    const user = userEvent.setup();
    useDashboardAnalytics.mockReturnValue({ status: "ready", value: viewModel });
    render(<OverviewDashboard />);

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
});
