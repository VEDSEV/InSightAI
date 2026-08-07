import {
  createAnalysisRuntime,
  type AnalysisContext,
  type AnalysisRuntime,
} from "./analysis-context.ts";
import {
  aggregateRows,
  compareCodePoints,
  type PreparedSegmentAggregate,
  type RowAggregate,
} from "./aggregation.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import { intervalContains, resolveComparisonPeriod } from "./dates.ts";
import {
  buildEvidenceReference,
  prepareEvidenceRowSupport,
  type EvidenceRowSupport,
} from "./evidence.ts";
import type { FilterContextInput } from "./filters.ts";
import { moneyCents, rateMetricValue, subtractMoneyCents } from "./money.ts";
import type {
  AnalyticsConfiguration,
  AnalyticsResult,
  BreakdownComparison,
  BreakdownDimension,
  BreakdownEntry,
  BreakdownResult,
  CanonicalOrderLine,
  ComparisonDefinition,
  ComputableBreakdownResult,
  FilterContext,
  MetricValue,
  NonComputableResult,
  NonComputableValue,
  ValidatedDataset,
} from "./types.ts";

export type BreakdownSortMeasure =
  "revenue" | "cost" | "gross_profit" | "orders" | "quantity" | "customers";

export type BreakdownQuery = {
  readonly dimension: BreakdownDimension;
  readonly filter: FilterContextInput;
  readonly comparison?: ComparisonDefinition | null;
  readonly sortBy?: BreakdownSortMeasure;
  readonly sortDirection?: "ascending" | "descending";
};

function nonComputableValue(
  reason: NonComputableValue["reason"],
  message: string,
  status: NonComputableValue["status"] = "not_applicable",
): NonComputableValue {
  return Object.freeze({ kind: "non_computable_value", status, reason, message });
}

function ratioOrNonComputable(numerator: number, denominator: number, message: string) {
  return denominator === 0
    ? nonComputableValue("zero_denominator", message)
    : rateMetricValue(numerator, denominator);
}

function resultContext(
  dataset: ValidatedDataset,
  context: FilterContext,
  comparisonPeriod: FilterContext["period"] | null,
  rows: readonly CanonicalOrderLine[],
  operationId: string,
  configuration: AnalyticsConfiguration,
  evidenceSupport: EvidenceRowSupport,
) {
  return {
    engineVersion: configuration.engineVersion,
    currentPeriod: context.period,
    comparisonPeriod,
    filterContext: context,
    assumptions: Object.freeze([
      "Order and customer counts are distinct within each segment and are not additive across segments.",
      "Missing optional dimensions use the configured explicit missing-value key.",
    ]),
    dataQuality: dataset.dataQuality,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId,
        rows,
        filterContext: context,
        affectedDateBuckets: [context.period],
        rowSupport: evidenceSupport,
      },
      configuration,
    ),
  } as const;
}

function nonComputableBreakdown(
  dataset: ValidatedDataset,
  context: FilterContext,
  rows: readonly CanonicalOrderLine[],
  reason: NonComputableResult["reason"],
  message: string,
  configuration: AnalyticsConfiguration,
  evidenceSupport: EvidenceRowSupport,
): NonComputableResult {
  return Object.freeze({
    ...resultContext(
      dataset,
      context,
      null,
      rows,
      `breakdown:${reason}`,
      configuration,
      evidenceSupport,
    ),
    resultType: "non_computable",
    operation: "breakdown",
    status: reason === "insufficient_history" ? "insufficient_data" : "not_applicable",
    reason,
    message,
    metricId: null,
    label: "Breakdown",
    value: null,
    unit: null,
    currency: dataset.metadata.currency,
    precision: null,
  });
}

function comparisonFor(currentRevenue: number, previousRevenue: number): BreakdownComparison {
  const absoluteRevenueChange = subtractMoneyCents(
    moneyCents(currentRevenue),
    moneyCents(previousRevenue),
  );
  return Object.freeze({
    previousRevenue: moneyCents(previousRevenue),
    absoluteRevenueChange,
    percentageRevenueChange:
      previousRevenue === 0
        ? currentRevenue === 0
          ? rateMetricValue(0, 1)
          : nonComputableValue(
              "zero_denominator",
              "Percentage revenue change is undefined because prior revenue is zero.",
            )
        : rateMetricValue(absoluteRevenueChange, Math.abs(previousRevenue)),
  });
}

function metricValueForEvidence(cents: number): MetricValue {
  return Object.freeze({ kind: "money", cents: moneyCents(cents) });
}

function entryFor(
  aggregate: PreparedSegmentAggregate,
  totals: Pick<RowAggregate, "revenue" | "grossProfit">,
  previous: PreparedSegmentAggregate | undefined,
  dataset: ValidatedDataset,
  context: FilterContext,
  dimension: BreakdownDimension,
  configuration: AnalyticsConfiguration,
): BreakdownEntry {
  const evidenceRows = previous
    ? Object.freeze([...aggregate.rows, ...previous.rows])
    : aggregate.rows;
  const evidenceSupport = previous
    ? prepareEvidenceRowSupport(evidenceRows)
    : aggregate.evidenceSupport;
  const numerator = metricValueForEvidence(aggregate.revenue);
  const denominator = metricValueForEvidence(totals.revenue);
  return Object.freeze({
    key: aggregate.key,
    label: aggregate.label,
    revenue: aggregate.revenue,
    cost: aggregate.cost,
    grossProfit: aggregate.grossProfit,
    grossMargin: ratioOrNonComputable(
      aggregate.grossProfit,
      aggregate.revenue,
      "Gross margin is undefined for a zero-revenue segment.",
    ),
    orders: aggregate.orders,
    quantity: aggregate.quantity,
    customers: aggregate.customers,
    revenueShare: ratioOrNonComputable(
      aggregate.revenue,
      totals.revenue,
      "Revenue share is undefined because filtered revenue is zero.",
    ),
    profitShare: ratioOrNonComputable(
      aggregate.grossProfit,
      totals.grossProfit,
      "Profit share is undefined because filtered gross profit is zero.",
    ),
    comparison: previous ? comparisonFor(aggregate.revenue, previous.revenue) : null,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: `breakdown:${dimension}:${aggregate.key}`,
        rows: evidenceRows,
        filterContext: context,
        affectedDateBuckets: [context.period],
        segmentKeys: [aggregate.key],
        numerator: { metricId: "total_revenue", value: numerator },
        denominator: { metricId: "total_revenue", value: denominator },
        metricDependencies: ["total_revenue", "total_cost", "gross_profit"],
        rowSupport: evidenceSupport,
      },
      configuration,
    ),
  });
}

function sortValue(entry: BreakdownEntry, measure: BreakdownSortMeasure): number {
  switch (measure) {
    case "revenue":
      return entry.revenue;
    case "cost":
      return entry.cost;
    case "gross_profit":
      return entry.grossProfit;
    case "orders":
      return entry.orders;
    case "quantity":
      return entry.quantity;
    case "customers":
      return entry.customers;
  }
}

function emptyPreparedAggregate(key: string, label: string): PreparedSegmentAggregate {
  const rows = Object.freeze([]) as readonly CanonicalOrderLine[];
  return Object.freeze({
    ...aggregateRows(rows),
    key,
    label,
    evidenceSupport: prepareEvidenceRowSupport(rows),
  });
}

export function calculateBreakdownWithRuntime(
  runtime: AnalysisRuntime,
  query: BreakdownQuery,
): AnalyticsResult<BreakdownResult> {
  const { dataset, configuration } = runtime;
  const current = runtime.resolve(query.filter);
  if (current.status === "error") {
    return current;
  }

  let previousRows: readonly CanonicalOrderLine[] | null = null;
  let previousContext: AnalysisContext | null = null;
  let comparisonPeriod: FilterContext["period"] | null = null;
  if (query.comparison) {
    const resolution = resolveComparisonPeriod(
      current.value.filterContext.period,
      query.comparison,
    );
    if (resolution.status !== "ok") {
      return {
        status: "ok",
        value: nonComputableBreakdown(
          dataset,
          current.value.filterContext,
          current.value.rows,
          "invalid_filter",
          resolution.message,
          configuration,
          current.value.evidenceSupport,
        ),
        warnings: [],
      };
    }
    if (!intervalContains(dataset.metadata.dateRange, resolution.comparisonPeriod)) {
      return {
        status: "ok",
        value: nonComputableBreakdown(
          dataset,
          current.value.filterContext,
          current.value.rows,
          "insufficient_history",
          "The validated dataset does not cover the complete comparison period.",
          configuration,
          current.value.evidenceSupport,
        ),
        warnings: [],
      };
    }
    comparisonPeriod = resolution.comparisonPeriod;
    const previous = runtime.resolve({ ...query.filter, period: resolution.comparisonPeriod });
    if (previous.status === "error") {
      return previous;
    }
    previousContext = previous.value;
    previousRows = previousContext.rows;
  }

  const totals = current.value.aggregate;
  const currentGroups = runtime.grouping(current.value, query.dimension);
  const previousGroups = previousContext ? runtime.grouping(previousContext, query.dimension) : [];
  const previousByKey = new Map(previousGroups.map((entry) => [entry.key, entry]));

  const entries = currentGroups.map((aggregate) => {
    const previousAggregate = previousRows
      ? (previousByKey.get(aggregate.key) ?? emptyPreparedAggregate(aggregate.key, aggregate.label))
      : undefined;
    return entryFor(
      aggregate,
      totals,
      previousAggregate,
      dataset,
      current.value.filterContext,
      query.dimension,
      configuration,
    );
  });
  if (previousRows) {
    const currentKeys = new Set(currentGroups.map((entry) => entry.key));
    for (const previous of previousGroups) {
      if (!currentKeys.has(previous.key)) {
        const emptyAggregate = emptyPreparedAggregate(previous.key, previous.label);
        entries.push(
          entryFor(
            emptyAggregate,
            totals,
            previous,
            dataset,
            current.value.filterContext,
            query.dimension,
            configuration,
          ),
        );
      }
    }
  }

  const measure = query.sortBy ?? "revenue";
  const direction = query.sortDirection ?? "descending";
  entries.sort((left, right) => {
    const leftValue = sortValue(left, measure);
    const rightValue = sortValue(right, measure);
    if (leftValue !== rightValue) {
      const ascending = leftValue < rightValue ? -1 : 1;
      return direction === "descending" ? -ascending : ascending;
    }
    return compareCodePoints(left.key, right.key);
  });

  const result: ComputableBreakdownResult = Object.freeze({
    ...resultContext(
      dataset,
      current.value.filterContext,
      comparisonPeriod,
      current.value.rows,
      `breakdown:${query.dimension}`,
      configuration,
      current.value.evidenceSupport,
    ),
    resultType: "breakdown",
    status: "ok",
    dimension: query.dimension,
    entries: Object.freeze(entries),
  });
  return { status: "ok", value: result, warnings: [] };
}

export function calculateBreakdown(
  dataset: ValidatedDataset,
  query: BreakdownQuery,
  configuration: AnalyticsConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): AnalyticsResult<BreakdownResult> {
  return calculateBreakdownWithRuntime(createAnalysisRuntime(dataset, configuration), query);
}
