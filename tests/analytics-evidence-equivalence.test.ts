// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ANALYTICS_ENGINE_VERSION,
  buildEvidenceReference,
  computeMetrics,
  createAnalyticsEngine,
  createFilterContext,
  dateInterval,
  filterDataset,
  ingestCanonicalCsv,
  isoDate,
  stableFingerprint,
} from "@/analytics";

const RANGE = dateInterval(isoDate("2024-02-28"), isoDate("2024-05-01"));
const CSV = readFileSync(
  new URL("./fixtures/analytics/golden-order-lines.csv", import.meta.url),
  "utf8",
);
const VALIDATION = {
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: RANGE,
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
const ingestion = ingestCanonicalCsv({
  text: CSV,
  metadata: {
    datasetVersion: "golden-order-lines-v1",
    transformationVersion: "golden-transform-v1",
    analyticsSpecificationVersion: "3.0.0",
    currency: "USD",
    timezone: "America/Chicago",
    dateRange: RANGE,
    revenueSemantics: "net_after_line_discount",
    costSemantics: "line_cost_of_goods",
    marketingSpendSemantics: "single_line_order_allocation",
  },
  validationConfig: VALIDATION,
});
if (ingestion.status !== "valid") {
  throw new Error(ingestion.errors.map((error) => error.message).join("; "));
}
const DATASET = ingestion.dataset;

describe("evidence equivalence", () => {
  it.each([
    [null, "5b9bc4ba528108e4"],
    ["", "07cc7607b4949e25"],
    [{}, "08f44b07b5901a25"],
    [[], "09612b07b5ecb5a5"],
    [{ a: 1, b: ["x", null] }, "12aa090657ff36c4"],
    ["ASCII", "ad6e2ea8c31e7056"],
    ["😀", "6dce2fbf24a2f80e"],
    [{ z: "𝄞", a: [true, false, 0, -0] }, "e61b849412e3038f"],
  ])("preserves the legacy FNV-1a fingerprint for %j", (value, expected) => {
    expect(stableFingerprint(value)).toBe(expected);
  });

  it("makes prepared metric evidence byte-equivalent to direct row evidence", () => {
    const filtered = filterDataset(DATASET, { period: RANGE });
    if (filtered.status === "error") throw new Error("Golden filter unexpectedly failed.");
    const normalized = createFilterContext({ period: RANGE }, DATASET);
    if (normalized.status === "error") throw new Error("Golden filter unexpectedly failed.");
    const metrics = computeMetrics({ dataset: DATASET, filterContext: normalized.value });
    const direct = buildEvidenceReference({
      datasetVersion: DATASET.metadata.datasetVersion,
      engineVersion: ANALYTICS_ENGINE_VERSION,
      operationId: "total_revenue",
      rows: filtered.value.rows,
      filterContext: filtered.value.filterContext,
      affectedDateBuckets: [RANGE],
      metricDependencies: [],
    });

    expect(metrics.total_revenue.evidence).toEqual(direct);
  });

  it("keeps the engine-owned context path deeply equivalent to the standalone API", () => {
    const input = {
      period: RANGE,
      categories: ["Kitchen", "Home", "Kitchen"],
      regions: ["West", "East"],
    } as const;
    const normalized = createFilterContext(input, DATASET);
    if (normalized.status === "error") throw new Error("Golden filter unexpectedly failed.");

    const engineResult = createAnalyticsEngine(DATASET).metrics(input);
    const standaloneResult = computeMetrics({
      dataset: DATASET,
      filterContext: normalized.value,
    });

    expect(engineResult).toEqual(standaloneResult);
    expect(Object.isFrozen(engineResult)).toBe(true);
  });
});
