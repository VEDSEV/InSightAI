// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createAnalyticsEngine,
  dateInterval,
  ingestCanonicalCsv,
  isoDate,
  parseOrderLineCsv,
  type DatasetMetadata,
  type ValidationConfiguration,
} from "@/analytics";
import { createFindingsEngine } from "@/findings";
import {
  DEFAULT_TRANSFORMATIONS,
  mappingFromSuggestions,
  parseUploadCsv,
  prepareUploadedDataset,
  suggestUploadMappings,
} from "@/features/ingestion/ingestion-core";

const csv = readFileSync(new URL("../data/sample/insightai-orders.csv", import.meta.url), "utf8");
const interval = dateInterval(isoDate("2024-01-01"), isoDate("2025-12-31"));
const parsed = parseOrderLineCsv(csv);
if (parsed.status !== "ok") throw new Error("Phase 2 fixture must parse for findings tests.");
if (interval.boundary !== "inclusive") throw new Error("Phase 2 interval must be inclusive.");

const values = (field: "category" | "region" | "sales_channel" | "customer_segment" | "campaign") =>
  Object.freeze([...new Set(parsed.value.map((row) => row[field].trim()).filter(Boolean))].sort());
const metadata: DatasetMetadata = Object.freeze({
  datasetVersion: "insightai-synthetic-orders-v1",
  transformationVersion: "phase2-generator-v1.1",
  analyticsSpecificationVersion: "3.0.0",
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: interval,
  revenueSemantics: "net_after_line_discount",
  costSemantics: "line_cost_of_goods",
  marketingSpendSemantics: "single_line_order_allocation",
});
const validation: ValidationConfiguration = Object.freeze({
  currency: metadata.currency,
  timezone: metadata.timezone,
  dateRange: metadata.dateRange,
  vocabulary: Object.freeze({
    categories: values("category"),
    regions: values("region"),
    salesChannels: values("sales_channel"),
    customerSegments: values("customer_segment"),
    campaigns: values("campaign"),
  }),
  idPatterns: Object.freeze({
    orderLineId: /^LINE-\d{7}$/u,
    orderId: /^ORD-\d{6}$/u,
    customerId: /^CUST-\d{4}$/u,
    productId: /^PROD-[A-Z]{3}-\d{3}$/u,
  }),
  marketingSpendSemantics: metadata.marketingSpendSemantics,
});
const ingested = ingestCanonicalCsv({ text: csv, metadata, validationConfig: validation });
if (ingested.status !== "valid")
  throw new Error("Phase 2 fixture must validate for findings tests.");
const analytics = createAnalyticsEngine(ingested.dataset);
const engine = createFindingsEngine(analytics, ingested.dataset);

describe("deterministic findings engine", () => {
  it("generates stable evidence-backed findings for the approved Phase 2 scenarios", () => {
    const first = engine.generate({ filter: { period: interval } });
    const second = engine.generate({ filter: { period: interval } });
    expect(second).toBe(first);
    expect(first.findings).toEqual(second.findings);
    expect(first.findings.length).toBeGreaterThan(0);
    expect(first.findings.map((finding) => finding.findingType)).toEqual(
      expect.arrayContaining([
        "revenue_concentration",
        "aggregate_negative_margin_product",
        "high-revenue-low-margin-product",
      ]),
    );
    for (const finding of first.findings) {
      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.ruleVersion).toBe("findings-rules-v1");
      expect(finding.evidence[0]?.matchingRowCount).toBeGreaterThanOrEqual(0);
      expect(finding.summary.toLowerCase()).not.toMatch(/because|should|will happen|recommend/u);
    }
    expect(new Set(first.findings.map((finding) => finding.findingId)).size).toBe(
      first.findings.length,
    );
  });

  it("propagates a filtered context and cannot introduce unrelated segment findings", () => {
    const filtered = engine.generate({
      filter: { period: interval, regions: ["West"] },
      limit: 6,
    });
    expect(filtered.findings.length).toBeLessThanOrEqual(6);
    for (const finding of filtered.findings) {
      expect(finding.filterContext.regions).toEqual(["West"]);
      expect(finding.filterContext.period).toEqual(interval);
    }
  });

  it("keeps cached results isolated by the complete filter context", () => {
    const west = engine.generate({ filter: { period: interval, regions: ["West"] }, limit: 6 });
    const east = engine.generate({ filter: { period: interval, regions: ["East"] }, limit: 6 });
    expect(west).not.toBe(east);
    expect(west.filterContext.regions).toEqual(["West"]);
    expect(east.filterContext.regions).toEqual(["East"]);
  });

  it("suppresses immaterial signals when explicit thresholds are raised", () => {
    const strict = createFindingsEngine(createAnalyticsEngine(ingested.dataset), ingested.dataset, {
      minimumAbsoluteChangeCents: Number.MAX_SAFE_INTEGER,
      minimumSegmentChangeCents: Number.MAX_SAFE_INTEGER,
    }).generate({
      filter: { period: dateInterval(isoDate("2025-01-01"), isoDate("2025-12-31")) },
    });
    expect(strict.suppressed.some((item) => item.reason === "immaterial")).toBe(true);
  });

  it("suppresses concentration claims for the small Phase 5 uploaded fixture", () => {
    const uploadText = readFileSync(
      new URL("fixtures/ingestion/renamed-orders.csv", import.meta.url),
      "utf8",
    );
    const parsedUpload = parseUploadCsv({
      filename: "renamed-orders.csv",
      sizeBytes: new TextEncoder().encode(uploadText).byteLength,
      text: uploadText,
    });
    if (parsedUpload.status === "error") throw new Error("The upload fixture must parse.");
    const prepared = prepareUploadedDataset({
      parsed: parsedUpload.value,
      mapping: mappingFromSuggestions(suggestUploadMappings(parsedUpload.value)),
      transformations: { ...DEFAULT_TRANSFORMATIONS, dateFormat: "mdy" },
    });
    if (!prepared.dataset) throw new Error("The upload fixture must prepare.");
    const uploaded = createFindingsEngine(
      createAnalyticsEngine(prepared.dataset),
      prepared.dataset,
    ).generate({ filter: { period: prepared.dataset.metadata.dateRange } });
    expect(uploaded.findings.map((finding) => finding.findingType)).not.toContain(
      "revenue_concentration",
    );
    expect(uploaded.suppressed.some((item) => item.reason === "insufficient_evidence")).toBe(true);
  });
});
