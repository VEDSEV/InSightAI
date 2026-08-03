import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_COLUMNS = [
  "order_line_id",
  "order_id",
  "order_date",
  "customer_id",
  "customer_segment",
  "product_id",
  "product_name",
  "category",
  "region",
  "sales_channel",
  "quantity",
  "unit_price",
  "unit_cost",
  "discount_amount",
  "revenue",
  "cost",
  "campaign",
  "marketing_spend",
] as const;

type CsvRow = Readonly<Record<(typeof EXPECTED_COLUMNS)[number], string>>;

type IndependentControls = {
  readonly rowCount: number;
  readonly distinctOrderCount: number;
  readonly multiLineOrderCount: number;
  readonly distinctCustomerCount: number;
  readonly totalQuantity: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalGrossProfit: number;
  readonly overallGrossMargin: number;
  readonly totalMarketingSpend: number;
  readonly totalDiscount: number;
  readonly negativeMarginRowCount: number;
  readonly negativeMarginProductCount: number;
  readonly productsWithAnyNegativeMarginRowCount: number;
  readonly oneTimeCustomerCount: number;
  readonly repeatCustomerCount: number;
  readonly repeatCustomerRate: number;
  readonly missingOptionalFields: {
    readonly customerSegmentRowCount: number;
    readonly customerSegmentCustomerCount: number;
    readonly campaignRowCount: number;
    readonly campaignOrderCount: number;
  };
  readonly revenueByCategory: Readonly<Record<string, number>>;
  readonly revenueByRegion: Readonly<Record<string, number>>;
  readonly revenueByChannel: Readonly<Record<string, number>>;
};

export type VerificationReport = {
  readonly valid: true;
  readonly rowCount: number;
  readonly orderCount: number;
  readonly customerCount: number;
  readonly checksum: string;
  readonly checks: readonly string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function parseCsvMatrix(csv: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  assert(!quoted, "CSV contains an unterminated quoted field.");
  return rows;
}

export function parseDatasetCsv(csv: string): readonly CsvRow[] {
  const matrix = parseCsvMatrix(csv);
  const header = matrix[0];
  assert(header, "CSV is empty.");
  assert(
    JSON.stringify(header) === JSON.stringify(EXPECTED_COLUMNS),
    "CSV columns do not match the canonical Phase 2 schema.",
  );

  return matrix.slice(1).map((values, rowIndex) => {
    assert(
      values.length === EXPECTED_COLUMNS.length,
      `CSV row ${rowIndex + 2} has the wrong column count.`,
    );
    return Object.fromEntries(
      EXPECTED_COLUMNS.map((column, columnIndex) => [column, values[columnIndex]]),
    ) as CsvRow;
  });
}

function parseMoneyCents(value: string, field: string): number {
  assert(/^\d+\.\d{2}$/.test(value), `${field} is not a two-decimal amount.`);
  const [whole, decimal] = value.split(".");
  return Number(whole) * 100 + Number(decimal);
}

function money(cents: number): number {
  return cents / 100;
}

function roundRate(value: number): number {
  return Number(value.toFixed(6));
}

function add(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function record(map: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...map.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, money(value)]),
  );
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function percentile(sorted: readonly number[], probability: number): number {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function summarize(values: readonly number[]): Readonly<Record<string, unknown>> {
  assert(values.length > 0, "Cannot profile an empty distribution.");
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    minimum: sorted[0],
    maximum: sorted.at(-1),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    median: percentile(sorted, 0.5),
    percentiles: {
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
    },
  };
}

function sortedCountRecord(map: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function shareRecord(
  map: ReadonlyMap<string, number>,
  totalRevenueCents: number,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...map.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, round(value / totalRevenueCents)]),
  );
}

export function independentlyCalculateControls(rows: readonly CsvRow[]): IndependentControls {
  const lineIds = new Set<string>();
  const orderLines = new Map<string, number>();
  const positiveSpendRows = new Map<string, number>();
  const customerOrders = new Map<string, Set<string>>();
  const customerSegments = new Map<string, string>();
  const productProfit = new Map<string, number>();
  const productsWithNegativeRows = new Set<string>();
  const revenueByCategory = new Map<string, number>();
  const revenueByRegion = new Map<string, number>();
  const revenueByChannel = new Map<string, number>();
  const missingCustomerSegmentCustomers = new Set<string>();
  const missingCampaignOrders = new Set<string>();
  let totalQuantity = 0;
  let totalRevenueCents = 0;
  let totalCostCents = 0;
  let totalMarketingSpendCents = 0;
  let totalDiscountCents = 0;
  let negativeMarginRowCount = 0;
  let missingCustomerSegmentRows = 0;
  let missingCampaignRows = 0;

  for (const row of rows) {
    const requiredTextFields = [
      row.order_line_id,
      row.order_id,
      row.order_date,
      row.customer_id,
      row.product_id,
      row.product_name,
      row.category,
      row.region,
      row.sales_channel,
    ];
    assert(
      requiredTextFields.every((value) => value.trim().length > 0),
      "A required analytical field is blank.",
    );
    assert(!lineIds.has(row.order_line_id), `Duplicate line ID: ${row.order_line_id}`);
    lineIds.add(row.order_line_id);
    assert(/^LINE-\d{7}$/.test(row.order_line_id), "Invalid line ID format.");
    assert(/^ORD-\d{6}$/.test(row.order_id), "Invalid order ID format.");
    assert(/^CUST-\d{4}$/.test(row.customer_id), "Invalid customer ID format.");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(row.order_date), "Invalid order date format.");
    const quantity = Number(row.quantity);
    assert(Number.isInteger(quantity) && quantity > 0, "Invalid quantity.");
    const unitPriceCents = parseMoneyCents(row.unit_price, "unit_price");
    const unitCostCents = parseMoneyCents(row.unit_cost, "unit_cost");
    const discountCents = parseMoneyCents(row.discount_amount, "discount_amount");
    const revenueCents = parseMoneyCents(row.revenue, "revenue");
    const costCents = parseMoneyCents(row.cost, "cost");
    const spendCents = parseMoneyCents(row.marketing_spend, "marketing_spend");
    assert(
      revenueCents === quantity * unitPriceCents - discountCents,
      `Independent revenue reconciliation failed for ${row.order_line_id}.`,
    );
    assert(
      costCents === quantity * unitCostCents,
      `Independent cost reconciliation failed for ${row.order_line_id}.`,
    );

    totalQuantity += quantity;
    totalRevenueCents += revenueCents;
    totalCostCents += costCents;
    totalMarketingSpendCents += spendCents;
    totalDiscountCents += discountCents;
    orderLines.set(row.order_id, (orderLines.get(row.order_id) ?? 0) + 1);
    if (spendCents > 0) {
      positiveSpendRows.set(row.order_id, (positiveSpendRows.get(row.order_id) ?? 0) + 1);
    }
    const orders = customerOrders.get(row.customer_id) ?? new Set<string>();
    orders.add(row.order_id);
    customerOrders.set(row.customer_id, orders);
    const segment = customerSegments.get(row.customer_id);
    assert(!segment || segment === row.customer_segment, "Customer segment is inconsistent.");
    customerSegments.set(row.customer_id, row.customer_segment);
    const profitCents = revenueCents - costCents;
    add(productProfit, row.product_id, profitCents);
    add(revenueByCategory, row.category, revenueCents);
    add(revenueByRegion, row.region, revenueCents);
    add(revenueByChannel, row.sales_channel, revenueCents);
    if (row.customer_segment === "") {
      missingCustomerSegmentRows += 1;
      missingCustomerSegmentCustomers.add(row.customer_id);
    }
    if (row.campaign === "") {
      missingCampaignRows += 1;
      missingCampaignOrders.add(row.order_id);
    }
    if (profitCents < 0) {
      negativeMarginRowCount += 1;
      productsWithNegativeRows.add(row.product_id);
    }
  }

  assert(
    [...orderLines.values()].some((count) => count > 1),
    "No multi-line orders were found.",
  );
  assert(
    [...positiveSpendRows.values()].every((count) => count === 1),
    "Marketing spend is repeated on multiple lines of an order.",
  );
  const totalGrossProfitCents = totalRevenueCents - totalCostCents;
  const repeatCustomerCount = [...customerOrders.values()].filter(
    (orders) => orders.size >= 2,
  ).length;

  return {
    rowCount: rows.length,
    distinctOrderCount: orderLines.size,
    multiLineOrderCount: [...orderLines.values()].filter((count) => count > 1).length,
    distinctCustomerCount: customerOrders.size,
    totalQuantity,
    totalRevenue: money(totalRevenueCents),
    totalCost: money(totalCostCents),
    totalGrossProfit: money(totalGrossProfitCents),
    overallGrossMargin: roundRate(totalGrossProfitCents / totalRevenueCents),
    totalMarketingSpend: money(totalMarketingSpendCents),
    totalDiscount: money(totalDiscountCents),
    negativeMarginRowCount,
    negativeMarginProductCount: [...productProfit.values()].filter((profit) => profit < 0).length,
    productsWithAnyNegativeMarginRowCount: productsWithNegativeRows.size,
    oneTimeCustomerCount: customerOrders.size - repeatCustomerCount,
    repeatCustomerCount,
    repeatCustomerRate: roundRate(repeatCustomerCount / customerOrders.size),
    missingOptionalFields: {
      customerSegmentRowCount: missingCustomerSegmentRows,
      customerSegmentCustomerCount: missingCustomerSegmentCustomers.size,
      campaignRowCount: missingCampaignRows,
      campaignOrderCount: missingCampaignOrders.size,
    },
    revenueByCategory: record(revenueByCategory),
    revenueByRegion: record(revenueByRegion),
    revenueByChannel: record(revenueByChannel),
  };
}

export function independentlyCalculateDistributionProfile(
  rows: readonly CsvRow[],
  metadata: {
    readonly datasetVersion: string;
    readonly generatorVersion: string;
    readonly sourceRevision: string;
    readonly seed: number;
    readonly csvSha256: string;
  },
): Readonly<Record<string, unknown>> {
  const orderLineCounts = new Map<string, number>();
  const orderRevenueCents = new Map<string, number>();
  const customerOrders = new Map<string, Set<string>>();
  const quantityFrequency = new Map<string, number>();
  const productRevenue = new Map<string, number>();
  const categoryRevenue = new Map<string, number>();
  const regionRevenue = new Map<string, number>();
  const channelRevenue = new Map<string, number>();
  const ordersWithSpend = new Set<string>();
  const blankSegmentCustomers = new Set<string>();
  const blankCampaignOrders = new Set<string>();
  let totalRevenueCents = 0;
  let totalDiscountCents = 0;
  let totalSpendCents = 0;
  let rowsWithDiscount = 0;
  let rowsWithSpend = 0;
  let blankSegmentRows = 0;
  let blankCampaignRows = 0;

  for (const row of rows) {
    const revenueCents = parseMoneyCents(row.revenue, "revenue");
    const discountCents = parseMoneyCents(row.discount_amount, "discount_amount");
    const spendCents = parseMoneyCents(row.marketing_spend, "marketing_spend");
    totalRevenueCents += revenueCents;
    totalDiscountCents += discountCents;
    totalSpendCents += spendCents;
    orderLineCounts.set(row.order_id, (orderLineCounts.get(row.order_id) ?? 0) + 1);
    add(orderRevenueCents, row.order_id, revenueCents);
    const orders = customerOrders.get(row.customer_id) ?? new Set<string>();
    orders.add(row.order_id);
    customerOrders.set(row.customer_id, orders);
    add(quantityFrequency, row.quantity, 1);
    add(productRevenue, row.product_id, revenueCents);
    add(categoryRevenue, row.category, revenueCents);
    add(regionRevenue, row.region, revenueCents);
    add(channelRevenue, row.sales_channel, revenueCents);

    if (discountCents > 0) {
      rowsWithDiscount += 1;
    }
    if (spendCents > 0) {
      rowsWithSpend += 1;
      ordersWithSpend.add(row.order_id);
    }
    if (row.customer_segment === "") {
      blankSegmentRows += 1;
      blankSegmentCustomers.add(row.customer_id);
    }
    if (row.campaign === "") {
      blankCampaignRows += 1;
      blankCampaignOrders.add(row.order_id);
    }
  }

  const orderCounts = [...customerOrders.values()].map((orders) => orders.size);
  const repeatCustomerCount = orderCounts.filter((count) => count >= 2).length;

  return {
    ...metadata,
    definitions: {
      repeatCustomer:
        "Customer has at least two distinct order_id values across the full dataset period.",
      percentileMethod:
        "Linear interpolation between adjacent sorted observations at index (n - 1) * p.",
      shareBasis: "Full-period net revenue after discounts.",
      orderRevenue: "Sum of net revenue across all order lines sharing an order_id.",
    },
    orderLinesPerOrder: summarize([...orderLineCounts.values()]),
    quantityPerLine: {
      ...summarize(rows.map((row) => Number(row.quantity))),
      frequency: sortedCountRecord(quantityFrequency),
    },
    ordersPerCustomer: summarize(orderCounts),
    orderRevenue: summarize([...orderRevenueCents.values()].map(money)),
    discounts: {
      rowsWithDiscount,
      rowRate: round(rowsWithDiscount / rows.length),
      totalDiscount: money(totalDiscountCents),
    },
    marketingSpend: {
      rowsWithSpend,
      rowRate: round(rowsWithSpend / rows.length),
      ordersWithSpend: ordersWithSpend.size,
      orderRate: round(ordersWithSpend.size / orderLineCounts.size),
      totalSpend: money(totalSpendCents),
    },
    revenueShares: {
      product: shareRecord(productRevenue, totalRevenueCents),
      category: shareRecord(categoryRevenue, totalRevenueCents),
      region: shareRecord(regionRevenue, totalRevenueCents),
      channel: shareRecord(channelRevenue, totalRevenueCents),
    },
    optionalFieldMissingness: {
      customerSegment: {
        blankRows: blankSegmentRows,
        rowRate: round(blankSegmentRows / rows.length),
        blankCustomers: blankSegmentCustomers.size,
        customerRate: round(blankSegmentCustomers.size / customerOrders.size),
      },
      campaign: {
        blankRows: blankCampaignRows,
        rowRate: round(blankCampaignRows / rows.length),
        blankOrders: blankCampaignOrders.size,
        orderRate: round(blankCampaignOrders.size / orderLineCounts.size),
      },
    },
    customerFrequency: {
      oneTimeCustomerCount: customerOrders.size - repeatCustomerCount,
      repeatCustomerCount,
      repeatCustomerRate: round(repeatCustomerCount / customerOrders.size),
    },
  };
}

export async function verifySampleDataset(
  repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url))),
): Promise<VerificationReport> {
  const dataDirectory = resolve(repositoryRoot, "data", "sample");
  const [csv, checksumFile, controlsText, manifestText, configText, profileText, profileMarkdown] =
    await Promise.all([
      readFile(resolve(dataDirectory, "insightai-orders.csv"), "utf8"),
      readFile(resolve(dataDirectory, "insightai-orders.csv.sha256"), "utf8"),
      readFile(resolve(dataDirectory, "control-totals.json"), "utf8"),
      readFile(resolve(dataDirectory, "scenario-manifest.json"), "utf8"),
      readFile(resolve(dataDirectory, "generator-config.json"), "utf8"),
      readFile(resolve(dataDirectory, "distribution-profile.json"), "utf8"),
      readFile(resolve(dataDirectory, "DISTRIBUTION_PROFILE.md"), "utf8"),
    ]);
  const rows = parseDatasetCsv(csv);
  const actualChecksum = createHash("sha256").update(csv, "utf8").digest("hex");
  const recordedChecksum = checksumFile.trim().split(/\s+/)[0];
  assert(actualChecksum === recordedChecksum, "CSV checksum file does not match.");
  assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(csv), "Email-like customer data found.");
  assert(
    !/\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/.test(csv),
    "Phone-like customer data found.",
  );

  const controls = JSON.parse(controlsText) as Record<string, unknown>;
  const independentlyCalculated = independentlyCalculateControls(rows);
  for (const [key, value] of Object.entries(independentlyCalculated)) {
    assert(
      JSON.stringify(controls[key]) === JSON.stringify(value),
      `Recorded control total does not match independent calculation: ${key}`,
    );
  }
  assert(controls.csvSha256 === actualChecksum, "Control-total checksum does not match.");

  const config = JSON.parse(configText) as {
    datasetVersion: string;
    generatorVersion: string;
    sourceRevision: string;
    seed: number;
  };
  assert(controls.seed === config.seed, "Control seed does not match configuration.");
  assert(
    controls.datasetVersion === config.datasetVersion,
    "Dataset version does not match configuration.",
  );
  const recordedProfile = JSON.parse(profileText) as Record<string, unknown>;
  const independentlyCalculatedProfile = independentlyCalculateDistributionProfile(rows, {
    datasetVersion: config.datasetVersion,
    generatorVersion: config.generatorVersion,
    sourceRevision: config.sourceRevision,
    seed: config.seed,
    csvSha256: actualChecksum,
  });
  assert(
    JSON.stringify(recordedProfile) === JSON.stringify(independentlyCalculatedProfile),
    "Distribution profile does not match independent calculation.",
  );
  assert(profileMarkdown.includes(actualChecksum), "Human-readable profile checksum mismatch.");
  assert(
    independentlyCalculated.repeatCustomerCount * 2 !==
      independentlyCalculated.distinctCustomerCount,
    "Repeat-customer result is still an exact half split.",
  );
  assert(
    independentlyCalculated.missingOptionalFields.customerSegmentRowCount > 0 &&
      independentlyCalculated.missingOptionalFields.campaignRowCount > 0,
    "Configured optional missingness is absent.",
  );
  const manifest = JSON.parse(manifestText) as {
    datasetVersion: string;
    scenarios: Array<{ id: string; evidence: { orderLineIds: string[] } }>;
  };
  assert(manifest.datasetVersion === config.datasetVersion, "Manifest version mismatch.");
  assert(manifest.scenarios.length === 10, "Scenario manifest must contain ten scenarios.");
  const lineIds = new Set(rows.map((row) => row.order_line_id));
  assert(
    manifest.scenarios.every(
      (scenario) =>
        scenario.evidence.orderLineIds.length > 0 &&
        scenario.evidence.orderLineIds.every((lineId) => lineIds.has(lineId)),
    ),
    "Scenario manifest contains invalid evidence rows.",
  );

  return {
    valid: true,
    rowCount: independentlyCalculated.rowCount,
    orderCount: independentlyCalculated.distinctOrderCount,
    customerCount: independentlyCalculated.distinctCustomerCount,
    checksum: actualChecksum,
    checks: [
      "schema",
      "arithmetic",
      "grain",
      "customer-identifiers",
      "required-field-completeness",
      "optional-field-missingness",
      "marketing-allocation",
      "control-totals",
      "distribution-profile",
      "scenario-evidence",
      "checksum",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await verifySampleDataset();
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
