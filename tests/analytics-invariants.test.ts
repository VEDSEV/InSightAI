// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MISSING_DIMENSION_KEY,
  analyzeTrendContributions,
  calculateBreakdown,
  computeMetrics,
  createFilterContext,
  dateInterval,
  filterDataset,
  ingestCanonicalCsv,
  isoDate,
  type AnalyticsResult,
  type BreakdownDimension,
  type BreakdownResult,
  type ComputableBreakdownResult,
  type ComputableMetricResult,
  type DateInterval,
  type FilterContextInput,
  type MetricResult,
  type RateMetricValue,
  type TrendContributionResult,
  type ValidatedDataset,
} from "@/analytics";

const GOLDEN_CSV = readFileSync(
  new URL("./fixtures/analytics/golden-order-lines.csv", import.meta.url),
  "utf8",
);

const FIXTURE_RANGE = dateInterval(isoDate("2024-02-28"), isoDate("2024-05-01"));

const VALIDATION_CONFIG = {
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: FIXTURE_RANGE,
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
  dateRange: FIXTURE_RANGE,
  revenueSemantics: "net_after_line_discount" as const,
  costSemantics: "line_cost_of_goods" as const,
  marketingSpendSemantics: "single_line_order_allocation" as const,
};

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

function unwrap<T>(result: AnalyticsResult<T>): T {
  if (result.status === "error") {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  return result.value;
}

function computableMetric(result: MetricResult): ComputableMetricResult {
  if (result.status !== "ok") {
    throw new Error(`${result.metricId ?? "metric"} was not computable: ${result.message}`);
  }
  return result;
}

function computableBreakdown(result: BreakdownResult): ComputableBreakdownResult {
  if (result.status !== "ok") {
    throw new Error(`Breakdown was not computable: ${result.message}`);
  }
  return result;
}

function money(result: MetricResult): number {
  const value = computableMetric(result).value;
  if (value.kind !== "money") {
    throw new Error(`Expected money metric, received ${value.kind}.`);
  }
  return value.cents;
}

function count(result: MetricResult): number {
  const value = computableMetric(result).value;
  if (value.kind !== "count") {
    throw new Error(`Expected count metric, received ${value.kind}.`);
  }
  return value.value;
}

function quantity(result: MetricResult): number {
  const value = computableMetric(result).value;
  if (value.kind !== "quantity") {
    throw new Error(`Expected quantity metric, received ${value.kind}.`);
  }
  return value.value;
}

function metricsFor(dataset: ValidatedDataset, filter: FilterContextInput) {
  const normalized = unwrap(createFilterContext(filter, dataset));
  return computeMetrics({ dataset, filterContext: normalized });
}

function independentlyRoundedBasisPoints(numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new RangeError("Independent rate assertion requires a non-zero denominator.");
  }
  const negative = numerator < 0 !== denominator < 0;
  const scaled = BigInt(Math.abs(numerator)) * BigInt(10_000);
  const divisor = BigInt(Math.abs(denominator));
  let rounded = scaled / divisor;
  if ((scaled % divisor) * BigInt(2) >= divisor) {
    rounded += BigInt(1);
  }
  return Number(negative ? -rounded : rounded);
}

function expectExactRate(rate: RateMetricValue, numerator: number, denominator: number): void {
  expect(rate.ratio.numerator * denominator).toBe(numerator * rate.ratio.denominator);
  expect(rate.basisPoints).toBe(independentlyRoundedBasisPoints(numerator, denominator));
}

function reorderedDatasets(dataset: ValidatedDataset): readonly ValidatedDataset[] {
  const rows = [...dataset.rows];
  const rotateBy = 3;
  const permutations = [
    rows,
    [...rows].reverse(),
    [...rows.slice(rotateBy), ...rows.slice(0, rotateBy)],
    [...rows.filter((_, index) => index % 2 === 0), ...rows.filter((_, index) => index % 2 === 1)],
  ];
  return Object.freeze(
    permutations.map((permutation) =>
      Object.freeze({ ...dataset, rows: Object.freeze(permutation) }),
    ),
  );
}

const FILTER_CASES: readonly {
  readonly name: string;
  readonly filter: FilterContextInput;
}[] = Object.freeze([
  { name: "full dataset", filter: { period: FIXTURE_RANGE } },
  {
    name: "March period",
    filter: { period: interval("2024-03-01", "2024-03-31") },
  },
  { name: "East region", filter: { period: FIXTURE_RANGE, regions: ["East"] } },
  { name: "Web channel", filter: { period: FIXTURE_RANGE, salesChannels: ["Web"] } },
  {
    name: "missing campaign",
    filter: { period: FIXTURE_RANGE, campaigns: [MISSING_DIMENSION_KEY] },
  },
  {
    name: "valid no-match intersection",
    filter: { period: FIXTURE_RANGE, categories: ["Home"], regions: ["South"] },
  },
]);

const BREAKDOWN_DIMENSIONS: readonly BreakdownDimension[] = Object.freeze([
  "product",
  "category",
  "region",
  "channel",
  "customer_segment",
  "campaign",
]);

describe("metric and filtering invariants", () => {
  it.each(FILTER_CASES)(
    "preserves cent identities, count bounds, margin semantics, and input immutability for $name",
    ({ filter }) => {
      const datasetBefore = JSON.stringify(GOLDEN_DATASET);
      const filterBefore = JSON.stringify(filter);
      const filtered = unwrap(filterDataset(GOLDEN_DATASET, filter));
      const results = metricsFor(GOLDEN_DATASET, filter);
      const revenue = money(results.total_revenue);
      const cost = money(results.total_cost);
      const grossProfit = money(results.gross_profit);
      const lines = count(results.order_lines);
      const orders = count(results.distinct_orders);
      const customers = count(results.unique_customers);
      const repeatWithin = count(results.repeat_customers_within_selection);
      const oneTimeWithin = count(results.one_time_customers_within_selection);
      const repeatFull = count(results.repeat_customers_full_dataset);
      const oneTimeFull = count(results.one_time_customers_full_dataset);

      expect(revenue).toBe(cost + grossProfit);
      expect(orders).toBeLessThanOrEqual(lines);
      expect(repeatWithin).toBeLessThanOrEqual(customers);
      expect(repeatFull).toBeLessThanOrEqual(customers);
      expect(oneTimeWithin + repeatWithin).toBe(customers);
      expect(oneTimeFull + repeatFull).toBe(customers);
      expect(lines).toBe(filtered.rows.length);
      expect(filtered.rows.length).toBeLessThanOrEqual(GOLDEN_DATASET.rows.length);
      expect(new Set(filtered.rows.map((row) => row.orderLineId)).size).toBe(filtered.rows.length);
      expect(
        filtered.rows.every((row) =>
          GOLDEN_DATASET.rows.some((source) => source.orderLineId === row.orderLineId),
        ),
      ).toBe(true);

      if (revenue === 0) {
        expect(results.gross_margin).toMatchObject({
          resultType: "non_computable",
          reason: "zero_denominator",
        });
      } else {
        const margin = computableMetric(results.gross_margin).value;
        if (margin.kind !== "rate") {
          throw new Error(`Expected rate metric, received ${margin.kind}.`);
        }
        expectExactRate(margin, grossProfit, revenue);
      }

      for (const result of Object.values(results)) {
        expect(result.evidence.matchingRowCount).toBe(filtered.rows.length);
        expect(result.evidence.matchingRowCount).toBeLessThanOrEqual(GOLDEN_DATASET.rows.length);
      }
      expect(JSON.stringify(GOLDEN_DATASET)).toBe(datasetBefore);
      expect(JSON.stringify(filter)).toBe(filterBefore);
      expect(Object.isFrozen(filtered.rows)).toBe(true);
    },
  );

  it("returns identical metrics and evidence for deterministic source-row permutations", () => {
    const variants = reorderedDatasets(GOLDEN_DATASET);
    const baseline = metricsFor(variants[0], { period: FIXTURE_RANGE });

    for (const variant of variants.slice(1)) {
      expect(metricsFor(variant, { period: FIXTURE_RANGE })).toEqual(baseline);
    }
  });
});

describe("breakdown and partition invariants", () => {
  it.each(FILTER_CASES)(
    "reconciles additive breakdowns and exact/serialized revenue shares for $name",
    ({ filter }) => {
      const metrics = metricsFor(GOLDEN_DATASET, filter);
      const expectedRevenue = money(metrics.total_revenue);
      const expectedCost = money(metrics.total_cost);
      const expectedProfit = money(metrics.gross_profit);
      const expectedQuantity = quantity(metrics.total_quantity);

      for (const dimension of BREAKDOWN_DIMENSIONS) {
        const result = computableBreakdown(
          unwrap(calculateBreakdown(GOLDEN_DATASET, { dimension, filter })),
        );
        expect(result.entries.reduce((sum, entry) => sum + entry.revenue, 0)).toBe(expectedRevenue);
        expect(result.entries.reduce((sum, entry) => sum + entry.cost, 0)).toBe(expectedCost);
        expect(result.entries.reduce((sum, entry) => sum + entry.grossProfit, 0)).toBe(
          expectedProfit,
        );
        expect(result.entries.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(
          expectedQuantity,
        );

        let serializedShareTotal = 0;
        for (const entry of result.entries) {
          expect(entry.revenue).toBe(entry.cost + entry.grossProfit);
          if (expectedRevenue === 0) {
            expect(entry.revenueShare).toMatchObject({
              kind: "non_computable_value",
              reason: "zero_denominator",
            });
          } else {
            if (entry.revenueShare.kind !== "rate") {
              throw new Error(`${dimension}/${entry.key} revenue share was not computable.`);
            }
            expectExactRate(entry.revenueShare, entry.revenue, expectedRevenue);
            serializedShareTotal += entry.revenueShare.basisPoints;
          }
        }
        if (expectedRevenue !== 0) {
          expect(Math.abs(serializedShareTotal - 10_000)).toBeLessThanOrEqual(
            Math.ceil(result.entries.length / 2),
          );
        }
      }
    },
  );

  it("keeps sorting and bounded evidence stable under four deterministic row orders", () => {
    const variants = reorderedDatasets(GOLDEN_DATASET);
    for (const dimension of BREAKDOWN_DIMENSIONS) {
      const baseline = computableBreakdown(
        unwrap(
          calculateBreakdown(variants[0], {
            dimension,
            filter: { period: FIXTURE_RANGE },
            sortBy: "orders",
            sortDirection: "descending",
          }),
        ),
      );
      for (const variant of variants.slice(1)) {
        const actual = computableBreakdown(
          unwrap(
            calculateBreakdown(variant, {
              dimension,
              filter: { period: FIXTURE_RANGE },
              sortBy: "orders",
              sortDirection: "descending",
            }),
          ),
        );
        expect(actual).toEqual(baseline);
      }
      for (const entry of baseline.entries) {
        expect(entry.evidence.sampleOrderLineIds.length).toBeLessThanOrEqual(
          entry.evidence.sampleLimit,
        );
        expect([...entry.evidence.sampleOrderLineIds].sort()).toEqual(
          entry.evidence.sampleOrderLineIds,
        );
      }
    }
  });

  it.each([
    ["region", ["Central", "East", "South", "West"]],
    ["channel", ["Marketplace", "Retail Pop-up", "Web"]],
  ] as const)("reconciles disjoint %s row partitions to the full selected set", (kind, values) => {
    const fullMetrics = metricsFor(GOLDEN_DATASET, { period: FIXTURE_RANGE });
    const seen = new Set<string>();
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    let lineCount = 0;
    let totalQuantity = 0;

    for (const value of values) {
      const selection =
        kind === "region"
          ? { period: FIXTURE_RANGE, regions: [value] }
          : { period: FIXTURE_RANGE, salesChannels: [value] };
      const partition = unwrap(filterDataset(GOLDEN_DATASET, selection));
      const metrics = metricsFor(GOLDEN_DATASET, selection);
      for (const row of partition.rows) {
        expect(seen.has(row.orderLineId)).toBe(false);
        seen.add(row.orderLineId);
      }
      revenue += money(metrics.total_revenue);
      cost += money(metrics.total_cost);
      profit += money(metrics.gross_profit);
      lineCount += count(metrics.order_lines);
      totalQuantity += quantity(metrics.total_quantity);
    }

    expect([...seen].sort()).toEqual(GOLDEN_DATASET.rows.map((row) => row.orderLineId).sort());
    expect(revenue).toBe(money(fullMetrics.total_revenue));
    expect(cost).toBe(money(fullMetrics.total_cost));
    expect(profit).toBe(money(fullMetrics.gross_profit));
    expect(lineCount).toBe(count(fullMetrics.order_lines));
    expect(totalQuantity).toBe(quantity(fullMetrics.total_quantity));
  });
});

describe("trend contribution invariants", () => {
  function contributionResult(dataset: ValidatedDataset): TrendContributionResult {
    const result = unwrap(
      analyzeTrendContributions(dataset, {
        filter: { period: interval("2024-04-01", "2024-04-30") },
        comparison: { kind: "previous_equal_length" },
        dimension: "category",
        frequency: "daily",
      }),
    );
    if (result.resultType !== "trend_contribution") {
      throw new Error(`Trend contribution was not computable: ${result.message}`);
    }
    return result;
  }

  it("reconciles every segment delta and exact contribution share to total revenue change", () => {
    const result = contributionResult(GOLDEN_DATASET);
    expect(result.absoluteChange).toBe(result.currentRevenue - result.previousRevenue);
    expect(result.contributions.reduce((sum, entry) => sum + entry.absoluteChange, 0)).toBe(
      result.absoluteChange,
    );

    let serializedContributionTotal = 0;
    for (const contribution of result.contributions) {
      expect(contribution.absoluteChange).toBe(
        contribution.currentRevenue - contribution.previousRevenue,
      );
      if (contribution.contributionToTotalChange.kind !== "rate") {
        throw new Error(`Contribution for ${contribution.key} was not computable.`);
      }
      expectExactRate(
        contribution.contributionToTotalChange,
        contribution.absoluteChange,
        result.absoluteChange,
      );
      serializedContributionTotal += contribution.contributionToTotalChange.basisPoints;
    }
    expect(Math.abs(serializedContributionTotal - 10_000)).toBeLessThanOrEqual(
      Math.ceil(result.contributions.length / 2),
    );
    expect(result.assumptions.join(" ")).toContain("does not imply causation");
  });

  it("keeps contribution ordering and evidence stable under deterministic row reordering", () => {
    const variants = reorderedDatasets(GOLDEN_DATASET);
    const baseline = contributionResult(variants[0]);
    for (const variant of variants.slice(1)) {
      expect(contributionResult(variant)).toEqual(baseline);
    }
  });

  it("uses a typed non-computable share when total revenue change is zero", () => {
    const result = unwrap(
      analyzeTrendContributions(GOLDEN_DATASET, {
        filter: {
          period: interval("2024-04-01", "2024-04-30"),
          regions: ["South"],
        },
        comparison: { kind: "previous_equal_length" },
        dimension: "category",
      }),
    );
    if (result.resultType !== "trend_contribution") {
      throw new Error(`Trend contribution was not computable: ${result.message}`);
    }
    expect(result.absoluteChange).toBe(0);
    expect(result.contributions.reduce((sum, entry) => sum + entry.absoluteChange, 0)).toBe(0);
    for (const contribution of result.contributions) {
      expect(contribution.contributionToTotalChange).toMatchObject({
        kind: "non_computable_value",
        reason: "zero_denominator",
      });
    }
  });
});
