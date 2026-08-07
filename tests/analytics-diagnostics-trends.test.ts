// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANALYTICS_CONFIGURATION,
  DEFAULT_MARGIN_RULES,
  addDays,
  analyzeMargins,
  analyzeTrendContributions,
  basisPoints,
  dateInterval,
  ingestCanonicalCsv,
  isoDate,
  moneyCents,
  parseOrderLineCsv,
  validateDataset,
  type AnalyticsConfiguration,
  type CanonicalOrderLine,
  type DatasetMetadata,
  type ValidatedDataset,
  type ValidationConfiguration,
} from "@/analytics";

const GOLDEN_CSV = readFileSync(
  new URL("./fixtures/analytics/golden-order-lines.csv", import.meta.url),
  "utf8",
);
const PHASE_TWO_CSV = readFileSync(
  new URL("../data/sample/insightai-orders.csv", import.meta.url),
  "utf8",
);

const GOLDEN_RANGE = dateInterval(isoDate("2024-02-28"), isoDate("2024-05-01"));
const PHASE_TWO_RANGE = dateInterval(isoDate("2024-01-01"), isoDate("2025-12-31"));

function uniqueNonBlank(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))].sort());
}

function requireDataset(
  text: string,
  metadata: DatasetMetadata,
  validationConfig: ValidationConfiguration,
): ValidatedDataset {
  const result = ingestCanonicalCsv({ text, metadata, validationConfig });
  if (result.status !== "valid") {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  return result.dataset;
}

const GOLDEN_VALIDATION: ValidationConfiguration = {
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: GOLDEN_RANGE,
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
  marketingSpendSemantics: "single_line_order_allocation",
};

const GOLDEN_METADATA: DatasetMetadata = {
  datasetVersion: "golden-order-lines-v1",
  transformationVersion: "golden-transform-v1",
  analyticsSpecificationVersion: "3.0.0",
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: GOLDEN_RANGE,
  revenueSemantics: "net_after_line_discount",
  costSemantics: "line_cost_of_goods",
  marketingSpendSemantics: "single_line_order_allocation",
};

const GOLDEN_DATASET = requireDataset(GOLDEN_CSV, GOLDEN_METADATA, GOLDEN_VALIDATION);

function phaseTwoDataset(): ValidatedDataset {
  const parsed = parseOrderLineCsv(PHASE_TWO_CSV);
  if (parsed.status !== "ok") {
    throw new Error(parsed.errors.map((error) => error.message).join("; "));
  }
  const rows = parsed.value;
  const validationConfig: ValidationConfiguration = {
    currency: "USD",
    timezone: "America/Chicago",
    dateRange: PHASE_TWO_RANGE,
    vocabulary: {
      categories: uniqueNonBlank(rows.map((row) => row.category)),
      regions: uniqueNonBlank(rows.map((row) => row.region)),
      salesChannels: uniqueNonBlank(rows.map((row) => row.sales_channel)),
      customerSegments: uniqueNonBlank(rows.map((row) => row.customer_segment)),
      campaigns: uniqueNonBlank(rows.map((row) => row.campaign)),
    },
    idPatterns: {
      orderLineId: /^LINE-\d{7}$/,
      orderId: /^ORD-\d{6}$/,
      customerId: /^CUST-\d{4}$/,
      productId: /^PROD-[A-Z]{3}-\d{3}$/,
    },
    marketingSpendSemantics: "single_line_order_allocation",
  };
  return requireDataset(
    PHASE_TWO_CSV,
    {
      datasetVersion: "insightai-synthetic-orders-v1",
      transformationVersion: "phase2-generator-v1.1",
      analyticsSpecificationVersion: "3.0.0",
      currency: "USD",
      timezone: "America/Chicago",
      dateRange: PHASE_TWO_RANGE,
      revenueSemantics: "net_after_line_discount",
      costSemantics: "line_cost_of_goods",
      marketingSpendSemantics: "single_line_order_allocation",
    },
    validationConfig,
  );
}

function configurationWithMarginRules(
  overrides: Partial<AnalyticsConfiguration["marginRules"]>,
): AnalyticsConfiguration {
  return Object.freeze({
    ...DEFAULT_ANALYTICS_CONFIGURATION,
    marginRules: Object.freeze({ ...DEFAULT_MARGIN_RULES, ...overrides }),
  });
}

function dailyDataset(revenues: readonly number[]): ValidatedDataset {
  const start = isoDate("2024-06-01");
  const rows: CanonicalOrderLine[] = revenues.map((revenue, index) => {
    const suffix = String(index + 1).padStart(4, "0");
    const date = addDays(start, index);
    return Object.freeze({
      sourceRowNumber: index + 2,
      orderLineId: `LINE-TREND-${suffix}`,
      orderId: `ORD-TREND-${suffix}`,
      orderDate: date,
      customerId: `CUST-TREND-${suffix}`,
      customerSegment: null,
      productId: "PROD-TREND-001",
      productName: "Trend product",
      category: "Trend",
      region: "Central",
      salesChannel: "Web",
      quantity: 1,
      unitPriceCents: moneyCents(revenue),
      unitCostCents: moneyCents(0),
      discountAmountCents: moneyCents(0),
      revenueCents: moneyCents(revenue),
      costCents: moneyCents(0),
      campaign: null,
      marketingSpendCents: moneyCents(0),
    });
  });
  const range = dateInterval(start, addDays(start, revenues.length - 1));
  const metadata: DatasetMetadata = Object.freeze({
    datasetVersion: "trend-series-v1",
    transformationVersion: "test-fixture-v1",
    analyticsSpecificationVersion: "3.0.0",
    currency: "USD",
    timezone: "America/Chicago",
    dateRange: range,
    revenueSemantics: "net_after_line_discount",
    costSemantics: "line_cost_of_goods",
    marketingSpendSemantics: "line_level",
  });
  const result = validateDataset(rows, metadata, {
    currency: "USD",
    timezone: "America/Chicago",
    dateRange: range,
    vocabulary: {
      categories: ["Trend"],
      regions: ["Central"],
      salesChannels: ["Web"],
      customerSegments: [],
      campaigns: [],
    },
    idPatterns: {
      orderLineId: /^LINE-TREND-\d{4}$/,
      orderId: /^ORD-TREND-\d{4}$/,
      customerId: /^CUST-TREND-\d{4}$/,
      productId: /^PROD-TREND-001$/,
    },
    marketingSpendSemantics: "line_level",
  });
  if (result.status !== "valid") {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  return result.dataset;
}

describe("margin diagnostics", () => {
  it("keeps negative rows, any-loss products, and aggregate-loss products distinct", () => {
    const result = analyzeMargins(GOLDEN_DATASET, { filter: { period: GOLDEN_RANGE } });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.value.summary).toMatchObject({
      negativeMarginRowCount: 3,
      productsWithAnyNegativeMarginRowCount: 2,
      aggregateNegativeMarginProductCount: 1,
    });
    expect(result.value.productsWithAnyNegativeRows.map((entry) => entry.productId)).toEqual([
      "PROD-OUT-901",
      "PROD-KIT-901",
    ]);
    expect(result.value.aggregateNegativeProducts.map((entry) => entry.productId)).toEqual([
      "PROD-OUT-901",
    ]);
    expect(result.value.aggregateNegativeProducts[0]?.negativeMarginRowCount).toBe(2);
  });

  it("applies configurable percentile and margin rules without fixture IDs in the rule", () => {
    const configuration = configurationWithMarginRules({
      highRevenueMinimumOrders: 1,
      highRevenueMinimumEligibleProducts: 4,
      highRevenuePercentileBasisPoints: basisPoints(5_000),
      maximumLowMarginBasisPoints: basisPoints(5_000),
      overallMarginGapBasisPoints: basisPoints(0),
    });
    const result = analyzeMargins(
      GOLDEN_DATASET,
      { filter: { period: GOLDEN_RANGE } },
      configuration,
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(Array.isArray(result.value.highRevenueLowMarginProducts)).toBe(true);
    if (!Array.isArray(result.value.highRevenueLowMarginProducts)) return;
    expect(result.value.highRevenueLowMarginProducts.map((entry) => entry.productId)).toEqual([
      "PROD-OUT-901",
    ]);
    expect(result.value.highRevenueThreshold).toEqual({ numerator: 2_200, denominator: 1 });
  });

  it("labels discounted loss rows as candidates until a configured date window confirms them", () => {
    const candidate = analyzeMargins(GOLDEN_DATASET, { filter: { period: GOLDEN_RANGE } });
    expect(candidate.status).toBe("ok");
    if (candidate.status !== "ok") return;
    expect(candidate.value.promotionalLossCases).toHaveLength(1);
    expect(candidate.value.promotionalLossCases[0]).toMatchObject({
      productId: "PROD-KIT-901",
      classification: "candidate",
      negativeRowCount: 1,
      discountedNegativeRowCount: 1,
    });

    const confirmed = analyzeMargins(GOLDEN_DATASET, {
      filter: { period: GOLDEN_RANGE },
      promotionWindows: [
        {
          ...dateInterval(isoDate("2024-03-15"), isoDate("2024-03-15")),
          label: "Configured fixture promotion",
        },
      ],
    });
    expect(confirmed.status).toBe("ok");
    if (confirmed.status !== "ok") return;
    expect(confirmed.value.promotionalLossCases[0]).toMatchObject({
      classification: "confirmed_by_configured_window",
      promotionWindowLabels: ["Configured fixture promotion"],
    });
    expect(confirmed.value.promotionalLossCases[0]?.evidence).toMatchObject({
      matchingRowCount: 1,
      sampleOrderLineIds: ["LINE-9000005"],
      truncated: false,
    });
  });

  it("discovers all three approved Phase 2 margin cases through configuration and evidence", () => {
    const dataset = phaseTwoDataset();
    const result = analyzeMargins(dataset, {
      filter: { period: PHASE_TWO_RANGE },
      promotionWindows: [
        {
          ...dateInterval(isoDate("2025-06-20"), isoDate("2025-06-26")),
          label: "Documented June promotion",
        },
      ],
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.value.summary).toMatchObject({
      negativeMarginRowCount: 52,
      productsWithAnyNegativeMarginRowCount: 2,
      aggregateNegativeMarginProductCount: 1,
      highRevenueLowMarginProductCount: 1,
      promotionalLossCaseCount: 1,
    });
    expect(result.value.aggregateNegativeProducts.map((entry) => entry.productId)).toEqual([
      "PROD-GFT-001",
    ]);
    expect(
      Array.isArray(result.value.highRevenueLowMarginProducts)
        ? result.value.highRevenueLowMarginProducts.map((entry) => entry.productId)
        : [],
    ).toEqual(["PROD-KIT-001"]);
    expect(result.value.promotionalLossCases[0]).toMatchObject({
      productId: "PROD-OUT-003",
      classification: "confirmed_by_configured_window",
      negativeRowCount: 5,
      discountedNegativeRowCount: 5,
    });
    expect(result.value.evidence.sampleOrderLineIds.length).toBeLessThanOrEqual(12);
    expect(result.value.evidence.matchingRowCount).toBe(6_909);
  });
});

describe("trend and contribution analysis", () => {
  it("reconciles segment deltas to total change and ranks positive and negative contributors", () => {
    const result = analyzeTrendContributions(GOLDEN_DATASET, {
      filter: {
        period: dateInterval(isoDate("2024-04-01"), isoDate("2024-04-30")),
      },
      comparison: { kind: "previous_equal_length" },
      dimension: "category",
      frequency: "daily",
      contributorLimit: 2,
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.value.resultType).toBe("trend_contribution");
    if (result.status !== "ok" || result.value.resultType !== "trend_contribution") return;
    expect(result.value).toMatchObject({
      currentRevenue: 2_500,
      previousRevenue: 900,
      absoluteChange: 1_600,
    });
    expect(result.value.contributions.reduce((sum, entry) => sum + entry.absoluteChange, 0)).toBe(
      result.value.absoluteChange,
    );
    expect(
      result.value.contributions.map(({ key, absoluteChange }) => ({ key, absoluteChange })),
    ).toEqual([
      { key: "Outdoor", absoluteChange: 1_600 },
      { key: "Home", absoluteChange: 900 },
      { key: "Kitchen", absoluteChange: -900 },
    ]);
    expect(result.value.largestPositiveContributors.map((entry) => entry.key)).toEqual([
      "Outdoor",
      "Home",
    ]);
    expect(result.value.largestNegativeContributors.map((entry) => entry.key)).toEqual(["Kitchen"]);
    expect(result.value.evidence.matchingRowCount).toBe(4);
    expect(result.value.assumptions.join(" ")).toContain("does not imply causation");
  });

  it("returns a typed prior-zero growth result instead of infinity", () => {
    const result = analyzeTrendContributions(GOLDEN_DATASET, {
      filter: {
        period: dateInterval(isoDate("2024-04-30"), isoDate("2024-04-30")),
      },
      comparison: { kind: "previous_equal_length" },
      dimension: "product",
      frequency: "daily",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.value.resultType).toBe("trend_contribution");
    if (result.status !== "ok" || result.value.resultType !== "trend_contribution") return;
    expect(result.value.currentRevenue).toBe(900);
    expect(result.value.previousRevenue).toBe(0);
    expect(result.value.percentageChange).toMatchObject({
      kind: "non_computable_value",
      reason: "zero_denominator",
    });
  });

  it("reports a deterministic consecutive decline across complete daily buckets", () => {
    const dataset = dailyDataset([100, 100, 100, 100, 100, 100, 600, 500, 400, 300, 200, 100]);
    const result = analyzeTrendContributions(dataset, {
      filter: {
        period: dateInterval(isoDate("2024-06-07"), isoDate("2024-06-12")),
      },
      comparison: { kind: "previous_equal_length" },
      dimension: "category",
      frequency: "daily",
    });

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.value.resultType).toBe("trend_contribution");
    if (result.status !== "ok" || result.value.resultType !== "trend_contribution") return;
    expect(result.value.series.map((bucket) => bucket.revenue)).toEqual([
      600, 500, 400, 300, 200, 100,
    ]);
    expect(result.value.consecutiveDecline).toEqual({
      longestRun: 5,
      latestRun: 5,
      longestRunBucketKeys: [
        "2024-06-07",
        "2024-06-08",
        "2024-06-09",
        "2024-06-10",
        "2024-06-11",
        "2024-06-12",
      ],
      latestRunBucketKeys: [
        "2024-06-07",
        "2024-06-08",
        "2024-06-09",
        "2024-06-10",
        "2024-06-11",
        "2024-06-12",
      ],
    });
  });
});
