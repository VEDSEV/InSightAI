import { prepareEvidenceRowSupport, type EvidenceRowSupport } from "./evidence.ts";
import { addMoneyCents, moneyCents, subtractMoneyCents } from "./money.ts";
import type { BreakdownDimension, CanonicalOrderLine, MoneyCents } from "./types.ts";

export type GroupingDimension = BreakdownDimension | "customer";

export type RowAggregate = {
  readonly rows: readonly CanonicalOrderLine[];
  readonly revenue: MoneyCents;
  readonly cost: MoneyCents;
  readonly grossProfit: MoneyCents;
  readonly orders: number;
  readonly quantity: number;
  readonly customers: number;
};

export type SegmentAggregate = RowAggregate & {
  readonly key: string;
  readonly label: string;
};

export type PreparedSegmentAggregate = SegmentAggregate & {
  readonly evidenceSupport: EvidenceRowSupport;
};

export function compareCodePoints(left: string, right: string): -1 | 0 | 1 {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function aggregateRows(rows: readonly CanonicalOrderLine[]): RowAggregate {
  let revenue = moneyCents(0);
  let cost = moneyCents(0);
  let quantity = 0;
  const orders = new Set<string>();
  const customers = new Set<string>();

  for (const row of rows) {
    revenue = addMoneyCents(revenue, row.revenueCents);
    cost = addMoneyCents(cost, row.costCents);
    quantity += row.quantity;
    if (!Number.isSafeInteger(quantity)) {
      throw new RangeError("Quantity aggregation exceeds the safe-integer range.");
    }
    orders.add(row.orderId);
    customers.add(row.customerId);
  }

  return Object.freeze({
    rows: Object.freeze([...rows]),
    revenue,
    cost,
    grossProfit: subtractMoneyCents(revenue, cost),
    orders: orders.size,
    quantity,
    customers: customers.size,
  });
}

function segmentIdentity(
  row: CanonicalOrderLine,
  dimension: GroupingDimension,
  missingKey: string,
): { readonly key: string; readonly label: string } {
  switch (dimension) {
    case "product":
      return { key: row.productId, label: row.productName };
    case "category":
      return { key: row.category, label: row.category };
    case "region":
      return { key: row.region, label: row.region };
    case "channel":
      return { key: row.salesChannel, label: row.salesChannel };
    case "customer_segment": {
      const key = row.customerSegment ?? missingKey;
      return { key, label: key };
    }
    case "campaign": {
      const key = row.campaign ?? missingKey;
      return { key, label: key };
    }
    case "customer":
      return { key: row.customerId, label: row.customerId };
  }
}

type MutableSegmentAggregate = {
  readonly label: string;
  readonly rows: CanonicalOrderLine[];
  revenue: MoneyCents;
  cost: MoneyCents;
  quantity: number;
  readonly orders: Set<string>;
  readonly customers: Set<string>;
};

function addRowToMutableAggregate(
  aggregate: MutableSegmentAggregate,
  row: CanonicalOrderLine,
): void {
  aggregate.rows.push(row);
  aggregate.revenue = addMoneyCents(aggregate.revenue, row.revenueCents);
  aggregate.cost = addMoneyCents(aggregate.cost, row.costCents);
  aggregate.quantity += row.quantity;
  if (!Number.isSafeInteger(aggregate.quantity)) {
    throw new RangeError("Quantity aggregation exceeds the safe-integer range.");
  }
  aggregate.orders.add(row.orderId);
  aggregate.customers.add(row.customerId);
}

/**
 * Builds several independent segment partitions in one traversal. Each prepared segment retains
 * the same frozen row support used by its evidence index, so later result construction does not
 * need to rescan or re-sort the segment.
 */
export function prepareGroupings(
  rows: readonly CanonicalOrderLine[],
  dimensions: readonly GroupingDimension[],
  missingKey: string,
): ReadonlyMap<GroupingDimension, readonly PreparedSegmentAggregate[]> {
  const uniqueDimensions = [...new Set(dimensions)];
  const mutableByDimension = new Map<GroupingDimension, Map<string, MutableSegmentAggregate>>(
    uniqueDimensions.map((dimension) => [dimension, new Map()]),
  );

  for (const row of rows) {
    for (const dimension of uniqueDimensions) {
      const groups = mutableByDimension.get(dimension);
      if (!groups) {
        throw new Error(`Missing prepared grouping state for ${dimension}.`);
      }
      const identity = segmentIdentity(row, dimension, missingKey);
      let aggregate = groups.get(identity.key);
      if (!aggregate) {
        aggregate = {
          label: identity.label,
          rows: [],
          revenue: moneyCents(0),
          cost: moneyCents(0),
          quantity: 0,
          orders: new Set<string>(),
          customers: new Set<string>(),
        };
        groups.set(identity.key, aggregate);
      }
      addRowToMutableAggregate(aggregate, row);
    }
  }

  const prepared = new Map<GroupingDimension, readonly PreparedSegmentAggregate[]>();
  for (const dimension of uniqueDimensions) {
    const groups = mutableByDimension.get(dimension);
    if (!groups) {
      throw new Error(`Missing completed grouping state for ${dimension}.`);
    }
    const aggregates: PreparedSegmentAggregate[] = [];
    for (const [key, aggregate] of groups) {
      const segmentRows = Object.freeze([...aggregate.rows]);
      aggregates.push(
        Object.freeze({
          key,
          label: aggregate.label,
          rows: segmentRows,
          revenue: aggregate.revenue,
          cost: aggregate.cost,
          grossProfit: subtractMoneyCents(aggregate.revenue, aggregate.cost),
          orders: aggregate.orders.size,
          quantity: aggregate.quantity,
          customers: aggregate.customers.size,
          evidenceSupport: prepareEvidenceRowSupport(segmentRows),
        }),
      );
    }
    prepared.set(dimension, Object.freeze(aggregates));
  }
  return prepared;
}

export function groupRows(
  rows: readonly CanonicalOrderLine[],
  dimension: GroupingDimension,
  missingKey: string,
): readonly SegmentAggregate[] {
  const groupedRows = new Map<
    string,
    { readonly label: string; readonly rows: CanonicalOrderLine[] }
  >();
  for (const row of rows) {
    const identity = segmentIdentity(row, dimension, missingKey);
    const existing = groupedRows.get(identity.key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groupedRows.set(identity.key, { label: identity.label, rows: [row] });
    }
  }

  const aggregates: SegmentAggregate[] = [];
  for (const [key, group] of groupedRows) {
    aggregates.push(Object.freeze({ key, label: group.label, ...aggregateRows(group.rows) }));
  }
  return Object.freeze(aggregates);
}
