import type {
  DistributionProfile,
  GeneratorConfig,
  NumericDistribution,
  OrderLine,
} from "./types.ts";

const REPEAT_CUSTOMER_DEFINITION =
  "Customer has at least two distinct order_id values across the full dataset period.";

function cents(value: number): number {
  return Math.round(value * 100);
}

function money(value: number): number {
  return value / 100;
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

function summarize(values: readonly number[]): NumericDistribution {
  if (values.length === 0) {
    throw new Error("Cannot profile an empty distribution.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    minimum: sorted[0],
    maximum: sorted.at(-1) ?? sorted[0],
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

function add(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function sortedRecord(values: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...values.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function revenueShareRecord(
  values: ReadonlyMap<string, number>,
  totalRevenueCents: number,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, revenueCents]) => [key, round(revenueCents / totalRevenueCents)]),
  );
}

export function calculateDistributionProfile(
  rows: readonly OrderLine[],
  config: GeneratorConfig,
  csvSha256: string,
): DistributionProfile {
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
    const revenueCents = cents(row.revenue);
    const discountCents = cents(row.discount_amount);
    const spendCents = cents(row.marketing_spend);
    totalRevenueCents += revenueCents;
    totalDiscountCents += discountCents;
    totalSpendCents += spendCents;
    orderLineCounts.set(row.order_id, (orderLineCounts.get(row.order_id) ?? 0) + 1);
    add(orderRevenueCents, row.order_id, revenueCents);
    const orders = customerOrders.get(row.customer_id) ?? new Set<string>();
    orders.add(row.order_id);
    customerOrders.set(row.customer_id, orders);
    add(quantityFrequency, String(row.quantity), 1);
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
    datasetVersion: config.datasetVersion,
    generatorVersion: config.generatorVersion,
    sourceRevision: config.sourceRevision,
    seed: config.seed,
    csvSha256,
    definitions: {
      repeatCustomer: REPEAT_CUSTOMER_DEFINITION,
      percentileMethod:
        "Linear interpolation between adjacent sorted observations at index (n - 1) * p.",
      shareBasis: "Full-period net revenue after discounts.",
      orderRevenue: "Sum of net revenue across all order lines sharing an order_id.",
    },
    orderLinesPerOrder: summarize([...orderLineCounts.values()]),
    quantityPerLine: {
      ...summarize(rows.map((row) => row.quantity)),
      frequency: sortedRecord(quantityFrequency),
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
      product: revenueShareRecord(productRevenue, totalRevenueCents),
      category: revenueShareRecord(categoryRevenue, totalRevenueCents),
      region: revenueShareRecord(regionRevenue, totalRevenueCents),
      channel: revenueShareRecord(channelRevenue, totalRevenueCents),
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function distributionRow(name: string, distribution: NumericDistribution): string {
  return `| ${name} | ${formatNumber(distribution.minimum)} | ${formatNumber(distribution.maximum)} | ${formatNumber(distribution.mean)} | ${formatNumber(distribution.median)} | ${formatNumber(distribution.percentiles.p25)} | ${formatNumber(distribution.percentiles.p75)} | ${formatNumber(distribution.percentiles.p90)} | ${formatNumber(distribution.percentiles.p95)} | ${formatNumber(distribution.percentiles.p99)} |`;
}

function shareRows(values: Readonly<Record<string, number>>): string {
  return Object.entries(values)
    .sort(([, left], [, right]) => right - left)
    .map(([name, share]) => `| ${name} | ${formatPercent(share)} |`)
    .join("\n");
}

export function renderDistributionProfileMarkdown(profile: DistributionProfile): string {
  const quantityRows = Object.entries(profile.quantityPerLine.frequency)
    .map(
      ([quantity, count]) =>
        `| ${quantity} | ${formatNumber(count)} | ${formatPercent(count / profile.quantityPerLine.count)} |`,
    )
    .join("\n");

  return `# Distribution profile

This report is generated from the canonical Phase 2 CSV. The machine-readable companion is \`distribution-profile.json\`.

- Dataset version: \`${profile.datasetVersion}\`
- Generator version: \`${profile.generatorVersion}\`
- Seed: \`${profile.seed}\`
- CSV SHA-256: \`${profile.csvSha256}\`

## Distribution summary

| Measure | Minimum | Maximum | Mean | Median | P25 | P75 | P90 | P95 | P99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${distributionRow("Order lines per order", profile.orderLinesPerOrder)}
${distributionRow("Quantity per line", profile.quantityPerLine)}
${distributionRow("Orders per customer", profile.ordersPerCustomer)}
${distributionRow("Order revenue (USD)", profile.orderRevenue)}

Percentiles use ${profile.definitions.percentileMethod.toLowerCase()}

## Quantity frequency

| Quantity | Rows | Share |
| ---: | ---: | ---: |
${quantityRows}

## Customer frequency

- One-time customers: ${formatNumber(profile.customerFrequency.oneTimeCustomerCount)}
- Repeat customers: ${formatNumber(profile.customerFrequency.repeatCustomerCount)} (${formatPercent(profile.customerFrequency.repeatCustomerRate)})
- Definition: ${profile.definitions.repeatCustomer}

## Discounts and marketing spend

| Measure | Rows | Orders | Rate | Total |
| --- | ---: | ---: | ---: | ---: |
| Positive discount | ${formatNumber(profile.discounts.rowsWithDiscount)} | not applicable | ${formatPercent(profile.discounts.rowRate)} of rows | ${formatMoney(profile.discounts.totalDiscount)} |
| Positive marketing spend | ${formatNumber(profile.marketingSpend.rowsWithSpend)} | ${formatNumber(profile.marketingSpend.ordersWithSpend)} | ${formatPercent(profile.marketingSpend.orderRate)} of orders | ${formatMoney(profile.marketingSpend.totalSpend)} |

## Optional-field missingness

| Optional field | Blank rows | Row rate | Affected entity | Entity rate |
| --- | ---: | ---: | ---: | ---: |
| customer_segment | ${formatNumber(profile.optionalFieldMissingness.customerSegment.blankRows)} | ${formatPercent(profile.optionalFieldMissingness.customerSegment.rowRate)} | ${formatNumber(profile.optionalFieldMissingness.customerSegment.blankCustomers)} customers | ${formatPercent(profile.optionalFieldMissingness.customerSegment.customerRate)} |
| campaign | ${formatNumber(profile.optionalFieldMissingness.campaign.blankRows)} | ${formatPercent(profile.optionalFieldMissingness.campaign.rowRate)} | ${formatNumber(profile.optionalFieldMissingness.campaign.blankOrders)} orders | ${formatPercent(profile.optionalFieldMissingness.campaign.orderRate)} |

Blank optional values mean "not reported / unattributed," not zero. Required analytical fields remain complete.

## Net-revenue shares

Shares use ${profile.definitions.shareBasis.toLowerCase()}

### Product

| Product ID | Share |
| --- | ---: |
${shareRows(profile.revenueShares.product)}

### Category

| Category | Share |
| --- | ---: |
${shareRows(profile.revenueShares.category)}

### Region

| Region | Share |
| --- | ---: |
${shareRows(profile.revenueShares.region)}

### Channel

| Channel | Share |
| --- | ---: |
${shareRows(profile.revenueShares.channel)}
`;
}
