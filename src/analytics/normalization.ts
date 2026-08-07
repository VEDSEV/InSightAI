import type { NormalizedOrderLine, RawOrderLine } from "./types.ts";

function normalizeRequired(value: string): string {
  return value.trim();
}

function normalizeOptional(value: string): string | null {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function normalizeRawOrderLine(row: RawOrderLine): NormalizedOrderLine {
  return Object.freeze({
    sourceRowNumber: row.sourceRowNumber,
    orderLineId: normalizeRequired(row.order_line_id),
    orderId: normalizeRequired(row.order_id),
    orderDate: normalizeRequired(row.order_date),
    customerId: normalizeRequired(row.customer_id),
    customerSegment: normalizeOptional(row.customer_segment),
    productId: normalizeRequired(row.product_id),
    productName: normalizeRequired(row.product_name),
    category: normalizeRequired(row.category),
    region: normalizeRequired(row.region),
    salesChannel: normalizeRequired(row.sales_channel),
    quantity: normalizeRequired(row.quantity),
    unitPrice: normalizeRequired(row.unit_price),
    unitCost: normalizeRequired(row.unit_cost),
    discountAmount: normalizeRequired(row.discount_amount),
    revenue: normalizeRequired(row.revenue),
    cost: normalizeRequired(row.cost),
    campaign: normalizeOptional(row.campaign),
    marketingSpend: normalizeRequired(row.marketing_spend),
  });
}

export function normalizeRawOrderLines(
  rows: readonly RawOrderLine[],
): readonly NormalizedOrderLine[] {
  return Object.freeze(rows.map(normalizeRawOrderLine));
}
