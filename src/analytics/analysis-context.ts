import {
  prepareGroupings,
  type GroupingDimension,
  type PreparedSegmentAggregate,
} from "./aggregation.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import { prepareEvidenceRowSupport, type EvidenceRowSupport } from "./evidence.ts";
import {
  classifyCustomersByOrderHistory,
  codePointCompare,
  createFilterContextWithIndex,
  createFilterDatasetIndex,
  matchesFilterContextWithoutCustomerType,
  type FilterContextInput,
} from "./filters.ts";
import { addMoneyCents, moneyCents, subtractMoneyCents } from "./money.ts";
import type {
  AnalyticsConfiguration,
  AnalyticsResult,
  CanonicalOrderLine,
  CustomerType,
  FilterContext,
  IsoDate,
  MoneyCents,
  ValidatedDataset,
} from "./types.ts";

export const MAX_CACHED_ANALYSIS_CONTEXTS = 8;

const BREAKDOWN_DIMENSIONS = Object.freeze([
  "product",
  "category",
  "region",
  "channel",
  "customer_segment",
  "campaign",
] as const satisfies readonly GroupingDimension[]);

const runtimeTokenBrand: unique symbol = Symbol("analytics-runtime-token");

export type AnalysisAggregate = {
  readonly revenue: MoneyCents;
  readonly cost: MoneyCents;
  readonly grossProfit: MoneyCents;
  readonly discounts: MoneyCents;
  readonly marketingSpend: MoneyCents;
  readonly marketingContribution: MoneyCents;
  readonly quantity: number;
  readonly orderCount: number;
  readonly uniqueCustomerCount: number;
  readonly oneTimeWithinSelection: number;
  readonly repeatWithinSelection: number;
  readonly oneTimeFullDataset: number;
  readonly repeatFullDataset: number;
};

export type AnalysisContext = {
  readonly cacheKey: string;
  readonly filterContext: FilterContext;
  readonly rows: readonly CanonicalOrderLine[];
  readonly aggregate: AnalysisAggregate;
  readonly evidenceSupport: EvidenceRowSupport;
  readonly [runtimeTokenBrand]: object;
};

export type PreparedDateBucket = {
  readonly date: IsoDate;
  readonly rows: readonly CanonicalOrderLine[];
  readonly revenue: MoneyCents;
  readonly rowCount: number;
  readonly orderCount: number;
  readonly evidenceSupport: EvidenceRowSupport;
};

export type PreparedDateIndex = {
  readonly dates: readonly IsoDate[];
  readonly buckets: readonly PreparedDateBucket[];
  readonly get: (date: IsoDate) => PreparedDateBucket | undefined;
};

export type AnalysisRuntime = {
  readonly dataset: ValidatedDataset;
  readonly configuration: AnalyticsConfiguration;
  readonly maxCachedContexts: number;
  readonly cachedContextCount: () => number;
  readonly resolve: (filter: FilterContextInput) => AnalyticsResult<AnalysisContext>;
  readonly grouping: (
    context: AnalysisContext,
    dimension: GroupingDimension,
  ) => readonly PreparedSegmentAggregate[];
  readonly dateIndex: (context: AnalysisContext) => PreparedDateIndex;
};

type ContextDerivedState = {
  readonly groupings: Map<GroupingDimension, readonly PreparedSegmentAggregate[]>;
  dateIndex: PreparedDateIndex | null;
};

type CachedContext = {
  readonly context: AnalysisContext;
  readonly derived: ContextDerivedState;
};

function snapshotConfiguration(configuration: AnalyticsConfiguration): AnalyticsConfiguration {
  return Object.freeze({
    ...configuration,
    marginRules: Object.freeze({ ...configuration.marginRules }),
    anomaly: Object.freeze({ ...configuration.anomaly }),
  });
}

/**
 * Produces a collision-free key from a normalized context. Runtime and dataset identity deliberately
 * stay outside the key because each bounded cache belongs to exactly one runtime and dataset.
 */
export function canonicalAnalysisFilterKey(context: FilterContext): string {
  return JSON.stringify([
    "analysis-filter-v1",
    [context.period.start, context.period.end, context.period.boundary],
    context.timezone,
    context.productIds,
    context.categories,
    context.regions,
    context.salesChannels,
    context.customerSegments,
    context.campaigns,
    context.customerTypes === null
      ? null
      : [context.customerTypes.scope, context.customerTypes.values],
  ]);
}

function checkedAddInteger(left: number, right: number, label: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new RangeError(`${label} inputs must be safe integers.`);
  }
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} exceeds the safe-integer range.`);
  }
  return result;
}

function addCustomerOrder(
  ordersByCustomer: Map<string, Set<string>>,
  customerId: string,
  orderId: string,
): void {
  const orderIds = ordersByCustomer.get(customerId);
  if (orderIds) {
    orderIds.add(orderId);
  } else {
    ordersByCustomer.set(customerId, new Set([orderId]));
  }
}

function aggregateContextRows(
  rows: readonly CanonicalOrderLine[],
  fullDatasetRepeatCustomerIds: ReadonlySet<string>,
): AnalysisAggregate {
  let revenue = moneyCents(0);
  let cost = moneyCents(0);
  let discounts = moneyCents(0);
  let marketingSpend = moneyCents(0);
  let quantity = 0;
  const orderIds = new Set<string>();
  const ordersByCustomer = new Map<string, Set<string>>();

  for (const row of rows) {
    revenue = addMoneyCents(revenue, row.revenueCents);
    cost = addMoneyCents(cost, row.costCents);
    discounts = addMoneyCents(discounts, row.discountAmountCents);
    marketingSpend = addMoneyCents(marketingSpend, row.marketingSpendCents);
    quantity = checkedAddInteger(quantity, row.quantity, "Quantity aggregation");
    orderIds.add(row.orderId);
    addCustomerOrder(ordersByCustomer, row.customerId, row.orderId);
  }

  let repeatWithinSelection = 0;
  let repeatFullDataset = 0;
  for (const [customerId, selectedOrders] of ordersByCustomer) {
    if (selectedOrders.size >= 2) {
      repeatWithinSelection = checkedAddInteger(repeatWithinSelection, 1, "Repeat-customer count");
    }
    if (fullDatasetRepeatCustomerIds.has(customerId)) {
      repeatFullDataset = checkedAddInteger(
        repeatFullDataset,
        1,
        "Full-dataset repeat-customer count",
      );
    }
  }

  const uniqueCustomerCount = ordersByCustomer.size;
  const grossProfit = subtractMoneyCents(revenue, cost);
  return Object.freeze({
    revenue,
    cost,
    grossProfit,
    discounts,
    marketingSpend,
    marketingContribution: subtractMoneyCents(grossProfit, marketingSpend),
    quantity,
    orderCount: orderIds.size,
    uniqueCustomerCount,
    oneTimeWithinSelection: uniqueCustomerCount - repeatWithinSelection,
    repeatWithinSelection,
    oneTimeFullDataset: uniqueCustomerCount - repeatFullDataset,
    repeatFullDataset,
  });
}

function filterRows(
  dataset: ValidatedDataset,
  context: FilterContext,
  missingKey: string,
  fullDatasetCustomerTypes: ReadonlyMap<string, CustomerType>,
): readonly CanonicalOrderLine[] {
  const baseRows = dataset.rows.filter((row) =>
    matchesFilterContextWithoutCustomerType(row, context, missingKey),
  );
  const typeFilter = context.customerTypes;
  if (typeFilter === null || typeFilter.values.length === 0) {
    return Object.freeze(baseRows);
  }

  const classifications =
    typeFilter.scope === "within_selection"
      ? classifyCustomersByOrderHistory(baseRows)
      : fullDatasetCustomerTypes;
  return Object.freeze(
    baseRows.filter((row) => {
      const customerType = classifications.get(row.customerId);
      return customerType !== undefined && typeFilter.values.includes(customerType);
    }),
  );
}

function prepareDateIndex(rows: readonly CanonicalOrderLine[]): PreparedDateIndex {
  const mutable = new Map<
    IsoDate,
    { readonly rows: CanonicalOrderLine[]; revenue: MoneyCents; readonly orders: Set<string> }
  >();
  for (const row of rows) {
    let bucket = mutable.get(row.orderDate);
    if (!bucket) {
      bucket = { rows: [], revenue: moneyCents(0), orders: new Set<string>() };
      mutable.set(row.orderDate, bucket);
    }
    bucket.rows.push(row);
    bucket.revenue = addMoneyCents(bucket.revenue, row.revenueCents);
    bucket.orders.add(row.orderId);
  }

  const dates = Object.freeze([...mutable.keys()].sort(codePointCompare));
  const buckets: PreparedDateBucket[] = [];
  const byDate = new Map<IsoDate, PreparedDateBucket>();
  for (const date of dates) {
    const source = mutable.get(date);
    if (!source) {
      throw new Error(`Missing prepared date state for ${date}.`);
    }
    const bucketRows = Object.freeze([...source.rows]);
    const bucket = Object.freeze({
      date,
      rows: bucketRows,
      revenue: source.revenue,
      rowCount: bucketRows.length,
      orderCount: source.orders.size,
      evidenceSupport: prepareEvidenceRowSupport(bucketRows),
    });
    buckets.push(bucket);
    byDate.set(date, bucket);
  }
  return Object.freeze({
    dates,
    buckets: Object.freeze(buckets),
    get: (date: IsoDate) => byDate.get(date),
  });
}

function emptyDerivedState(): ContextDerivedState {
  return { groupings: new Map(), dateIndex: null };
}

/**
 * Creates a bounded analysis runtime. A facade can retain it for its lifetime; standalone public
 * functions can create and discard one per invocation without any process-global cache.
 */
export function createAnalysisRuntime(
  dataset: ValidatedDataset,
  configuration: AnalyticsConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): AnalysisRuntime {
  const immutableConfiguration = snapshotConfiguration(configuration);
  const missingKey = immutableConfiguration.missingDimensionKey;
  const filterIndex = createFilterDatasetIndex(dataset, missingKey);
  const fullDatasetCustomerTypes = classifyCustomersByOrderHistory(dataset.rows);
  const fullDatasetRepeatCustomerIds = new Set(
    [...fullDatasetCustomerTypes]
      .filter(([, customerType]) => customerType === "repeat")
      .map(([customerId]) => customerId),
  );
  const runtimeToken = Object.freeze({});
  const cache = new Map<string, CachedContext>();

  const touch = (key: string, entry: CachedContext): void => {
    cache.delete(key);
    cache.set(key, entry);
  };

  const trim = (): void => {
    while (cache.size > MAX_CACHED_ANALYSIS_CONTEXTS) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) {
        return;
      }
      cache.delete(oldest);
    }
  };

  const entryForContext = (context: AnalysisContext): CachedContext => {
    if (context[runtimeTokenBrand] !== runtimeToken) {
      throw new TypeError("Analysis context belongs to a different dataset runtime.");
    }
    const cached = cache.get(context.cacheKey);
    if (cached?.context === context) {
      touch(context.cacheKey, cached);
      return cached;
    }
    const restored = Object.freeze({ context, derived: emptyDerivedState() });
    touch(context.cacheKey, restored);
    trim();
    return restored;
  };

  const resolve = (filter: FilterContextInput): AnalyticsResult<AnalysisContext> => {
    const normalized = createFilterContextWithIndex(filter, dataset, missingKey, filterIndex);
    if (normalized.status === "error") {
      return normalized;
    }
    const key = canonicalAnalysisFilterKey(normalized.value);
    const cached = cache.get(key);
    if (cached) {
      touch(key, cached);
      return { status: "ok", value: cached.context, warnings: normalized.warnings };
    }

    const rows = filterRows(dataset, normalized.value, missingKey, fullDatasetCustomerTypes);
    const context: AnalysisContext = Object.freeze({
      cacheKey: key,
      filterContext: normalized.value,
      rows,
      aggregate: aggregateContextRows(rows, fullDatasetRepeatCustomerIds),
      evidenceSupport: prepareEvidenceRowSupport(rows),
      [runtimeTokenBrand]: runtimeToken,
    });
    touch(key, Object.freeze({ context, derived: emptyDerivedState() }));
    trim();
    return { status: "ok", value: context, warnings: normalized.warnings };
  };

  const grouping = (
    context: AnalysisContext,
    dimension: GroupingDimension,
  ): readonly PreparedSegmentAggregate[] => {
    const entry = entryForContext(context);
    const cached = entry.derived.groupings.get(dimension);
    if (cached) {
      return cached;
    }

    const requestedDimensions =
      dimension === "customer"
        ? (["customer"] as const)
        : BREAKDOWN_DIMENSIONS.filter((candidate) => !entry.derived.groupings.has(candidate));
    const prepared = prepareGroupings(context.rows, requestedDimensions, missingKey);
    for (const [preparedDimension, aggregates] of prepared) {
      entry.derived.groupings.set(preparedDimension, aggregates);
    }
    return entry.derived.groupings.get(dimension) ?? Object.freeze([]);
  };

  const dateIndex = (context: AnalysisContext): PreparedDateIndex => {
    const entry = entryForContext(context);
    if (entry.derived.dateIndex === null) {
      entry.derived.dateIndex = prepareDateIndex(context.rows);
    }
    return entry.derived.dateIndex;
  };

  return Object.freeze({
    dataset,
    configuration: immutableConfiguration,
    maxCachedContexts: MAX_CACHED_ANALYSIS_CONTEXTS,
    cachedContextCount: () => cache.size,
    resolve,
    grouping,
    dateIndex,
  });
}
