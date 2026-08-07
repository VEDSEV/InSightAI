// @vitest-environment node

import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createAnalyticsEngine, type ValidatedDataset } from "@/analytics";
import {
  createDashboardFilterOptions,
  createDashboardViewModel,
  type DashboardViewModel,
} from "@/features/dashboard/analytics-adapter";
import {
  DEFAULT_DASHBOARD_FILTER_STATE,
  dashboardFilterSearch,
  readDashboardFilterState,
  type DashboardFilterState,
} from "@/features/dashboard/dashboard-filter-state";
import { loadDashboardSampleDataset } from "@/features/dashboard/dashboard-sample-dataset";

const phaseTwoCsv = readFileSync(
  new URL("../data/sample/insightai-orders.csv", import.meta.url),
  "utf8",
);

let viewModel: DashboardViewModel;
let createView: (filter: DashboardFilterState) => DashboardViewModel;
let dataset: ValidatedDataset;
let engine: ReturnType<typeof createAnalyticsEngine>;

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, text: async () => phaseTwoCsv })),
  );
  const loaded = await loadDashboardSampleDataset();
  if (loaded.status !== "ready") throw new Error(loaded.message);
  dataset = loaded.dataset;
  engine = createAnalyticsEngine(dataset);
  const options = createDashboardFilterOptions(loaded.dataset);
  createView = (filter) => {
    const result = createDashboardViewModel(engine, dataset, filter, options);
    if (result.status !== "ready") throw new Error(result.message);
    return result.value;
  };
  viewModel = createView(DEFAULT_DASHBOARD_FILTER_STATE);
});

function metric(model: DashboardViewModel, id: string) {
  const value = [...model.primaryKpis, ...model.secondaryKpis].find(
    (candidate) => candidate.id === id,
  );
  if (!value) throw new Error(`Missing dashboard metric ${id}.`);
  return value;
}

describe("dashboard analytics adapter", () => {
  it("maps Phase 2 engine output to dashboard values without copied UI totals", () => {
    expect(viewModel).toMatchObject({
      datasetVersion: "insightai-synthetic-orders-v1",
      engineVersion: "3.0.0",
      rowCount: 6909,
      timezone: "America/Chicago",
    });
    expect(metric(viewModel, "total_revenue").result.value).toEqual({
      kind: "money",
      cents: 77_823_110,
    });
    expect(metric(viewModel, "gross_profit").result.value).toEqual({
      kind: "money",
      cents: 31_781_410,
    });
    expect(metric(viewModel, "distinct_orders").result.value).toEqual({
      kind: "count",
      value: 4310,
    });
    expect(metric(viewModel, "total_quantity").result.value).toEqual({
      kind: "quantity",
      value: 9044,
    });
    expect(viewModel.breakdowns.category.status).toBe("ok");
    expect(viewModel.breakdowns.region.status).toBe("ok");
    expect(viewModel.breakdowns.channel.status).toBe("ok");
    expect(viewModel.breakdowns.product.status).toBe("ok");
    expect(viewModel.trend.status).toBe("ok");
  });

  it("uses one canonical filter context for KPIs, trend, and every visible breakdown", () => {
    const filtered = createView({
      ...DEFAULT_DASHBOARD_FILTER_STATE,
      preset: "year-2025",
      start: "2025-01-01",
      end: "2025-12-31",
      category: "Home",
      region: "West",
      channel: "Web",
      productId: "PROD-HOM-001",
    });
    const canonical = metric(filtered, "total_revenue").result.filterContext;
    expect(canonical).toMatchObject({
      period: { start: "2025-01-01", end: "2025-12-31", boundary: "inclusive" },
      categories: ["Home"],
      regions: ["West"],
      salesChannels: ["Web"],
      productIds: ["PROD-HOM-001"],
    });
    expect(filtered.breakdowns.category.filterContext).toEqual(canonical);
    expect(filtered.breakdowns.region.filterContext).toEqual(canonical);
    expect(filtered.breakdowns.channel.filterContext).toEqual(canonical);
    expect(filtered.breakdowns.product.filterContext).toEqual(canonical);
    expect(filtered.trend.filterContext).toEqual(canonical);
  });

  it("applies a prior-year comparison only when the selected date range has complete history", () => {
    const filtered = createView({
      ...DEFAULT_DASHBOARD_FILTER_STATE,
      preset: "year-2025",
      start: "2025-01-01",
      end: "2025-12-31",
    });
    const comparison = metric(filtered, "total_revenue").comparison;
    expect(comparison).toMatchObject({
      status: "ok",
      currentPeriod: { start: "2025-01-01", end: "2025-12-31", boundary: "inclusive" },
      comparisonPeriod: { start: "2024-01-01", end: "2024-12-31", boundary: "inclusive" },
    });
    expect(metric(viewModel, "total_revenue").comparison).toMatchObject({
      status: "insufficient_data",
      reason: "insufficient_history",
    });
  });

  it.each([
    ["category", "Home"],
    ["region", "West"],
    ["channel", "Web"],
    ["productId", "PROD-HOM-001"],
  ] as const)("maps the %s filter through the engine context", (field, selected) => {
    const filtered = createView({ ...DEFAULT_DASHBOARD_FILTER_STATE, [field]: selected });
    const revenue = metric(filtered, "total_revenue").result;
    if (field === "category") expect(revenue.filterContext.categories).toContain(selected);
    if (field === "region") expect(revenue.filterContext.regions).toContain(selected);
    if (field === "channel") expect(revenue.filterContext.salesChannels).toContain(selected);
    if (field === "productId") expect(revenue.filterContext.productIds).toContain(selected);
  });

  it("returns an explicit empty/non-computable trend state for a valid filter combination with no rows", () => {
    const filtered = createView({
      ...DEFAULT_DASHBOARD_FILTER_STATE,
      category: "Gifting",
      productId: "PROD-HOM-001",
    });
    expect(metric(filtered, "total_revenue").result.value).toEqual({ kind: "money", cents: 0 });
    expect(filtered.trend).toMatchObject({
      resultType: "non_computable",
      reason: "empty_dataset",
      evidence: { matchingRowCount: 0 },
    });
  });

  it("preserves bounded engine evidence for metric inspection", () => {
    const revenue = metric(viewModel, "total_revenue");
    expect(revenue.evidence).toEqual(revenue.result.evidence);
    expect(revenue.evidence).toMatchObject({
      matchingRowCount: 6909,
      distinctOrderCount: 4310,
      sampleLimit: 12,
    });
    expect(revenue.evidence.sampleOrderLineIds.length).toBeLessThanOrEqual(12);
    expect(revenue.evidence.sampleOrderIds.length).toBeLessThanOrEqual(12);
  });
});

describe("dashboard filter-state serialization", () => {
  it("preserves a composable custom view in URL search parameters and resets to the canonical default", () => {
    const state: DashboardFilterState = {
      preset: "custom",
      start: "2024-03-01",
      end: "2024-06-30",
      category: "Home",
      region: "West",
      channel: "Web",
      productId: "PROD-HOM-001",
    };
    expect(readDashboardFilterState(dashboardFilterSearch(state))).toEqual(state);
    expect(dashboardFilterSearch(DEFAULT_DASHBOARD_FILTER_STATE)).toBe("");
  });
});
