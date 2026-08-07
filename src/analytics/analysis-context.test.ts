// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MAX_CACHED_ANALYSIS_CONTEXTS,
  canonicalAnalysisFilterKey,
  createAnalysisRuntime,
} from "./analysis-context.ts";
import { dateInterval, isoDate } from "./dates.ts";
import { ingestCanonicalCsv } from "./validation.ts";

const RANGE = dateInterval(isoDate("2024-02-28"), isoDate("2024-05-01"));
const CSV = readFileSync(
  new URL("../../tests/fixtures/analytics/golden-order-lines.csv", import.meta.url),
  "utf8",
);
const ingestion = ingestCanonicalCsv({
  text: CSV,
  metadata: {
    datasetVersion: "shared-version-for-runtime-isolation",
    transformationVersion: "golden-transform-v1",
    analyticsSpecificationVersion: "3.0.0",
    currency: "USD",
    timezone: "America/Chicago",
    dateRange: RANGE,
    revenueSemantics: "net_after_line_discount",
    costSemantics: "line_cost_of_goods",
    marketingSpendSemantics: "single_line_order_allocation",
  },
  validationConfig: {
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
    marketingSpendSemantics: "single_line_order_allocation",
  },
});
if (ingestion.status !== "valid") {
  throw new Error(ingestion.errors.map((error) => error.message).join("; "));
}
const DATASET = ingestion.dataset;

function resolveOrThrow(runtime: ReturnType<typeof createAnalysisRuntime>, periodStart: string) {
  const result = runtime.resolve({
    period: dateInterval(isoDate(periodStart), isoDate(periodStart)),
  });
  if (result.status === "error") throw new Error("Context resolution unexpectedly failed.");
  return result.value;
}

describe("bounded analysis context", () => {
  it("reuses canonically equivalent filters without mutating caller input", () => {
    const runtime = createAnalysisRuntime(DATASET);
    const categories = ["Kitchen", "Home", "Kitchen"];
    const first = runtime.resolve({ period: RANGE, categories });
    const second = runtime.resolve({ period: RANGE, categories: ["Home", "Kitchen"] });
    if (first.status === "error" || second.status === "error") {
      throw new Error("Context resolution unexpectedly failed.");
    }

    expect(first.value).toBe(second.value);
    expect(canonicalAnalysisFilterKey(first.value.filterContext)).toBe(
      canonicalAnalysisFilterKey(second.value.filterContext),
    );
    expect(categories).toEqual(["Kitchen", "Home", "Kitchen"]);
    expect(first.value.filterContext.categories).toEqual(["Home", "Kitchen"]);
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(Object.isFrozen(first.value.rows)).toBe(true);
    expect(Object.isFrozen(first.value.aggregate)).toBe(true);
  });

  it("bounds the LRU and rebuilds an evicted context without stale state", () => {
    const runtime = createAnalysisRuntime(DATASET);
    const starts = [
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2024-03-02",
      "2024-03-03",
      "2024-03-04",
      "2024-03-05",
      "2024-03-06",
      "2024-03-07",
    ];
    const first = resolveOrThrow(runtime, starts[0]);
    for (const start of starts.slice(1)) resolveOrThrow(runtime, start);

    expect(runtime.maxCachedContexts).toBe(MAX_CACHED_ANALYSIS_CONTEXTS);
    expect(runtime.cachedContextCount()).toBe(MAX_CACHED_ANALYSIS_CONTEXTS);
    const rebuilt = resolveOrThrow(runtime, starts[0]);
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.rows).toEqual(first.rows);
  });

  it("rejects contexts from another engine runtime even when dataset versions match", () => {
    const firstRuntime = createAnalysisRuntime(DATASET);
    const secondRuntime = createAnalysisRuntime(DATASET);
    const context = resolveOrThrow(firstRuntime, "2024-03-01");

    expect(() => secondRuntime.grouping(context, "category")).toThrow("different dataset runtime");
  });

  it("prepares all six finite breakdown partitions on first grouping access", () => {
    const runtime = createAnalysisRuntime(DATASET);
    const result = runtime.resolve({ period: RANGE });
    if (result.status === "error") throw new Error("Context resolution unexpectedly failed.");

    const category = runtime.grouping(result.value, "category");
    const campaign = runtime.grouping(result.value, "campaign");
    expect(category.length).toBeGreaterThan(0);
    expect(campaign.length).toBeGreaterThan(0);
    expect(category.every((entry) => Object.isFrozen(entry.evidenceSupport))).toBe(true);
  });
});
