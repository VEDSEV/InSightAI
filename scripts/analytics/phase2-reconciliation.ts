import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ANALYTICS_SPECIFICATION_VERSION,
  createAnalyticsEngine,
  createDateInterval,
  ingestCanonicalCsv,
  type BreakdownDimension,
  type DatasetMetadata,
  type MetricId,
  type MetricResult,
  type ValidatedDataset,
  type ValidationConfiguration,
} from "../../src/analytics/index.ts";

const EXPECTED = Object.freeze({
  rowCount: 6_909,
  orderCount: 4_310,
  customerCount: 1_200,
  quantity: 9_044,
  revenueCents: 77_823_110,
  costCents: 46_041_700,
  grossProfitCents: 31_781_410,
  marketingSpendCents: 7_340_221,
  discountCents: 2_522_290,
  repeatCustomers: 517,
  oneTimeCustomers: 683,
  categoryRevenue: Object.freeze({
    Gifting: 2_593_218,
    Home: 29_017_166,
    Kitchen: 23_253_510,
    Outdoor: 6_467_694,
    Wellness: 9_568_686,
    Workspace: 6_922_836,
  }),
  regionRevenue: Object.freeze({
    Central: 18_471_826,
    East: 19_322_210,
    South: 11_700_082,
    West: 28_328_992,
  }),
  channelRevenue: Object.freeze({
    Marketplace: 20_238_052,
    "Retail Pop-up": 9_615_448,
    Web: 47_969_610,
  }),
});

type Phase2ControlFile = {
  readonly datasetVersion: string;
  readonly sourceRevision: string;
  readonly currency: string;
  readonly timezone: string;
  readonly dateRange: { readonly start: string; readonly end: string };
  readonly csvSha256: string;
  readonly rowCount: number;
  readonly distinctOrderCount: number;
  readonly distinctCustomerCount: number;
  readonly totalQuantity: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalGrossProfit: number;
  readonly totalMarketingSpend: number;
  readonly totalDiscount: number;
  readonly oneTimeCustomerCount: number;
  readonly repeatCustomerCount: number;
  readonly revenueByCategory: Readonly<Record<string, number>>;
  readonly revenueByRegion: Readonly<Record<string, number>>;
  readonly revenueByChannel: Readonly<Record<string, number>>;
};

export type ReconciliationCheck = {
  readonly name: string;
  readonly expected: number | string;
  readonly actual: number | string;
  readonly passed: boolean;
};

export type Phase2ReconciliationReport = {
  readonly status: "passed" | "failed";
  readonly datasetVersion: string;
  readonly checks: readonly ReconciliationCheck[];
  readonly checkCount: number;
  readonly passedCheckCount: number;
  readonly checksum: string;
};

export type LoadedPhase2Fixture = {
  readonly csvText: string;
  readonly checksum: string;
  readonly control: Phase2ControlFile;
  readonly metadata: DatasetMetadata;
  readonly validation: ValidationConfiguration;
  readonly dataset: ValidatedDataset;
};

function requiredInterval(start: string, end: string) {
  const result = createDateInterval(start, end);
  if (result.status === "error") {
    throw new Error(result.errors.map((error) => error.message).join(" "));
  }
  return result.value;
}

function metric(result: MetricResult, expectedKind: MetricResult["resultType"] = "metric") {
  if (result.resultType !== expectedKind || result.status !== "ok") {
    throw new Error(
      `${result.label} is not computable: ${"message" in result ? result.message : "unknown"}`,
    );
  }
  return result.value;
}

function numericMetric(result: MetricResult): number {
  const value = metric(result);
  switch (value.kind) {
    case "money":
      return value.cents;
    case "count":
    case "quantity":
      return value.value;
    case "rational_money":
      return value.numeratorCents / value.denominator;
    case "rate":
      return value.ratio.numerator / value.ratio.denominator;
  }
}

function addCheck(
  checks: ReconciliationCheck[],
  name: string,
  expected: number | string,
  actual: number | string,
): void {
  checks.push(Object.freeze({ name, expected, actual, passed: expected === actual }));
}

function decimalControlsToCents(value: number): number {
  const serialized = value.toFixed(2);
  const [whole, fraction] = serialized.split(".");
  return Number(whole) * 100 + Number(fraction);
}

function assertControlFile(control: Phase2ControlFile): void {
  const checks: readonly [string, number, number][] = [
    ["rowCount", EXPECTED.rowCount, control.rowCount],
    ["distinctOrderCount", EXPECTED.orderCount, control.distinctOrderCount],
    ["distinctCustomerCount", EXPECTED.customerCount, control.distinctCustomerCount],
    ["totalQuantity", EXPECTED.quantity, control.totalQuantity],
    ["totalRevenue", EXPECTED.revenueCents, decimalControlsToCents(control.totalRevenue)],
    ["totalCost", EXPECTED.costCents, decimalControlsToCents(control.totalCost)],
    [
      "totalGrossProfit",
      EXPECTED.grossProfitCents,
      decimalControlsToCents(control.totalGrossProfit),
    ],
    [
      "totalMarketingSpend",
      EXPECTED.marketingSpendCents,
      decimalControlsToCents(control.totalMarketingSpend),
    ],
    ["totalDiscount", EXPECTED.discountCents, decimalControlsToCents(control.totalDiscount)],
    ["repeatCustomerCount", EXPECTED.repeatCustomers, control.repeatCustomerCount],
    ["oneTimeCustomerCount", EXPECTED.oneTimeCustomers, control.oneTimeCustomerCount],
  ];
  const mismatch = checks.find(([, expected, actual]) => expected !== actual);
  if (mismatch) {
    throw new Error(
      `Phase 2 control file changed before analytics reconciliation: ${mismatch[0]} expected ${mismatch[1]}, received ${mismatch[2]}.`,
    );
  }
}

function phase2ValidationConfiguration(control: Phase2ControlFile): {
  readonly metadata: DatasetMetadata;
  readonly validation: ValidationConfiguration;
} {
  const dateRange = requiredInterval(control.dateRange.start, control.dateRange.end);
  const metadata: DatasetMetadata = Object.freeze({
    datasetVersion: control.datasetVersion,
    transformationVersion: control.sourceRevision,
    analyticsSpecificationVersion: ANALYTICS_SPECIFICATION_VERSION,
    currency: control.currency,
    timezone: control.timezone,
    dateRange,
    revenueSemantics: "net_after_line_discount",
    costSemantics: "line_cost_of_goods",
    marketingSpendSemantics: "single_line_order_allocation",
  });
  const validation: ValidationConfiguration = Object.freeze({
    currency: control.currency,
    timezone: control.timezone,
    dateRange,
    vocabulary: Object.freeze({
      categories: Object.freeze(["Gifting", "Home", "Kitchen", "Outdoor", "Wellness", "Workspace"]),
      regions: Object.freeze(["Central", "East", "South", "West"]),
      salesChannels: Object.freeze(["Marketplace", "Retail Pop-up", "Web"]),
      customerSegments: Object.freeze(["Loyal", "Occasional", "New"]),
      campaigns: Object.freeze([
        "Organic Discovery",
        "Email Retention",
        "Paid Social",
        "Sponsored Listings",
        "Marketplace Boost",
        "Local Event",
        "Community Referral",
      ]),
    }),
    idPatterns: Object.freeze({
      orderLineId: /^LINE-\d{7}$/,
      orderId: /^ORD-\d{6}$/,
      customerId: /^CUST-\d{4}$/,
      productId: /^PROD-[A-Z]{3}-\d{3}$/,
    }),
    marketingSpendSemantics: "single_line_order_allocation",
  });
  return { metadata, validation };
}

async function breakdownRevenue(
  engine: ReturnType<typeof createAnalyticsEngine>,
  dimension: BreakdownDimension,
  filter: { readonly period: DatasetMetadata["dateRange"] },
): Promise<Readonly<Record<string, number>>> {
  const result = engine.breakdown({ dimension, filter });
  if (result.status === "error" || result.value.status !== "ok") {
    throw new Error(`Phase 2 ${dimension} breakdown is not computable.`);
  }
  return Object.freeze(
    Object.fromEntries(result.value.entries.map((entry) => [entry.key, entry.revenue])),
  );
}

export async function reconcilePhase2Fixture(
  repositoryRoot: string,
): Promise<Phase2ReconciliationReport> {
  const loaded = await loadPhase2Fixture(repositoryRoot);
  const { checksum, control, metadata, dataset } = loaded;
  const engine = createAnalyticsEngine(dataset);
  const filter = { period: metadata.dateRange } as const;
  const metrics = engine.metrics(filter);
  const checks: ReconciliationCheck[] = [];
  addCheck(checks, "checksum", control.csvSha256, checksum);
  const metricChecks: readonly [string, MetricId, number][] = [
    ["row count", "order_lines", EXPECTED.rowCount],
    ["order count", "distinct_orders", EXPECTED.orderCount],
    ["customer count", "unique_customers", EXPECTED.customerCount],
    ["quantity", "total_quantity", EXPECTED.quantity],
    ["revenue cents", "total_revenue", EXPECTED.revenueCents],
    ["cost cents", "total_cost", EXPECTED.costCents],
    ["gross profit cents", "gross_profit", EXPECTED.grossProfitCents],
    ["marketing spend cents", "total_marketing_spend", EXPECTED.marketingSpendCents],
    ["discount cents", "total_discounts", EXPECTED.discountCents],
    ["repeat customers", "repeat_customers_full_dataset", EXPECTED.repeatCustomers],
    ["one-time customers", "one_time_customers_full_dataset", EXPECTED.oneTimeCustomers],
  ];
  for (const [name, metricId, expected] of metricChecks) {
    addCheck(checks, name, expected, numericMetric(metrics[metricId]));
  }

  const margin = metric(metrics.gross_margin);
  if (margin.kind !== "rate") {
    throw new Error("Gross margin result is not an exact rate.");
  }
  addCheck(
    checks,
    "gross margin exact cross-product",
    1,
    margin.ratio.numerator * EXPECTED.revenueCents ===
      margin.ratio.denominator * EXPECTED.grossProfitCents
      ? 1
      : 0,
  );

  const breakdownChecks: readonly [BreakdownDimension, Readonly<Record<string, number>>][] = [
    ["category", EXPECTED.categoryRevenue],
    ["region", EXPECTED.regionRevenue],
    ["channel", EXPECTED.channelRevenue],
  ];
  for (const [dimension, expected] of breakdownChecks) {
    const actual = await breakdownRevenue(engine, dimension, filter);
    for (const [key, value] of Object.entries(expected)) {
      addCheck(checks, `${dimension} revenue: ${key}`, value, actual[key] ?? "missing");
    }
  }

  const passedCheckCount = checks.filter((check) => check.passed).length;
  return Object.freeze({
    status: passedCheckCount === checks.length ? "passed" : "failed",
    datasetVersion: control.datasetVersion,
    checks: Object.freeze(checks),
    checkCount: checks.length,
    passedCheckCount,
    checksum,
  });
}

export async function loadPhase2Fixture(repositoryRoot: string): Promise<LoadedPhase2Fixture> {
  const csvPath = path.join(repositoryRoot, "data", "sample", "insightai-orders.csv");
  const controlsPath = path.join(repositoryRoot, "data", "sample", "control-totals.json");
  const [csvBuffer, controlsText] = await Promise.all([
    readFile(csvPath),
    readFile(controlsPath, "utf8"),
  ]);
  const control = JSON.parse(controlsText) as Phase2ControlFile;
  assertControlFile(control);
  const checksum = createHash("sha256").update(csvBuffer).digest("hex");
  const setup = phase2ValidationConfiguration(control);
  const ingestion = ingestCanonicalCsv({
    text: csvBuffer.toString("utf8"),
    metadata: setup.metadata,
    validationConfig: setup.validation,
  });
  if (ingestion.status !== "valid") {
    throw new Error(ingestion.errors.map((error) => error.message).join("\n"));
  }
  return Object.freeze({
    csvText: csvBuffer.toString("utf8"),
    checksum,
    control,
    metadata: setup.metadata,
    validation: setup.validation,
    dataset: ingestion.dataset,
  });
}

export { EXPECTED as PHASE2_EXPECTED_ANALYTICS_CONTROLS };
