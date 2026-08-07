import {
  createDateInterval,
  ingestCanonicalCsv,
  type DatasetMetadata,
  type ValidatedDataset,
  type ValidationConfiguration,
} from "@/analytics";

export const DASHBOARD_SAMPLE_DATA_URL = "/data/insightai-orders.csv";

const sampleDateRange = createDateInterval("2024-01-01", "2025-12-31");

if (sampleDateRange.status !== "ok") {
  throw new Error("The approved Phase 2 date range configuration is invalid.");
}

const metadata: DatasetMetadata = Object.freeze({
  datasetVersion: "insightai-synthetic-orders-v1",
  transformationVersion: "phase2-generator-v1.1",
  analyticsSpecificationVersion: "3.0.0",
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: sampleDateRange.value,
  revenueSemantics: "net_after_line_discount",
  costSemantics: "line_cost_of_goods",
  marketingSpendSemantics: "single_line_order_allocation",
});

const validationConfig: ValidationConfiguration = Object.freeze({
  currency: metadata.currency,
  timezone: metadata.timezone,
  dateRange: metadata.dateRange,
  vocabulary: Object.freeze({
    categories: Object.freeze([]),
    regions: Object.freeze([]),
    salesChannels: Object.freeze([]),
    customerSegments: Object.freeze([]),
    campaigns: Object.freeze([]),
  }),
  idPatterns: Object.freeze({
    orderLineId: /^LINE-\d{7}$/u,
    orderId: /^ORD-\d{6}$/u,
    customerId: /^CUST-\d{4}$/u,
    productId: /^PROD-[A-Z]{3}-\d{3}$/u,
  }),
  marketingSpendSemantics: metadata.marketingSpendSemantics,
});

export type DashboardDatasetLoadResult =
  | { readonly status: "ready"; readonly dataset: ValidatedDataset }
  | { readonly status: "error"; readonly message: string };

/** Fetches the immutable Phase 2 CSV once; parsing and validation stay at the public analytics boundary. */
export async function loadDashboardSampleDataset(): Promise<DashboardDatasetLoadResult> {
  const response = await fetch(DASHBOARD_SAMPLE_DATA_URL);
  if (!response.ok) {
    return {
      status: "error",
      message: `The approved sample dataset could not be loaded (${response.status}).`,
    };
  }
  const ingested = ingestCanonicalCsv({ text: await response.text(), metadata, validationConfig });
  if (ingested.status === "invalid") {
    return {
      status: "error",
      message: `The sample dataset did not pass validation: ${ingested.errors[0]?.message ?? "Unknown error"}`,
    };
  }
  return { status: "ready", dataset: ingested.dataset };
}
