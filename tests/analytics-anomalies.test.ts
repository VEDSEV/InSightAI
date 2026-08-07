// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  addDays,
  basisPoints,
  dateInterval,
  detectRevenueAnomalies,
  ingestCanonicalCsv,
  isoDate,
  moneyCents,
  parseOrderLineCsv,
  validateDataset,
  type AnomalyConfigurationOverride,
  type CanonicalOrderLine,
  type DatasetMetadata,
  type ValidatedDataset,
  type ValidationConfiguration,
} from "@/analytics";

const PHASE_TWO_CSV = readFileSync(
  new URL("../data/sample/insightai-orders.csv", import.meta.url),
  "utf8",
);
const PHASE_TWO_RANGE = dateInterval(isoDate("2024-01-01"), isoDate("2025-12-31"));

const ROBUST_DAILY_CONFIGURATION: AnomalyConfigurationOverride = Object.freeze({
  frequency: "daily",
  minimumSeriesBuckets: 14,
  minimumBaselineBuckets: 3,
  maximumBaselineBuckets: 8,
  robustZThresholdMilli: 3_500,
  relativeMaterialityBasisPoints: basisPoints(2_000),
  absoluteMaterialityFloorCents: moneyCents(0),
});

const PHASE_TWO_DOCUMENTED_CONFIGURATION: AnomalyConfigurationOverride = Object.freeze({
  frequency: "daily",
  minimumSeriesBuckets: 14,
  minimumBaselineBuckets: 7,
  maximumBaselineBuckets: 28,
  robustZThresholdMilli: 3_500,
  relativeMaterialityBasisPoints: basisPoints(2_000),
  absoluteMaterialityFloorCents: moneyCents(5_000),
  includePartialWeeks: false,
});

function uniqueNonBlank(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))].sort());
}

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
  const metadata: DatasetMetadata = {
    datasetVersion: "insightai-synthetic-orders-v1",
    transformationVersion: "phase2-generator-v1.1",
    analyticsSpecificationVersion: "3.0.0",
    currency: "USD",
    timezone: "America/Chicago",
    dateRange: PHASE_TWO_RANGE,
    revenueSemantics: "net_after_line_discount",
    costSemantics: "line_cost_of_goods",
    marketingSpendSemantics: "single_line_order_allocation",
  };
  const result = ingestCanonicalCsv({
    text: PHASE_TWO_CSV,
    metadata,
    validationConfig,
  });
  if (result.status !== "valid") {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  return result.dataset;
}

function dailyDataset(
  revenues: readonly number[],
  start = isoDate("2024-01-01"),
  datasetVersion = "daily-anomaly-fixture-v1",
): ValidatedDataset {
  const rows: CanonicalOrderLine[] = revenues.map((revenue, index) => {
    const suffix = String(index + 1).padStart(4, "0");
    const date = addDays(start, index);
    return Object.freeze({
      sourceRowNumber: index + 2,
      orderLineId: `LINE-ANOM-${suffix}`,
      orderId: `ORD-ANOM-${suffix}`,
      orderDate: date,
      customerId: `CUST-ANOM-${suffix}`,
      customerSegment: null,
      productId: "PROD-ANOM-001",
      productName: "Anomaly product",
      category: "Anomaly",
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
    datasetVersion,
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
      categories: ["Anomaly"],
      regions: ["Central"],
      salesChannels: ["Web"],
      customerSegments: [],
      campaigns: [],
    },
    idPatterns: {
      orderLineId: /^LINE-ANOM-\d{4}$/,
      orderId: /^ORD-ANOM-\d{4}$/,
      customerId: /^CUST-ANOM-\d{4}$/,
      productId: /^PROD-ANOM-001$/,
    },
    marketingSpendSemantics: "line_level",
  });
  if (result.status !== "valid") {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }
  return result.dataset;
}

function detect(
  dataset: ValidatedDataset,
  configuration: AnomalyConfigurationOverride = ROBUST_DAILY_CONFIGURATION,
  start = dataset.metadata.dateRange.start,
  end = dataset.metadata.dateRange.end,
) {
  return detectRevenueAnomalies(dataset, {
    filter: { period: dateInterval(start, end) },
    configuration,
  });
}

describe("robust daily revenue anomalies", () => {
  it("detects controlled spikes and drops and exposes zero-MAD evidence", () => {
    const revenues = Array.from({ length: 42 }, () => 10_000);
    revenues[34] = 20_000;
    revenues[35] = 0;
    const dataset = dailyDataset(revenues);
    const result = detect(dataset);

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.value.resultType).toBe("anomaly");
    if (result.status !== "ok" || result.value.resultType !== "anomaly") return;
    expect(result.value.findings.map((finding) => finding.direction)).toEqual(["spike", "drop"]);
    expect(result.value.findings.map((finding) => finding.bucket.period.start)).toEqual([
      "2024-02-04",
      "2024-02-05",
    ]);
    for (const finding of result.value.findings) {
      expect(finding.zeroMadFallback).toBe(true);
      expect(finding.robustZ).toBeNull();
      expect(finding.baseline.method).toBe("trailing_mad_with_weekday_guard");
      expect(finding.baseline.weekdayGuard).not.toBeNull();
      expect(finding.evidence.matchingRowCount).toBeGreaterThanOrEqual(
        finding.baseline.bucketCount + 1,
      );
      expect(finding.evidence.sampleOrderLineIds.length).toBeLessThanOrEqual(12);
      expect(finding.evidence.numerator).toMatchObject({ metricId: "total_revenue" });
      expect(finding.description).toContain("versus its robust recent baseline");
    }
  });

  it("uses an inclusive materiality threshold boundary", () => {
    const atBoundary = Array.from({ length: 36 }, () => 10_000);
    atBoundary[35] = 12_000;
    const belowBoundary = [...atBoundary];
    belowBoundary[35] = 11_999;

    const exact = detect(dailyDataset(atBoundary, isoDate("2024-01-01"), "boundary-exact"));
    const below = detect(dailyDataset(belowBoundary, isoDate("2024-01-01"), "boundary-below"));
    expect(exact.status).toBe("ok");
    expect(below.status).toBe("ok");
    if (exact.status === "ok") expect(exact.value.resultType).toBe("anomaly");
    if (below.status === "ok") expect(below.value.resultType).toBe("anomaly");
    if (
      exact.status !== "ok" ||
      below.status !== "ok" ||
      exact.value.resultType !== "anomaly" ||
      below.value.resultType !== "anomaly"
    ) {
      return;
    }
    expect(exact.value.findings.map((finding) => finding.bucket.period.start)).toContain(
      "2024-02-05",
    );
    expect(below.value.findings.map((finding) => finding.bucket.period.start)).not.toContain(
      "2024-02-05",
    );
  });

  it("distinguishes insufficient history from a completed stable run with no anomalies", () => {
    const short = detect(dailyDataset(Array.from({ length: 8 }, () => 10_000)));
    expect(short.status).toBe("ok");
    if (short.status === "ok") {
      expect(short.value).toMatchObject({
        resultType: "non_computable",
        reason: "insufficient_history",
        status: "insufficient_data",
      });
    }

    const stable = detect(dailyDataset(Array.from({ length: 35 }, () => 10_000)));
    expect(stable.status).toBe("ok");
    if (stable.status === "ok") expect(stable.value.resultType).toBe("anomaly");
    if (stable.status === "ok" && stable.value.resultType === "anomaly") {
      expect(stable.value.evaluatedBucketCount).toBeGreaterThan(0);
      expect(stable.value.findings).toEqual([]);
    }
  });

  it("uses matching weekdays to avoid flagging recurring weekly peaks", () => {
    const revenues: number[] = Array.from({ length: 70 }, (_, index) =>
      index % 7 === 0 ? 5_000 : 1_000,
    );
    revenues[56] = 10_000;
    const result = detect(dailyDataset(revenues, isoDate("2024-01-01"), "weekday-pattern"));

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.value.resultType).toBe("anomaly");
    if (result.status !== "ok" || result.value.resultType !== "anomaly") return;
    const target = result.value.findings.find(
      (finding) => finding.bucket.period.start === "2024-02-26",
    );
    expect(target).toMatchObject({
      direction: "spike",
      baseline: {
        method: "trailing_mad_with_weekday_guard",
        weekdayGuard: { bucketCount: 8 },
      },
    });
    const normalMondaysAfterWarmup = new Set(
      Array.from({ length: 10 }, (_, week) => addDays(isoDate("2024-01-01"), week * 7)).filter(
        (date) => date >= "2024-01-22" && date !== "2024-02-26",
      ),
    );
    const recurringMondaysAfterWarmup = result.value.findings.filter((finding) =>
      normalMondaysAfterWarmup.has(finding.bucket.period.start),
    );
    expect(recurringMondaysAfterWarmup).toEqual([]);
  });
});

describe("weekly buckets and approved Phase 2 evidence", () => {
  it("excludes partial edge weeks by default and includes them only when configured", () => {
    const dataset = dailyDataset(Array.from({ length: 68 }, () => 1_000));
    const periodStart = isoDate("2024-01-02");
    const periodEnd = isoDate("2024-03-08");
    const weeklyBase: AnomalyConfigurationOverride = {
      frequency: "weekly",
      minimumSeriesBuckets: 5,
      minimumBaselineBuckets: 3,
      maximumBaselineBuckets: 8,
      robustZThresholdMilli: 3_500,
      relativeMaterialityBasisPoints: basisPoints(2_000),
      absoluteMaterialityFloorCents: moneyCents(0),
    };
    const excluded = detect(
      dataset,
      { ...weeklyBase, includePartialWeeks: false },
      periodStart,
      periodEnd,
    );
    const included = detect(
      dataset,
      { ...weeklyBase, includePartialWeeks: true },
      periodStart,
      periodEnd,
    );

    expect(excluded.status).toBe("ok");
    expect(included.status).toBe("ok");
    if (excluded.status === "ok") expect(excluded.value.resultType).toBe("anomaly");
    if (included.status === "ok") expect(included.value.resultType).toBe("anomaly");
    if (
      excluded.status !== "ok" ||
      included.status !== "ok" ||
      excluded.value.resultType !== "anomaly" ||
      included.value.resultType !== "anomaly"
    ) {
      return;
    }
    expect(excluded.value.frequency).toBe("weekly");
    expect(excluded.value.bucketCount).toBe(8);
    expect(excluded.value.findings).toEqual([]);
    expect(included.value.bucketCount).toBe(10);
    expect(included.value.findings.at(-1)).toMatchObject({
      direction: "drop",
      bucket: { period: { start: "2024-03-04", end: "2024-03-08" }, complete: false },
    });
  });

  it("detects both approved Phase 2 anomaly dates under the documented robust configuration", () => {
    const dataset = phaseTwoDataset();
    const result = detect(
      dataset,
      PHASE_TWO_DOCUMENTED_CONFIGURATION,
      PHASE_TWO_RANGE.start,
      PHASE_TWO_RANGE.end,
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.value.resultType).toBe("anomaly");
    if (result.status !== "ok" || result.value.resultType !== "anomaly") return;
    const findingsByDate = new Map(
      result.value.findings.map((finding) => [finding.bucket.period.start, finding]),
    );
    expect(findingsByDate.get(isoDate("2024-11-29"))).toMatchObject({
      direction: "spike",
      baseline: { method: "trailing_mad_with_weekday_guard", weekdayGuard: {} },
    });
    expect(findingsByDate.get(isoDate("2025-08-12"))).toMatchObject({
      direction: "drop",
      baseline: { method: "trailing_mad_with_weekday_guard", weekdayGuard: {} },
    });
    for (const date of [isoDate("2024-11-29"), isoDate("2025-08-12")] as const) {
      const finding = findingsByDate.get(date);
      expect(finding?.evidence.affectedDateBuckets.at(-1)).toEqual(dateInterval(date, date));
      expect(finding?.evidence.sampleOrderLineIds.length).toBeLessThanOrEqual(12);
      expect(finding?.evidence.truncated).toBe(true);
    }
  });
});
