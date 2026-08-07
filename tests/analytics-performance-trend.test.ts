// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createAnalyticsEngine, dateInterval, ingestCanonicalCsv, isoDate } from "@/analytics";

const text = readFileSync(
  new URL("./fixtures/analytics/golden-order-lines.csv", import.meta.url),
  "utf8",
);
const range = dateInterval(isoDate("2024-02-28"), isoDate("2024-05-01"));

const ingested = ingestCanonicalCsv({
  text,
  metadata: {
    datasetVersion: "golden-order-lines-v1",
    transformationVersion: "golden-transform-v1",
    analyticsSpecificationVersion: "3.0.0",
    currency: "USD",
    timezone: "America/Chicago",
    dateRange: range,
    revenueSemantics: "net_after_line_discount",
    costSemantics: "line_cost_of_goods",
    marketingSpendSemantics: "single_line_order_allocation",
  },
  validationConfig: {
    currency: "USD",
    timezone: "America/Chicago",
    dateRange: range,
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
      orderLineId: /^LINE-\d{7}$/u,
      orderId: /^ORD-\d{6}$/u,
      customerId: /^CUST-\d{4}$/u,
      productId: /^PROD-[A-Z]{3}-\d{3}$/u,
    },
    marketingSpendSemantics: "single_line_order_allocation",
  },
});

if (ingested.status !== "valid") {
  throw new Error(ingested.errors.map((error) => error.message).join("; "));
}

const engine = createAnalyticsEngine(ingested.dataset);
const april = dateInterval(isoDate("2024-04-01"), isoDate("2024-04-30"));

describe("public performance trend", () => {
  it("returns deterministic daily revenue and gross-profit buckets, including selected zero days", () => {
    const result = engine.performanceTrend({ filter: { period: april }, frequency: "daily" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok" || result.value.status !== "ok") return;
    expect(result.value).toMatchObject({
      resultType: "performance_trend",
      frequency: "daily",
      currentPeriod: april,
      evidence: { matchingRowCount: 2, distinctOrderCount: 2 },
    });
    expect(result.value.series).toHaveLength(30);
    expect(result.value.series[0]).toEqual({
      key: "2024-04-01",
      revenue: 1_600,
      grossProfit: -400,
      rowCount: 1,
      orderCount: 1,
    });
    expect(result.value.series[1]).toEqual({
      key: "2024-04-02",
      revenue: 0,
      grossProfit: 0,
      rowCount: 0,
      orderCount: 0,
    });
    expect(result.value.series[29]).toEqual({
      key: "2024-04-30",
      revenue: 900,
      grossProfit: 300,
      rowCount: 1,
      orderCount: 1,
    });
  });

  it("uses the explicit typed empty-result path when no rows match the current filter", () => {
    const result = engine.performanceTrend({
      filter: { period: april, categories: ["Home"], regions: ["South"] },
    });

    expect(result).toMatchObject({
      status: "ok",
      value: {
        resultType: "non_computable",
        reason: "empty_dataset",
        evidence: { matchingRowCount: 0, distinctOrderCount: 0 },
      },
    });
  });
});
