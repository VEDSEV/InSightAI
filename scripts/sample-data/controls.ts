import type { DatasetControlTotals, GeneratorConfig, OrderLine } from "./types.ts";

function toCents(value: number): number {
  return Math.round(value * 100);
}

function money(cents: number): number {
  return cents / 100;
}

function roundRate(value: number): number {
  return Number(value.toFixed(6));
}

function sortedMoneyRecord(values: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, cents]) => [key, money(cents)]),
  );
}

function addToMap(map: Map<string, number>, key: string, cents: number): void {
  map.set(key, (map.get(key) ?? 0) + cents);
}

export function calculateControlTotals(
  rows: readonly OrderLine[],
  config: GeneratorConfig,
  csvSha256: string,
): DatasetControlTotals {
  const orderLineCounts = new Map<string, number>();
  const customerOrders = new Map<string, Set<string>>();
  const productProfit = new Map<string, number>();
  const productsWithNegativeRows = new Set<string>();
  const revenueByCategory = new Map<string, number>();
  const revenueByRegion = new Map<string, number>();
  const revenueByChannel = new Map<string, number>();
  let totalQuantity = 0;
  let totalRevenueCents = 0;
  let totalCostCents = 0;
  let totalMarketingSpendCents = 0;
  let totalDiscountCents = 0;
  let negativeMarginRowCount = 0;
  let missingCustomerSegmentRows = 0;
  let missingCampaignRows = 0;
  const missingCustomerSegmentCustomers = new Set<string>();
  const missingCampaignOrders = new Set<string>();

  for (const row of rows) {
    const revenueCents = toCents(row.revenue);
    const costCents = toCents(row.cost);
    const profitCents = revenueCents - costCents;
    totalQuantity += row.quantity;
    totalRevenueCents += revenueCents;
    totalCostCents += costCents;
    totalMarketingSpendCents += toCents(row.marketing_spend);
    totalDiscountCents += toCents(row.discount_amount);
    orderLineCounts.set(row.order_id, (orderLineCounts.get(row.order_id) ?? 0) + 1);
    const orders = customerOrders.get(row.customer_id) ?? new Set<string>();
    orders.add(row.order_id);
    customerOrders.set(row.customer_id, orders);
    productProfit.set(row.product_id, (productProfit.get(row.product_id) ?? 0) + profitCents);
    addToMap(revenueByCategory, row.category, revenueCents);
    addToMap(revenueByRegion, row.region, revenueCents);
    addToMap(revenueByChannel, row.sales_channel, revenueCents);

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

  const totalGrossProfitCents = totalRevenueCents - totalCostCents;
  const repeatCustomerCount = [...customerOrders.values()].filter(
    (orders) => orders.size >= 2,
  ).length;

  return {
    datasetVersion: config.datasetVersion,
    generatorVersion: config.generatorVersion,
    sourceRevision: config.sourceRevision,
    seed: config.seed,
    currency: config.currency,
    timezone: config.timezone,
    dateRange: { start: config.dateStart, end: config.dateEnd },
    csvSha256,
    rowCount: rows.length,
    distinctOrderCount: orderLineCounts.size,
    multiLineOrderCount: [...orderLineCounts.values()].filter((lineCount) => lineCount > 1).length,
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
    repeatCustomerDefinition:
      "Customer has at least two distinct order_id values across the full dataset period.",
    oneTimeCustomerCount: customerOrders.size - repeatCustomerCount,
    repeatCustomerCount,
    repeatCustomerRate: roundRate(repeatCustomerCount / customerOrders.size),
    missingOptionalFields: {
      customerSegmentRowCount: missingCustomerSegmentRows,
      customerSegmentCustomerCount: missingCustomerSegmentCustomers.size,
      campaignRowCount: missingCampaignRows,
      campaignOrderCount: missingCampaignOrders.size,
    },
    revenueByCategory: sortedMoneyRecord(revenueByCategory),
    revenueByRegion: sortedMoneyRecord(revenueByRegion),
    revenueByChannel: sortedMoneyRecord(revenueByChannel),
  };
}
