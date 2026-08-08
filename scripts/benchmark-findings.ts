import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  createAnalyticsEngine,
  dateInterval,
  ingestCanonicalCsv,
  isoDate,
  parseOrderLineCsv,
  type DatasetMetadata,
  type ValidationConfiguration,
} from "../src/analytics/index.ts";
import { createFindingsEngine } from "../src/findings/index.ts";
import {
  DEFAULT_TRANSFORMATIONS,
  mappingFromSuggestions,
  parseUploadCsv,
  prepareUploadedDataset,
  suggestUploadMappings,
} from "../src/features/ingestion/ingestion-core.ts";

const text = readFileSync("data/sample/insightai-orders.csv", "utf8");
const parsed = parseOrderLineCsv(text);
if (parsed.status !== "ok") throw new Error("The approved dataset must parse.");
const period = dateInterval(isoDate("2024-01-01"), isoDate("2025-12-31"));
const values = (key: "category" | "region" | "sales_channel" | "customer_segment" | "campaign") =>
  Object.freeze([...new Set(parsed.value.map((row) => row[key].trim()).filter(Boolean))].sort());
const metadata: DatasetMetadata = Object.freeze({
  datasetVersion: "insightai-synthetic-orders-v1",
  transformationVersion: "phase2-generator-v1.1",
  analyticsSpecificationVersion: "3.0.0",
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: period,
  revenueSemantics: "net_after_line_discount",
  costSemantics: "line_cost_of_goods",
  marketingSpendSemantics: "single_line_order_allocation",
});
const validationConfig: ValidationConfiguration = Object.freeze({
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
const ingested = ingestCanonicalCsv({ text, metadata, validationConfig });
if (ingested.status === "invalid") throw new Error("The approved dataset must validate.");
const dataset = ingested.dataset;
const findings = createFindingsEngine(createAnalyticsEngine(dataset), dataset);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
function benchmark(
  name: string,
  engine: ReturnType<typeof createFindingsEngine>,
  rowCount: number,
  filter: Parameters<typeof engine.generate>[0]["filter"],
): void {
  engine.generate({ filter });
  const timings = Array.from({ length: 7 }, () => {
    const started = performance.now();
    const result = engine.generate({ filter });
    if (!result.findings.every((item) => item.evidence.length > 0))
      throw new Error("Evidence missing.");
    return performance.now() - started;
  });
  console.log(
    JSON.stringify(
      {
        name,
        rows: rowCount,
        iterations: timings.length,
        medianMs: Number(median(timings).toFixed(2)),
        maxMs: Number(Math.max(...timings).toFixed(2)),
      },
      null,
      2,
    ),
  );
}

benchmark("full-demo", findings, dataset.rows.length, { period });
benchmark("filtered-west", findings, dataset.rows.length, { period, regions: ["West"] });

const uploadedText = readFileSync("tests/fixtures/ingestion/renamed-orders.csv", "utf8");
const parsedUpload = parseUploadCsv({
  filename: "renamed-orders.csv",
  sizeBytes: new TextEncoder().encode(uploadedText).byteLength,
  text: uploadedText,
});
if (parsedUpload.status === "error") throw new Error("The ingestion fixture must parse.");
const preparedUpload = prepareUploadedDataset({
  parsed: parsedUpload.value,
  mapping: mappingFromSuggestions(suggestUploadMappings(parsedUpload.value)),
  transformations: { ...DEFAULT_TRANSFORMATIONS, dateFormat: "mdy" },
});
if (!preparedUpload.canAnalyze || !preparedUpload.dataset)
  throw new Error("The ingestion fixture must prepare for analysis.");
const uploadedDataset = preparedUpload.dataset;
const uploadedFindings = createFindingsEngine(
  createAnalyticsEngine(uploadedDataset),
  uploadedDataset,
);
benchmark("uploaded-fixture", uploadedFindings, uploadedDataset.rows.length, {
  period: uploadedDataset.metadata.dateRange,
});
