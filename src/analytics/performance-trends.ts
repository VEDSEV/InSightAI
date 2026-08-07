import { createAnalysisRuntime, type AnalysisRuntime } from "./analysis-context.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import { enumerateDates, startOfIsoWeek } from "./dates.ts";
import { buildEvidenceReference } from "./evidence.ts";
import { codePointCompare, type FilterContextInput } from "./filters.ts";
import { addMoneyCents, moneyCents, subtractMoneyCents } from "./money.ts";
import type {
  AnalyticsConfiguration,
  AnalyticsResult,
  FilterContext,
  MoneyCents,
  NonComputableResult,
  ResultContext,
  ValidatedDataset,
} from "./types.ts";

export type PerformanceTrendFrequency = "daily" | "weekly" | "monthly";

export type PerformanceTrendBucket = {
  readonly key: string;
  readonly revenue: MoneyCents;
  readonly grossProfit: MoneyCents;
  readonly rowCount: number;
  readonly orderCount: number;
};

export type PerformanceTrendQuery = {
  readonly filter: FilterContextInput;
  readonly frequency?: PerformanceTrendFrequency;
};

export type PerformanceTrendResult = ResultContext & {
  readonly resultType: "performance_trend";
  readonly status: "ok";
  readonly frequency: PerformanceTrendFrequency;
  readonly series: readonly PerformanceTrendBucket[];
};

type MutableBucket = {
  revenue: MoneyCents;
  grossProfit: MoneyCents;
  rowCount: number;
  orderIds: Set<string>;
};

function bucketKey(date: string, frequency: PerformanceTrendFrequency): string {
  switch (frequency) {
    case "daily":
      return date;
    case "weekly":
      return startOfIsoWeek(date as Parameters<typeof startOfIsoWeek>[0]);
    case "monthly":
      return date.slice(0, 7);
  }
}

function emptyBucket(): MutableBucket {
  return { revenue: moneyCents(0), grossProfit: moneyCents(0), rowCount: 0, orderIds: new Set() };
}

function nonComputable(
  dataset: ValidatedDataset,
  filterContext: FilterContext,
  configuration: AnalyticsConfiguration,
): NonComputableResult {
  return Object.freeze({
    resultType: "non_computable",
    operation: "diagnostic",
    status: "not_applicable",
    reason: "empty_dataset",
    message: "No order lines match the selected filters, so a performance trend is unavailable.",
    metricId: "total_revenue",
    label: "Business performance trend",
    value: null,
    unit: "currency",
    currency: dataset.metadata.currency,
    precision: Object.freeze({ kind: "minor_unit", decimalPlaces: 2 }),
    engineVersion: configuration.engineVersion,
    currentPeriod: filterContext.period,
    comparisonPeriod: null,
    filterContext,
    assumptions: Object.freeze([
      "Trend buckets include zero-revenue dates inside the selected period.",
    ]),
    dataQuality: dataset.dataQuality,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: "performance-trend:empty",
        rows: [],
        filterContext,
        affectedDateBuckets: [filterContext.period],
        metricDependencies: ["total_revenue", "gross_profit"],
      },
      configuration,
    ),
  });
}

export function analyzePerformanceTrendWithRuntime(
  runtime: AnalysisRuntime,
  query: PerformanceTrendQuery,
): AnalyticsResult<PerformanceTrendResult | NonComputableResult> {
  const resolved = runtime.resolve(query.filter);
  if (resolved.status === "error") {
    return resolved;
  }

  const { dataset, configuration } = runtime;
  const context = resolved.value;
  if (context.rows.length === 0) {
    return {
      status: "ok",
      value: nonComputable(dataset, context.filterContext, configuration),
      warnings: [],
    };
  }

  const frequency = query.frequency ?? "monthly";
  const buckets = new Map<string, MutableBucket>();
  for (const date of enumerateDates(context.filterContext.period)) {
    buckets.set(bucketKey(date, frequency), emptyBucket());
  }
  for (const row of context.rows) {
    const key = bucketKey(row.orderDate, frequency);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.revenue = addMoneyCents(bucket.revenue, row.revenueCents);
    bucket.grossProfit = addMoneyCents(
      bucket.grossProfit,
      subtractMoneyCents(row.revenueCents, row.costCents),
    );
    bucket.rowCount += 1;
    bucket.orderIds.add(row.orderId);
  }

  const series = Object.freeze(
    [...buckets.entries()]
      .sort(([left], [right]) => codePointCompare(left, right))
      .map(([key, bucket]) =>
        Object.freeze({
          key,
          revenue: bucket.revenue,
          grossProfit: bucket.grossProfit,
          rowCount: bucket.rowCount,
          orderCount: bucket.orderIds.size,
        }),
      ),
  );

  return {
    status: "ok",
    value: Object.freeze({
      resultType: "performance_trend",
      status: "ok",
      frequency,
      series,
      engineVersion: configuration.engineVersion,
      currentPeriod: context.filterContext.period,
      comparisonPeriod: null,
      filterContext: context.filterContext,
      assumptions: Object.freeze([
        "Trend buckets include zero-revenue dates inside the selected period.",
        "Revenue and gross profit are summed at canonical order-line grain.",
      ]),
      dataQuality: dataset.dataQuality,
      evidence: buildEvidenceReference(
        {
          datasetVersion: dataset.metadata.datasetVersion,
          engineVersion: configuration.engineVersion,
          operationId: `performance-trend:${frequency}`,
          rows: context.rows,
          filterContext: context.filterContext,
          affectedDateBuckets: [context.filterContext.period],
          metricDependencies: ["total_revenue", "gross_profit"],
          rowSupport: context.evidenceSupport,
        },
        configuration,
      ),
    }),
    warnings: [],
  };
}

/** Returns an immutable, evidence-bearing revenue and gross-profit series for a validated dataset. */
export function analyzePerformanceTrend(
  dataset: ValidatedDataset,
  query: PerformanceTrendQuery,
  configuration: AnalyticsConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): AnalyticsResult<PerformanceTrendResult | NonComputableResult> {
  return analyzePerformanceTrendWithRuntime(createAnalysisRuntime(dataset, configuration), query);
}
