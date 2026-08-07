// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MISSING_DIMENSION_KEY,
  calculateBreakdown,
  calculateConcentration,
  compareMetric,
  dateInterval,
  ingestCanonicalCsv,
  isoDate,
  resolveComparisonPeriod,
  type AnalyticsResult,
  type BreakdownDimension,
  type BreakdownResult,
  type ComputableBreakdownResult,
  type ComputableConcentrationResult,
  type ComputableMetricResult,
  type ConcentrationDimension,
  type ConcentrationResult,
  type DateInterval,
  type FilterContextInput,
  type MetricResult,
  type NonComputableValue,
  type TopRevenueShare,
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
  };
  readonly revenueByProduct: readonly {
    readonly key: string;
    readonly revenueCents: number;
    readonly costCents: number;
    readonly grossProfitCents: number;
    readonly distinctOrderCount: number;
    readonly quantity: number;
    readonly distinctCustomerCount: number;
  }[];
  readonly revenueByCategoryCents: Readonly<Record<string, number>>;
  readonly revenueByRegionCents: Readonly<Record<string, number>>;
  readonly revenueByChannelCents: Readonly<Record<string, number>>;
  readonly productConcentration: {
    readonly topOneRevenueShare: {
      readonly numeratorCents: number;
      readonly denominatorCents: number;
    };
    readonly topThreeRevenueShare: {
      readonly numeratorCents: number;
      readonly denominatorCents: number;
    };
    readonly topFiveStatus: string;
    readonly hhi: { readonly numerator: number; readonly denominator: number };
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

function filter(
  period: DateInterval = FIXTURE_DATE_RANGE,
  overrides: Omit<Partial<FilterContextInput>, "period"> = {},
): FilterContextInput {
  return Object.freeze({ period, ...overrides });
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

function computableConcentration(result: ConcentrationResult): ComputableConcentrationResult {
  if (result.status !== "ok") {
    throw new Error(`Concentration was not computable: ${result.message}`);
  }
  return result;
}

function topShare(value: TopRevenueShare | NonComputableValue): TopRevenueShare {
  if ("kind" in value) {
    throw new Error(`Top-share result was not computable: ${value.message}`);
  }
  return value;
}

describe("period comparisons", () => {
  it("resolves inclusive equal-length, calendar-month, quarter, and leap-year periods", () => {
    expect(
      resolveComparisonPeriod(interval("2024-04-01", "2024-04-30"), {
        kind: "previous_equal_length",
      }),
    ).toMatchObject({
      status: "ok",
      comparisonPeriod: { start: "2024-03-02", end: "2024-03-31", boundary: "inclusive" },
    });
    expect(
      resolveComparisonPeriod(interval("2024-03-01", "2024-03-31"), {
        kind: "previous_calendar_month",
      }),
    ).toMatchObject({
      status: "ok",
      comparisonPeriod: { start: "2024-02-01", end: "2024-02-29", boundary: "inclusive" },
    });
    expect(
      resolveComparisonPeriod(interval("2024-05-01", "2024-05-31"), {
        kind: "previous_calendar_month",
      }),
    ).toMatchObject({
      status: "ok",
      comparisonPeriod: { start: "2024-04-01", end: "2024-04-30", boundary: "inclusive" },
    });
    expect(
      resolveComparisonPeriod(interval("2025-01-01", "2025-03-31"), {
        kind: "previous_calendar_quarter",
      }),
    ).toMatchObject({
      status: "ok",
      comparisonPeriod: { start: "2024-10-01", end: "2024-12-31", boundary: "inclusive" },
    });
    expect(
      resolveComparisonPeriod(interval("2024-02-29", "2024-02-29"), {
        kind: "previous_year",
      }),
    ).toMatchObject({
      status: "ok",
      comparisonPeriod: { start: "2023-02-28", end: "2023-02-28", boundary: "inclusive" },
    });

    expect(
      resolveComparisonPeriod(interval("2024-03-01", "2024-03-15"), {
        kind: "previous_calendar_month",
      }),
    ).toMatchObject({ status: "non_computable", reason: "invalid_filter" });
    expect(
      resolveComparisonPeriod(interval("2024-01-01", "2024-03-30"), {
        kind: "previous_calendar_quarter",
      }),
    ).toMatchObject({ status: "non_computable", reason: "invalid_filter" });
  });

  it("computes exact equal-length and calendar-month changes without mixing period boundaries", () => {
    const equalLength = computableMetric(
      unwrap(
        compareMetric(GOLDEN_DATASET, {
          metricId: "total_revenue",
          filter: filter(interval("2024-04-01", "2024-04-30")),
          comparison: { kind: "previous_equal_length" },
        }),
      ),
    );
    expect(equalLength).toMatchObject({
      value: { kind: "money", cents: 2_500 },
      previousValue: { kind: "money", cents: 900 },
      absoluteChange: { kind: "money", cents: 1_600 },
      percentageChange: {
        kind: "rate",
        ratio: { numerator: 16, denominator: 9 },
        basisPoints: 17_778,
      },
      currentPeriod: { start: "2024-04-01", end: "2024-04-30" },
      comparisonPeriod: { start: "2024-03-02", end: "2024-03-31" },
    });
    expect(equalLength.evidence.affectedDateBuckets).toEqual([
      interval("2024-03-02", "2024-03-31"),
      interval("2024-04-01", "2024-04-30"),
    ]);

    const calendarMonth = computableMetric(
      unwrap(
        compareMetric(GOLDEN_DATASET, {
          metricId: "total_revenue",
          filter: filter(interval("2024-04-01", "2024-04-30")),
          comparison: { kind: "previous_calendar_month" },
        }),
      ),
    );
    expect(calendarMonth).toMatchObject({
      value: { kind: "money", cents: 2_500 },
      previousValue: { kind: "money", cents: 1_700 },
      absoluteChange: { kind: "money", cents: 800 },
      percentageChange: {
        kind: "rate",
        ratio: { numerator: 8, denominator: 17 },
        basisPoints: 4_706,
      },
      comparisonPeriod: { start: "2024-03-01", end: "2024-03-31" },
    });
  });

  it("returns explicit invalid-filter and insufficient-history outcomes", () => {
    const partialMonth = unwrap(
      compareMetric(GOLDEN_DATASET, {
        metricId: "total_revenue",
        filter: filter(interval("2024-03-01", "2024-03-15")),
        comparison: { kind: "previous_calendar_month" },
      }),
    );
    expect(partialMonth).toMatchObject({
      resultType: "non_computable",
      status: "not_applicable",
      reason: "invalid_filter",
      comparisonPeriod: null,
    });

    const beforeCoverage = unwrap(
      compareMetric(GOLDEN_DATASET, {
        metricId: "total_revenue",
        filter: filter(interval("2024-02-28", "2024-02-28")),
        comparison: { kind: "previous_equal_length" },
      }),
    );
    expect(beforeCoverage).toMatchObject({
      resultType: "non_computable",
      status: "insufficient_data",
      reason: "insufficient_history",
    });

    const previousYear = unwrap(
      compareMetric(GOLDEN_DATASET, {
        metricId: "total_revenue",
        filter: filter(interval("2024-02-29", "2024-02-29")),
        comparison: { kind: "previous_year" },
      }),
    );
    expect(previousYear).toMatchObject({
      resultType: "non_computable",
      status: "insufficient_data",
      reason: "insufficient_history",
    });
  });

  it("separates prior-zero growth from a both-zero comparison and reapplies non-date filters", () => {
    const priorZero = computableMetric(
      unwrap(
        compareMetric(GOLDEN_DATASET, {
          metricId: "total_revenue",
          filter: filter(interval("2024-04-01", "2024-04-30"), { regions: ["East"] }),
          comparison: { kind: "previous_equal_length" },
        }),
      ),
    );
    expect(priorZero).toMatchObject({
      value: { kind: "money", cents: 1_600 },
      previousValue: { kind: "money", cents: 0 },
      absoluteChange: { kind: "money", cents: 1_600 },
      percentageChange: {
        kind: "non_computable_value",
        status: "not_applicable",
        reason: "zero_denominator",
      },
      filterContext: { regions: ["East"] },
      evidence: { matchingRowCount: 1 },
    });
    expect(priorZero.assumptions.join(" ")).toContain("same non-date filters");

    const bothZero = computableMetric(
      unwrap(
        compareMetric(GOLDEN_DATASET, {
          metricId: "total_revenue",
          filter: filter(interval("2024-04-01", "2024-04-30"), { regions: ["South"] }),
          comparison: { kind: "previous_equal_length" },
        }),
      ),
    );
    expect(bothZero).toMatchObject({
      value: { kind: "money", cents: 0 },
      previousValue: { kind: "money", cents: 0 },
      absoluteChange: { kind: "money", cents: 0 },
      percentageChange: {
        kind: "rate",
        ratio: { numerator: 0, denominator: 1 },
        basisPoints: 0,
      },
      filterContext: { regions: ["South"] },
    });
  });
});

describe("breakdowns", () => {
  const expectedKeys: Readonly<Record<BreakdownDimension, readonly string[]>> = {
    product: ["PROD-HOM-901", "PROD-OUT-901", "PROD-WEL-901", "PROD-KIT-901"],
    category: ["Home", "Outdoor", "Wellness", "Kitchen"],
    region: ["West", "Central", "East", "South"],
    channel: ["Web", "Marketplace", "Retail Pop-up"],
    customer_segment: ["Loyal", MISSING_DIMENSION_KEY, "New", "Occasional"],
    campaign: [
      "Email Retention",
      MISSING_DIMENSION_KEY,
      "Sponsored Listings",
      "Organic Discovery",
      "Paid Social",
      "Local Event",
    ],
  };

  it.each(Object.keys(expectedKeys) as BreakdownDimension[])(
    "reconciles exact additive totals and shares for the %s breakdown",
    (dimension) => {
      const result = computableBreakdown(
        unwrap(calculateBreakdown(GOLDEN_DATASET, { dimension, filter: filter() })),
      );

      expect(result.entries.map((entry) => entry.key)).toEqual(expectedKeys[dimension]);
      expect(result.entries.reduce((sum, entry) => sum + entry.revenue, 0)).toBe(
        EXPECTED.totals.totalRevenueCents,
      );
      expect(result.entries.reduce((sum, entry) => sum + entry.cost, 0)).toBe(
        EXPECTED.totals.totalCostCents,
      );
      expect(result.entries.reduce((sum, entry) => sum + entry.grossProfit, 0)).toBe(
        EXPECTED.totals.totalGrossProfitCents,
      );
      expect(result.entries.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(
        EXPECTED.totals.totalQuantity,
      );
      expect(result.evidence.matchingRowCount).toBe(EXPECTED.totals.orderLineCount);
      expect(result.assumptions.join(" ")).toContain("not additive across segments");

      for (const entry of result.entries) {
        expect(entry.revenue).toBe(entry.cost + entry.grossProfit);
        expect(entry.orders).toBeLessThanOrEqual(entry.evidence.matchingRowCount);
        expect(entry.customers).toBeLessThanOrEqual(entry.orders);
        expect(entry.quantity).toBeGreaterThanOrEqual(entry.evidence.matchingRowCount);
        expect(entry.evidence.segmentKeys).toEqual([entry.key]);
        expect(entry.evidence.sampleOrderLineIds.length).toBeLessThanOrEqual(
          entry.evidence.sampleLimit,
        );

        if (entry.revenueShare.kind !== "rate") {
          throw new Error(`Revenue share for ${dimension}/${entry.key} was not computable.`);
        }
        expect(entry.revenueShare.ratio.numerator * EXPECTED.totals.totalRevenueCents).toBe(
          entry.revenue * entry.revenueShare.ratio.denominator,
        );
        if (entry.profitShare.kind !== "rate") {
          throw new Error(`Profit share for ${dimension}/${entry.key} was not computable.`);
        }
        expect(entry.profitShare.ratio.numerator * EXPECTED.totals.totalGrossProfitCents).toBe(
          entry.grossProfit * entry.profitShare.ratio.denominator,
        );
      }
    },
  );

  it("matches independently recorded product, category, region, and channel controls", () => {
    const products = computableBreakdown(
      unwrap(calculateBreakdown(GOLDEN_DATASET, { dimension: "product", filter: filter() })),
    );
    expect(
      products.entries.map((entry) => ({
        key: entry.key,
        revenueCents: entry.revenue,
        costCents: entry.cost,
        grossProfitCents: entry.grossProfit,
        distinctOrderCount: entry.orders,
        quantity: entry.quantity,
        distinctCustomerCount: entry.customers,
      })),
    ).toEqual(EXPECTED.revenueByProduct);

    for (const [dimension, expected] of [
      ["category", EXPECTED.revenueByCategoryCents],
      ["region", EXPECTED.revenueByRegionCents],
      ["channel", EXPECTED.revenueByChannelCents],
    ] as const) {
      const result = computableBreakdown(
        unwrap(calculateBreakdown(GOLDEN_DATASET, { dimension, filter: filter() })),
      );
      expect(Object.fromEntries(result.entries.map((entry) => [entry.key, entry.revenue]))).toEqual(
        expected,
      );
    }
  });

  it("uses one explicit missing sentinel and permits selecting missing optional dimensions", () => {
    const customerSegments = computableBreakdown(
      unwrap(
        calculateBreakdown(GOLDEN_DATASET, {
          dimension: "customer_segment",
          filter: filter(),
        }),
      ),
    );
    expect(
      customerSegments.entries.find((entry) => entry.key === MISSING_DIMENSION_KEY),
    ).toMatchObject({
      label: MISSING_DIMENSION_KEY,
      revenue: 2_400,
      cost: 3_000,
      grossProfit: -600,
      orders: 2,
      customers: 1,
      evidence: { matchingRowCount: 2 },
    });

    const missingCampaignOnly = computableBreakdown(
      unwrap(
        calculateBreakdown(GOLDEN_DATASET, {
          dimension: "campaign",
          filter: filter(FIXTURE_DATE_RANGE, { campaigns: [MISSING_DIMENSION_KEY] }),
        }),
      ),
    );
    expect(missingCampaignOnly.filterContext.campaigns).toEqual([MISSING_DIMENSION_KEY]);
    expect(missingCampaignOnly.entries).toHaveLength(1);
    expect(missingCampaignOnly.entries[0]).toMatchObject({
      key: MISSING_DIMENSION_KEY,
      revenue: 2_400,
      cost: 3_000,
      evidence: { matchingRowCount: 2 },
    });
    expect(missingCampaignOnly.evidence.matchingRowCount).toBeLessThanOrEqual(
      EXPECTED.totals.orderLineCount,
    );
  });

  it("sorts ties by stable code-point keys and is invariant to source-row order", () => {
    const datasetBefore = JSON.stringify(GOLDEN_DATASET);
    const original = computableBreakdown(
      unwrap(
        calculateBreakdown(GOLDEN_DATASET, {
          dimension: "product",
          filter: filter(),
          sortBy: "orders",
          sortDirection: "descending",
        }),
      ),
    );
    expect(original.entries.map((entry) => [entry.key, entry.orders])).toEqual([
      ["PROD-HOM-901", 3],
      ["PROD-KIT-901", 3],
      ["PROD-OUT-901", 2],
      ["PROD-WEL-901", 1],
    ]);

    const reversedDataset: ValidatedDataset = Object.freeze({
      ...GOLDEN_DATASET,
      rows: Object.freeze([...GOLDEN_DATASET.rows].reverse()),
    });
    const reversed = computableBreakdown(
      unwrap(
        calculateBreakdown(reversedDataset, {
          dimension: "product",
          filter: filter(),
          sortBy: "orders",
          sortDirection: "descending",
        }),
      ),
    );
    expect(reversed).toEqual(original);
    expect(JSON.stringify(GOLDEN_DATASET)).toBe(datasetBefore);
  });

  it("includes the union of current and prior segment keys with explicit zero-prior changes", () => {
    const result = computableBreakdown(
      unwrap(
        calculateBreakdown(GOLDEN_DATASET, {
          dimension: "category",
          filter: filter(interval("2024-04-01", "2024-04-30")),
          comparison: { kind: "previous_calendar_month" },
        }),
      ),
    );
    expect(result.entries.map((entry) => entry.key)).toEqual(["Outdoor", "Home", "Kitchen"]);
    expect(result.comparisonPeriod).toEqual(interval("2024-03-01", "2024-03-31"));

    expect(result.entries.find((entry) => entry.key === "Outdoor")).toMatchObject({
      revenue: 1_600,
      comparison: {
        previousRevenue: 800,
        absoluteRevenueChange: 800,
        percentageRevenueChange: {
          kind: "rate",
          ratio: { numerator: 1, denominator: 1 },
          basisPoints: 10_000,
        },
      },
    });
    expect(result.entries.find((entry) => entry.key === "Home")).toMatchObject({
      revenue: 900,
      comparison: {
        previousRevenue: 0,
        absoluteRevenueChange: 900,
        percentageRevenueChange: {
          kind: "non_computable_value",
          reason: "zero_denominator",
        },
      },
    });
    expect(result.entries.find((entry) => entry.key === "Kitchen")).toMatchObject({
      revenue: 0,
      comparison: {
        previousRevenue: 900,
        absoluteRevenueChange: -900,
        percentageRevenueChange: {
          kind: "rate",
          ratio: { numerator: -1, denominator: 1 },
          basisPoints: -10_000,
        },
      },
    });
  });

  it("returns insufficient history instead of a partial comparison breakdown", () => {
    const result = unwrap(
      calculateBreakdown(GOLDEN_DATASET, {
        dimension: "region",
        filter: filter(interval("2024-02-28", "2024-02-28")),
        comparison: { kind: "previous_equal_length" },
      }),
    );
    expect(result).toMatchObject({
      resultType: "non_computable",
      status: "insufficient_data",
      reason: "insufficient_history",
    });
  });
});

describe("revenue concentration", () => {
  it("matches the exact product top-share and HHI golden controls", () => {
    const result = computableConcentration(
      unwrap(
        calculateConcentration(GOLDEN_DATASET, {
          dimension: "product",
          filter: filter(),
        }),
      ),
    );

    expect(result.topOne).toMatchObject({
      requestedSegmentCount: 1,
      includedSegmentCount: 1,
      segmentKeys: ["PROD-HOM-901"],
      revenue: EXPECTED.productConcentration.topOneRevenueShare.numeratorCents,
      share: {
        kind: "rate",
        ratio: { numerator: 37, denominator: 95 },
        basisPoints: 3_895,
      },
    });
    expect(topShare(result.topThree)).toMatchObject({
      requestedSegmentCount: 3,
      includedSegmentCount: 3,
      segmentKeys: ["PROD-HOM-901", "PROD-OUT-901", "PROD-WEL-901"],
      revenue: EXPECTED.productConcentration.topThreeRevenueShare.numeratorCents,
      share: {
        kind: "rate",
        ratio: { numerator: 81, denominator: 95 },
        basisPoints: 8_526,
      },
    });
    expect(result.topFive).toMatchObject({
      kind: "non_computable_value",
      reason: EXPECTED.productConcentration.topFiveStatus,
    });
    expect(result.hhi).toMatchObject({
      numerator: String(EXPECTED.productConcentration.hhi.numerator),
      denominator: String(EXPECTED.productConcentration.hhi.denominator),
      basisPoints: 2_816,
      segmentCount: 4,
    });
    expect(result).not.toHaveProperty("riskLevel");
    expect(result.assumptions.join(" ")).toContain("not assigned a universal risk label");
  });

  it.each([
    ["product", 4],
    ["category", 4],
    ["region", 4],
    ["channel", 3],
    ["customer", 6],
  ] as const)(
    "computes deterministic %s concentration and exact HHI identity",
    (dimension, count) => {
      const result = computableConcentration(
        unwrap(calculateConcentration(GOLDEN_DATASET, { dimension, filter: filter() })),
      );
      expect(result.support).toMatchObject({
        rowCount: EXPECTED.totals.orderLineCount,
        orderCount: EXPECTED.totals.distinctOrderCount,
        customerCount: EXPECTED.totals.distinctCustomerCount,
        segmentCount: count,
        totalRevenue: EXPECTED.totals.totalRevenueCents,
      });
      expect(result.segments.map((segment) => segment.rank)).toEqual(
        Array.from({ length: count }, (_, index) => index + 1),
      );
      for (let index = 1; index < result.segments.length; index += 1) {
        expect(result.segments[index - 1].revenue).toBeGreaterThanOrEqual(
          result.segments[index].revenue,
        );
        if (result.segments[index - 1].revenue === result.segments[index].revenue) {
          expect(result.segments[index - 1].key < result.segments[index].key).toBe(true);
        }
      }

      const totalSquared = BigInt(result.support.totalRevenue) ** BigInt(2);
      const sumOfSquares = result.segments.reduce(
        (sum, segment) => sum + BigInt(segment.revenue) ** BigInt(2),
        BigInt(0),
      );
      expect(BigInt(result.hhi.numerator) * totalSquared).toBe(
        sumOfSquares * BigInt(result.hhi.denominator),
      );

      expect(result.topOne.revenue).toBe(result.segments[0].revenue);
      const topThree = topShare(result.topThree);
      expect(topThree.revenue).toBe(
        result.segments.slice(0, 3).reduce((sum, segment) => sum + segment.revenue, 0),
      );
      expect(result.evidence.sampleOrderLineIds.length).toBeLessThanOrEqual(
        result.evidence.sampleLimit,
      );
    },
  );

  it("makes top-five explicitly insufficient unless five segments exist", () => {
    for (const dimension of [
      "product",
      "category",
      "region",
      "channel",
    ] satisfies readonly ConcentrationDimension[]) {
      const result = computableConcentration(
        unwrap(calculateConcentration(GOLDEN_DATASET, { dimension, filter: filter() })),
      );
      expect(result.topFive).toMatchObject({
        kind: "non_computable_value",
        status: "not_applicable",
        reason: "insufficient_segments",
      });
    }

    const customers = computableConcentration(
      unwrap(
        calculateConcentration(GOLDEN_DATASET, {
          dimension: "customer",
          filter: filter(),
        }),
      ),
    );
    expect(topShare(customers.topFive)).toMatchObject({
      requestedSegmentCount: 5,
      includedSegmentCount: 5,
      segmentKeys: ["CUST-9001", "CUST-9002", "CUST-9006", "CUST-9004", "CUST-9005"],
      revenue: 9_500,
      share: {
        kind: "rate",
        ratio: { numerator: 1, denominator: 1 },
        basisPoints: 10_000,
      },
    });
  });

  it("distinguishes zero-revenue concentration from a low but computable share", () => {
    const result = unwrap(
      calculateConcentration(GOLDEN_DATASET, {
        dimension: "product",
        filter: filter(FIXTURE_DATE_RANGE, { regions: ["South"] }),
      }),
    );
    expect(result).toMatchObject({
      resultType: "non_computable",
      status: "not_applicable",
      reason: "zero_denominator",
      evidence: { matchingRowCount: 1 },
    });
  });
});
