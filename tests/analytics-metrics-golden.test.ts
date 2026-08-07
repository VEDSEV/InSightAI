// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANALYTICS_CONFIGURATION,
  METRIC_DEFINITIONS,
  computeMetrics,
  createFilterContext,
  dateInterval,
  ingestCanonicalCsv,
  isoDate,
  type AnalyticsConfiguration,
  type ComputableMetricResult,
  type DateInterval,
  type FilterContext,
  type FilterContextInput,
  type MetricId,
  type MetricResult,
  type ValidatedDataset,
} from "@/analytics";

const GOLDEN_CSV = readFileSync(
  new URL("./fixtures/analytics/golden-order-lines.csv", import.meta.url),
  "utf8",
);

type ExpectedFixture = {
  readonly totals: {
    readonly orderLineCount: number;
    readonly distinctOrderCount: number;
    readonly distinctCustomerCount: number;
    readonly totalQuantity: number;
    readonly totalRevenueCents: number;
    readonly totalCostCents: number;
    readonly totalGrossProfitCents: number;
    readonly grossMargin: {
      readonly numeratorCents: number;
      readonly denominatorCents: number;
    };
    readonly averageOrderValue: {
      readonly numeratorCents: number;
      readonly denominatorOrders: number;
    };
    readonly totalDiscountCents: number;
    readonly totalMarketingSpendCents: number;
    readonly marketingContributionCents: number;
    readonly marketingRoi: {
      readonly numeratorCents: number;
      readonly denominatorCents: number;
    };
  };
  readonly customerFrequency: {
    readonly oneTimeCustomerCount: number;
    readonly repeatCustomerCount: number;
    readonly repeatCustomerRate: {
      readonly numeratorCustomers: number;
      readonly denominatorCustomers: number;
    };
  };
  readonly marchSelection: {
    readonly period: { readonly start: string; readonly end: string };
    readonly orderLineCount: number;
    readonly distinctOrderCount: number;
    readonly distinctCustomerCount: number;
    readonly totalQuantity: number;
    readonly totalRevenueCents: number;
    readonly totalCostCents: number;
    readonly totalGrossProfitCents: number;
    readonly totalDiscountCents: number;
    readonly totalMarketingSpendCents: number;
    readonly repeatCustomerCountWithinSelection: number;
    readonly repeatCustomerRateWithinSelection: {
      readonly numeratorCustomers: number;
      readonly denominatorCustomers: number;
    };
    readonly fullDatasetRepeatCustomersVisibleInSelection: number;
  };
};

const EXPECTED = JSON.parse(
  readFileSync(new URL("./fixtures/analytics/expected.json", import.meta.url), "utf8"),
) as ExpectedFixture;

const FIXTURE_DATE_RANGE = dateInterval(isoDate("2024-02-28"), isoDate("2024-05-01"));

const VALIDATION_CONFIG = {
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: FIXTURE_DATE_RANGE,
  vocabulary: {
    categories: ["Home", "Kitchen", "Outdoor", "Wellness"],
    regions: ["Central", "East", "South", "West"],
    salesChannels: ["Marketplace", "Retail Pop-up", "Web"],
    customerSegments: ["Loyal", "New", "Occasional"],
    campaigns: [
      "Email Retention",
      "Local Event",
      "Organic Discovery",
      "Paid Social",
      "Sponsored Listings",
    ],
  },
  idPatterns: {
    orderLineId: /^LINE-\d{7}$/,
    orderId: /^ORD-\d{6}$/,
    customerId: /^CUST-\d{4}$/,
    productId: /^PROD-[A-Z]{3}-\d{3}$/,
  },
  marketingSpendSemantics: "single_line_order_allocation" as const,
};

const DATASET_METADATA = {
  datasetVersion: "golden-order-lines-v1",
  transformationVersion: "golden-transform-v1",
  analyticsSpecificationVersion: "3.0.0",
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: FIXTURE_DATE_RANGE,
  revenueSemantics: "net_after_line_discount" as const,
  costSemantics: "line_cost_of_goods" as const,
  marketingSpendSemantics: "single_line_order_allocation" as const,
};

const METRIC_IDS = Object.freeze(Object.keys(METRIC_DEFINITIONS) as MetricId[]);

function loadGoldenDataset(): ValidatedDataset {
  const result = ingestCanonicalCsv({
    text: GOLDEN_CSV,
    metadata: DATASET_METADATA,
    validationConfig: VALIDATION_CONFIG,
  });
  if (result.status !== "valid") {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  return result.dataset;
}

const GOLDEN_DATASET = loadGoldenDataset();

function interval(start: string, end: string): DateInterval {
  return dateInterval(isoDate(start), isoDate(end));
}

function context(overrides: Partial<FilterContextInput> = {}): FilterContext {
  const result = createFilterContext(
    {
      period: FIXTURE_DATE_RANGE,
      ...overrides,
    },
    GOLDEN_DATASET,
  );
  if (result.status === "error") {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  return result.value;
}

function computable(result: MetricResult): ComputableMetricResult {
  if (result.status !== "ok") {
    throw new Error(`${result.metricId ?? "unknown metric"} was not computable: ${result.message}`);
  }
  return result;
}

function expectMoney(result: MetricResult, cents: number): ComputableMetricResult {
  const value = computable(result);
  expect(value.value).toEqual({ kind: "money", cents });
  return value;
}

function expectCount(result: MetricResult, count: number): ComputableMetricResult {
  const value = computable(result);
  expect(value.value).toEqual({ kind: "count", value: count });
  return value;
}

describe("golden metric results", () => {
  it("returns every authoritative KPI as a contextual result envelope with exact values", () => {
    const filterContext = context();
    const results = computeMetrics({ dataset: GOLDEN_DATASET, filterContext });
    const totals = EXPECTED.totals;
    const frequency = EXPECTED.customerFrequency;

    expect(Object.keys(results).sort()).toEqual([...METRIC_IDS].sort());

    expectMoney(results.total_revenue, totals.totalRevenueCents);
    expectMoney(results.total_cost, totals.totalCostCents);
    expectMoney(results.gross_profit, totals.totalGrossProfitCents);
    expect(computable(results.gross_margin).value).toEqual({
      kind: "rate",
      ratio: { numerator: 28, denominator: 95 },
      basisPoints: 2_947,
    });
    expectCount(results.distinct_orders, totals.distinctOrderCount);
    expectCount(results.order_lines, totals.orderLineCount);
    expect(computable(results.total_quantity).value).toEqual({
      kind: "quantity",
      value: totals.totalQuantity,
    });
    expect(computable(results.average_order_value).value).toEqual({
      kind: "rational_money",
      numeratorCents: totals.averageOrderValue.numeratorCents,
      denominator: totals.averageOrderValue.denominatorOrders,
    });
    expectCount(results.unique_customers, totals.distinctCustomerCount);
    expectCount(results.one_time_customers_within_selection, frequency.oneTimeCustomerCount);
    expectCount(results.repeat_customers_within_selection, frequency.repeatCustomerCount);
    expect(computable(results.repeat_customer_rate_within_selection).value).toEqual({
      kind: "rate",
      ratio: { numerator: 1, denominator: 3 },
      basisPoints: 3_333,
    });
    expectCount(results.one_time_customers_full_dataset, frequency.oneTimeCustomerCount);
    expectCount(results.repeat_customers_full_dataset, frequency.repeatCustomerCount);
    expect(computable(results.repeat_customer_rate_full_dataset).value).toEqual({
      kind: "rate",
      ratio: { numerator: 1, denominator: 3 },
      basisPoints: 3_333,
    });
    for (const metricId of [
      "repeat_customer_rate_within_selection",
      "repeat_customer_rate_full_dataset",
    ] satisfies readonly MetricId[]) {
      expect(computable(results[metricId])).toMatchObject({
        numerator: {
          kind: "count",
          value: frequency.repeatCustomerRate.numeratorCustomers,
        },
        denominator: {
          kind: "count",
          value: frequency.repeatCustomerRate.denominatorCustomers,
        },
      });
    }
    expectMoney(results.total_discounts, totals.totalDiscountCents);
    expectMoney(results.total_marketing_spend, totals.totalMarketingSpendCents);
    expectMoney(results.marketing_contribution, totals.marketingContributionCents);
    expect(computable(results.marketing_roi).value).toEqual({
      kind: "rate",
      ratio: { numerator: 17, denominator: 11 },
      basisPoints: 15_455,
    });

    expect(computable(results.gross_margin)).toMatchObject({
      numerator: { kind: "money", cents: totals.grossMargin.numeratorCents },
      denominator: { kind: "money", cents: totals.grossMargin.denominatorCents },
    });
    expect(computable(results.average_order_value)).toMatchObject({
      numerator: { kind: "money", cents: totals.averageOrderValue.numeratorCents },
      denominator: { kind: "count", value: totals.averageOrderValue.denominatorOrders },
    });
    expect(computable(results.marketing_roi)).toMatchObject({
      numerator: { kind: "money", cents: totals.marketingRoi.numeratorCents },
      denominator: { kind: "money", cents: totals.marketingRoi.denominatorCents },
    });

    for (const metricId of METRIC_IDS) {
      const result = computable(results[metricId]);
      expect(result).toMatchObject({
        resultType: "metric",
        status: "ok",
        metricId,
        label: METRIC_DEFINITIONS[metricId].label,
        unit: METRIC_DEFINITIONS[metricId].unit,
        precision: METRIC_DEFINITIONS[metricId].precision,
        currentPeriod: FIXTURE_DATE_RANGE,
        comparisonPeriod: null,
        filterContext,
        dataQuality: { status: "valid", acceptedRowCount: 9, rejectedRowCount: 0 },
        engineVersion: DEFAULT_ANALYTICS_CONFIGURATION.engineVersion,
        previousValue: null,
        absoluteChange: null,
        percentageChange: null,
      });
      expect(typeof result.value).toBe("object");
      expect(result.currency).toBe(METRIC_DEFINITIONS[metricId].currencyRequired ? "USD" : null);
      expect(result.assumptions.length).toBeGreaterThan(0);
      expect(result.evidence).toMatchObject({
        datasetVersion: "golden-order-lines-v1",
        engineVersion: DEFAULT_ANALYTICS_CONFIGURATION.engineVersion,
        matchingRowCount: 9,
        distinctOrderCount: 8,
        affectedDateBuckets: [FIXTURE_DATE_RANGE],
        sampleLimit: DEFAULT_ANALYTICS_CONFIGURATION.evidenceSampleLimit,
        truncated: false,
      });
      expect(result.evidence.sampleOrderLineIds).toHaveLength(9);
      expect(result.evidence.sampleOrderIds).toHaveLength(8);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.value)).toBe(true);
    }

    expect(totals.totalRevenueCents).toBe(totals.totalCostCents + totals.totalGrossProfitCents);
    expect(frequency.repeatCustomerCount).toBeLessThanOrEqual(totals.distinctCustomerCount);
    expect(totals.distinctOrderCount).toBeLessThanOrEqual(totals.orderLineCount);
  });

  it("keeps within-selection and full-dataset repeat semantics analytically distinct", () => {
    const march = EXPECTED.marchSelection;
    const filterContext = context({ period: interval(march.period.start, march.period.end) });
    const results = computeMetrics({ dataset: GOLDEN_DATASET, filterContext });

    expectMoney(results.total_revenue, march.totalRevenueCents);
    expectMoney(results.total_cost, march.totalCostCents);
    expectMoney(results.gross_profit, march.totalGrossProfitCents);
    expectMoney(results.total_discounts, march.totalDiscountCents);
    expectMoney(results.total_marketing_spend, march.totalMarketingSpendCents);
    expectCount(results.order_lines, march.orderLineCount);
    expectCount(results.distinct_orders, march.distinctOrderCount);
    expectCount(results.unique_customers, march.distinctCustomerCount);
    expect(computable(results.total_quantity).value).toEqual({
      kind: "quantity",
      value: march.totalQuantity,
    });

    expectCount(
      results.repeat_customers_within_selection,
      march.repeatCustomerCountWithinSelection,
    );
    expectCount(results.one_time_customers_within_selection, 3);
    expect(computable(results.repeat_customer_rate_within_selection).value).toEqual({
      kind: "rate",
      ratio: { numerator: 0, denominator: 1 },
      basisPoints: 0,
    });
    expect(computable(results.repeat_customer_rate_within_selection)).toMatchObject({
      numerator: {
        kind: "count",
        value: march.repeatCustomerRateWithinSelection.numeratorCustomers,
      },
      denominator: {
        kind: "count",
        value: march.repeatCustomerRateWithinSelection.denominatorCustomers,
      },
    });

    expectCount(
      results.repeat_customers_full_dataset,
      march.fullDatasetRepeatCustomersVisibleInSelection,
    );
    expectCount(results.one_time_customers_full_dataset, 2);
    expect(computable(results.repeat_customer_rate_full_dataset).value).toEqual({
      kind: "rate",
      ratio: { numerator: 1, denominator: 3 },
      basisPoints: 3_333,
    });
    expect(computable(results.repeat_customers_within_selection).assumptions.join(" ")).toContain(
      "after the full filter context",
    );
    expect(computable(results.repeat_customers_full_dataset).assumptions.join(" ")).toContain(
      "all validated dataset rows",
    );
  });

  it("distinguishes a selected zero-revenue row from a filter with no matching rows", () => {
    const selectedZero = computeMetrics({
      dataset: GOLDEN_DATASET,
      filterContext: context({ regions: ["South"] }),
    });

    expectMoney(selectedZero.total_revenue, 0);
    expectMoney(selectedZero.total_cost, 200);
    expectMoney(selectedZero.gross_profit, -200);
    expectMoney(selectedZero.marketing_contribution, -200);
    expectCount(selectedZero.distinct_orders, 1);
    expectCount(selectedZero.order_lines, 1);
    expectCount(selectedZero.unique_customers, 1);
    expect(computable(selectedZero.average_order_value).value).toEqual({
      kind: "rational_money",
      numeratorCents: 0,
      denominator: 1,
    });
    expect(computable(selectedZero.repeat_customer_rate_within_selection).value).toEqual({
      kind: "rate",
      ratio: { numerator: 0, denominator: 1 },
      basisPoints: 0,
    });
    expect(selectedZero.gross_margin).toMatchObject({
      resultType: "non_computable",
      reason: "zero_denominator",
      evidence: { matchingRowCount: 1 },
    });
    expect(selectedZero.marketing_roi).toMatchObject({
      resultType: "non_computable",
      reason: "zero_denominator",
      evidence: { matchingRowCount: 1 },
    });

    const noMatches = computeMetrics({
      dataset: GOLDEN_DATASET,
      filterContext: context({ categories: ["Home"], regions: ["South"] }),
    });
    for (const metricId of [
      "total_revenue",
      "total_cost",
      "gross_profit",
      "total_discounts",
      "total_marketing_spend",
      "marketing_contribution",
    ] satisfies readonly MetricId[]) {
      expectMoney(noMatches[metricId], 0);
    }
    for (const metricId of [
      "distinct_orders",
      "order_lines",
      "unique_customers",
      "one_time_customers_within_selection",
      "repeat_customers_within_selection",
      "one_time_customers_full_dataset",
      "repeat_customers_full_dataset",
    ] satisfies readonly MetricId[]) {
      expectCount(noMatches[metricId], 0);
    }
    expect(computable(noMatches.total_quantity).value).toEqual({ kind: "quantity", value: 0 });
    for (const metricId of [
      "gross_margin",
      "average_order_value",
      "repeat_customer_rate_within_selection",
      "repeat_customer_rate_full_dataset",
      "marketing_roi",
    ] satisfies readonly MetricId[]) {
      expect(noMatches[metricId]).toMatchObject({
        resultType: "non_computable",
        status: "not_applicable",
        reason: "zero_denominator",
        evidence: { matchingRowCount: 0, distinctOrderCount: 0 },
      });
    }
  });

  it("does not mutate inputs and caps deterministic evidence samples", () => {
    const filterContext = context();
    const datasetBefore = JSON.stringify(GOLDEN_DATASET);
    const filterBefore = JSON.stringify(filterContext);
    const configuration: AnalyticsConfiguration = Object.freeze({
      ...DEFAULT_ANALYTICS_CONFIGURATION,
      evidenceSampleLimit: 2,
    });

    const first = computeMetrics({ dataset: GOLDEN_DATASET, filterContext, configuration });
    const second = computeMetrics({ dataset: GOLDEN_DATASET, filterContext, configuration });

    expect(JSON.stringify(GOLDEN_DATASET)).toBe(datasetBefore);
    expect(JSON.stringify(filterContext)).toBe(filterBefore);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    for (const metricId of METRIC_IDS) {
      const result = first[metricId];
      expect(result.evidence).toMatchObject({
        matchingRowCount: 9,
        sampleLimit: 2,
        truncated: true,
      });
      expect(result.evidence.sampleOrderLineIds).toEqual(["LINE-9000001", "LINE-9000002"]);
      expect(result.evidence.sampleOrderIds).toEqual(["ORD-900001", "ORD-900002"]);
      expect(result.evidence.sampleOrderLineIds.length).toBeLessThanOrEqual(2);
      expect(result.evidence.sampleOrderIds.length).toBeLessThanOrEqual(2);
    }
  });
});
