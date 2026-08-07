import {
  MISSING_DIMENSION_KEY,
  type AnalyticsEngine,
  type AnalyticsResult,
  type BreakdownDimension,
  type BreakdownResult,
  type ComputableBreakdownResult,
  type EvidenceReference,
  type MetricId,
  type MetricResult,
  type NonComputableResult,
  type PerformanceTrendResult,
  type ValidatedDataset,
} from "@/analytics";

import {
  dashboardFilterContext,
  type DashboardFilterState,
} from "@/features/dashboard/dashboard-filter-state";

const COMPARISON = Object.freeze({ kind: "previous_year" } as const);

const PRIMARY_KPI_IDS = Object.freeze([
  "total_revenue",
  "gross_profit",
  "gross_margin",
  "distinct_orders",
  "average_order_value",
  "repeat_customer_rate_within_selection",
] as const satisfies readonly MetricId[]);

const SECONDARY_KPI_IDS = Object.freeze([
  "unique_customers",
  "one_time_customers_within_selection",
  "repeat_customers_within_selection",
  "total_marketing_spend",
  "marketing_contribution",
  "marketing_roi",
  "total_discounts",
  "total_quantity",
] as const satisfies readonly MetricId[]);

export type DashboardMetric = {
  readonly id: MetricId;
  readonly result: MetricResult;
  readonly comparison: MetricResult | null;
  readonly evidence: EvidenceReference;
};

export type DashboardDimensionOption = {
  readonly value: string;
  readonly label: string;
};

export type DashboardFilterOptions = {
  readonly categories: readonly DashboardDimensionOption[];
  readonly regions: readonly DashboardDimensionOption[];
  readonly channels: readonly DashboardDimensionOption[];
  readonly products: readonly DashboardDimensionOption[];
};

export type DashboardBreakdowns = Readonly<
  Record<"category" | "region" | "channel" | "product", BreakdownResult>
>;

export type DashboardViewModel = {
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly rowCount: number;
  readonly timezone: string;
  readonly filter: DashboardFilterState;
  readonly filterContextLabel: string;
  readonly activeFilterChips: readonly string[];
  readonly filterOptions: DashboardFilterOptions;
  readonly primaryKpis: readonly DashboardMetric[];
  readonly secondaryKpis: readonly DashboardMetric[];
  readonly breakdowns: DashboardBreakdowns;
  readonly trend: PerformanceTrendResult | NonComputableResult;
  readonly calculatedInMs: number;
};

export type DashboardViewModelResult =
  | { readonly status: "ready"; readonly value: DashboardViewModel }
  | { readonly status: "invalid_filter"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

function compareCodePoints(left: string, right: string): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

function optionsFor(values: readonly string[]): readonly DashboardDimensionOption[] {
  return Object.freeze(
    [...new Set(values)]
      .sort(compareCodePoints)
      .map((value) =>
        Object.freeze({ value, label: value === MISSING_DIMENSION_KEY ? "Unknown" : value }),
      ),
  );
}

export function createDashboardFilterOptions(dataset: ValidatedDataset): DashboardFilterOptions {
  const productLabels = new Map<string, string>();
  for (const row of dataset.rows) productLabels.set(row.productId, row.productName);
  return Object.freeze({
    categories: optionsFor(dataset.rows.map((row) => row.category)),
    regions: optionsFor(dataset.rows.map((row) => row.region)),
    channels: optionsFor(dataset.rows.map((row) => row.salesChannel)),
    products: Object.freeze(
      [...productLabels.entries()]
        .sort(([, left], [, right]) => compareCodePoints(left, right))
        .map(([value, label]) => Object.freeze({ value, label })),
    ),
  });
}

function labelFor(
  options: readonly DashboardDimensionOption[],
  value: string | null,
): string | null {
  return value === null ? null : (options.find((option) => option.value === value)?.label ?? value);
}

function activeFilterChips(
  filter: DashboardFilterState,
  options: DashboardFilterOptions,
): readonly string[] {
  return Object.freeze(
    [
      filter.category ? `Category: ${labelFor(options.categories, filter.category)}` : null,
      filter.region ? `Region: ${labelFor(options.regions, filter.region)}` : null,
      filter.channel ? `Channel: ${labelFor(options.channels, filter.channel)}` : null,
      filter.productId ? `Product: ${labelFor(options.products, filter.productId)}` : null,
    ].filter((value): value is string => value !== null),
  );
}

function breakdown(
  engine: AnalyticsEngine,
  dimension: BreakdownDimension,
  filter: Parameters<AnalyticsEngine["metrics"]>[0],
): AnalyticsResult<BreakdownResult> {
  const current = engine.breakdown({ dimension, filter, sortBy: "revenue" });
  if (current.status === "error") return current;
  const comparable = engine.breakdown({
    dimension,
    filter,
    comparison: COMPARISON,
    sortBy: "revenue",
  });
  return {
    status: "ok",
    value:
      comparable.status === "ok" && comparable.value.status === "ok"
        ? comparable.value
        : current.value,
    warnings: current.warnings,
  };
}

function metric(
  engine: AnalyticsEngine,
  id: MetricId,
  base: Readonly<Record<MetricId, MetricResult>>,
  filter: Parameters<AnalyticsEngine["metrics"]>[0],
): DashboardMetric {
  const comparison = engine.comparison({ metricId: id, filter, comparison: COMPARISON });
  const comparisonResult = comparison.status === "ok" ? comparison.value : null;
  const result = base[id];
  return Object.freeze({ id, result, comparison: comparisonResult, evidence: result.evidence });
}

function readablePeriod(filter: DashboardFilterState): string {
  const matchingPreset = filter.preset === "custom" ? null : filter.preset;
  const title = matchingPreset
    ? matchingPreset.replaceAll("-", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase())
    : "Custom period";
  return `${title}: ${filter.start} to ${filter.end}`;
}

/**
 * Adapts only public analytics-engine results for presentation. It intentionally does not contain
 * business formulas, source totals, or direct data aggregation.
 */
export function createDashboardViewModel(
  engine: AnalyticsEngine,
  dataset: ValidatedDataset,
  filter: DashboardFilterState,
  filterOptions = createDashboardFilterOptions(dataset),
): DashboardViewModelResult {
  const filterResult = dashboardFilterContext(filter);
  if (filterResult.status === "error")
    return { status: "invalid_filter", message: filterResult.message };

  const startedAt = typeof performance === "undefined" ? 0 : performance.now();
  const context = filterResult.filter;
  const metrics = engine.metrics(context);
  const trendResult = engine.performanceTrend({ filter: context, frequency: "monthly" });
  if (trendResult.status === "error") {
    return { status: "error", message: trendResult.errors.map((error) => error.message).join(" ") };
  }

  const category = breakdown(engine, "category", context);
  const region = breakdown(engine, "region", context);
  const channel = breakdown(engine, "channel", context);
  const product = breakdown(engine, "product", context);
  if (
    category.status === "error" ||
    region.status === "error" ||
    channel.status === "error" ||
    product.status === "error"
  ) {
    const failedBreakdown = [category, region, channel, product].find(
      (result) => result.status === "error",
    );
    return {
      status: "error",
      message:
        failedBreakdown?.status === "error"
          ? failedBreakdown.errors.map((error) => error.message).join(" ")
          : "A dashboard breakdown could not be calculated.",
    };
  }

  const calculatedInMs = typeof performance === "undefined" ? 0 : performance.now() - startedAt;
  return {
    status: "ready",
    value: Object.freeze({
      datasetVersion: dataset.metadata.datasetVersion,
      engineVersion: engine.engineVersion,
      rowCount: dataset.rows.length,
      timezone: dataset.metadata.timezone,
      filter,
      filterContextLabel: readablePeriod(filter),
      activeFilterChips: activeFilterChips(filter, filterOptions),
      filterOptions,
      primaryKpis: Object.freeze(PRIMARY_KPI_IDS.map((id) => metric(engine, id, metrics, context))),
      secondaryKpis: Object.freeze(
        SECONDARY_KPI_IDS.map((id) => metric(engine, id, metrics, context)),
      ),
      breakdowns: Object.freeze({
        category: category.value,
        region: region.value,
        channel: channel.value,
        product: product.value,
      }),
      trend: trendResult.value,
      calculatedInMs,
    }),
  };
}

export function asComputableBreakdown(value: BreakdownResult): ComputableBreakdownResult | null {
  return value.status === "ok" ? value : null;
}
