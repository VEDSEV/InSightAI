import { aggregateRows, compareCodePoints, groupRows } from "./aggregation.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import {
  enumerateDates,
  intervalContains,
  resolveComparisonPeriod,
  startOfIsoWeek,
} from "./dates.ts";
import { buildEvidenceReference } from "./evidence.ts";
import { filterDataset, type FilterContextInput } from "./filters.ts";
import { addMoneyCents, moneyCents, rateMetricValue, subtractMoneyCents } from "./money.ts";
import type {
  AnalyticsConfiguration,
  AnalyticsResult,
  BreakdownDimension,
  ComparisonDefinition,
  EvidenceReference,
  FilterContext,
  MoneyCents,
  NonComputableResult,
  NonComputableValue,
  RateMetricValue,
  ResultContext,
  ValidatedDataset,
} from "./types.ts";

export type TrendFrequency = "daily" | "weekly" | "monthly";

export type RevenueBucket = {
  readonly key: string;
  readonly revenue: MoneyCents;
  readonly rowCount: number;
  readonly orderCount: number;
};

export type RevenueContribution = {
  readonly key: string;
  readonly label: string;
  readonly currentRevenue: MoneyCents;
  readonly previousRevenue: MoneyCents;
  readonly absoluteChange: MoneyCents;
  readonly contributionToTotalChange: RateMetricValue | NonComputableValue;
  readonly evidence: EvidenceReference;
};

export type ConsecutiveDeclineSummary = {
  readonly longestRun: number;
  readonly latestRun: number;
  readonly longestRunBucketKeys: readonly string[];
  readonly latestRunBucketKeys: readonly string[];
};

export type TrendContributionResult = ResultContext & {
  readonly resultType: "trend_contribution";
  readonly status: "ok";
  readonly dimension: BreakdownDimension;
  readonly frequency: TrendFrequency;
  readonly currentRevenue: MoneyCents;
  readonly previousRevenue: MoneyCents;
  readonly absoluteChange: MoneyCents;
  readonly percentageChange: RateMetricValue | NonComputableValue;
  readonly contributions: readonly RevenueContribution[];
  readonly largestPositiveContributors: readonly RevenueContribution[];
  readonly largestNegativeContributors: readonly RevenueContribution[];
  readonly series: readonly RevenueBucket[];
  readonly consecutiveDecline: ConsecutiveDeclineSummary;
};

export type TrendContributionQuery = {
  readonly filter: FilterContextInput;
  readonly comparison: ComparisonDefinition;
  readonly dimension: BreakdownDimension;
  readonly frequency?: TrendFrequency;
  readonly contributorLimit?: number;
};

function nonComputableValue(
  reason: NonComputableValue["reason"],
  message: string,
): NonComputableValue {
  return Object.freeze({ kind: "non_computable_value", status: "not_applicable", reason, message });
}

function bucketKey(date: string, frequency: TrendFrequency): string {
  switch (frequency) {
    case "daily":
      return date;
    case "weekly":
      return startOfIsoWeek(date as Parameters<typeof startOfIsoWeek>[0]);
    case "monthly":
      return date.slice(0, 7);
  }
}

function revenueSeries(
  rows: readonly ValidatedDataset["rows"][number][],
  period: FilterContext["period"],
  frequency: TrendFrequency,
): readonly RevenueBucket[] {
  const state = new Map<string, { revenue: MoneyCents; rowCount: number; orderIds: Set<string> }>();
  for (const date of enumerateDates(period)) {
    const key = bucketKey(date, frequency);
    if (!state.has(key)) {
      state.set(key, { revenue: moneyCents(0), rowCount: 0, orderIds: new Set() });
    }
  }
  for (const row of rows) {
    const key = bucketKey(row.orderDate, frequency);
    const bucket = state.get(key);
    if (!bucket) {
      continue;
    }
    bucket.revenue = addMoneyCents(bucket.revenue, row.revenueCents);
    bucket.rowCount += 1;
    bucket.orderIds.add(row.orderId);
  }
  return Object.freeze(
    [...state]
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([key, value]) =>
        Object.freeze({
          key,
          revenue: value.revenue,
          rowCount: value.rowCount,
          orderCount: value.orderIds.size,
        }),
      ),
  );
}

function declineSummary(series: readonly RevenueBucket[]): ConsecutiveDeclineSummary {
  let currentRun = 0;
  let currentKeys: string[] = [];
  let longestRun = 0;
  let longestKeys: string[] = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (!previous || !current) {
      continue;
    }
    if (current.revenue < previous.revenue) {
      currentRun += 1;
      currentKeys = currentRun === 1 ? [previous.key, current.key] : [...currentKeys, current.key];
      if (currentRun > longestRun) {
        longestRun = currentRun;
        longestKeys = [...currentKeys];
      }
    } else {
      currentRun = 0;
      currentKeys = [];
    }
  }
  return Object.freeze({
    longestRun,
    latestRun: currentRun,
    longestRunBucketKeys: Object.freeze(longestKeys),
    latestRunBucketKeys: Object.freeze(currentKeys),
  });
}

function failure(
  dataset: ValidatedDataset,
  context: FilterContext,
  reason: NonComputableResult["reason"],
  message: string,
  configuration: AnalyticsConfiguration,
): NonComputableResult {
  return Object.freeze({
    resultType: "non_computable",
    operation: "diagnostic",
    status: reason === "insufficient_history" ? "insufficient_data" : "not_applicable",
    reason,
    message,
    metricId: "total_revenue",
    label: "Revenue trend and contribution",
    value: null,
    unit: "currency",
    currency: dataset.metadata.currency,
    precision: Object.freeze({ kind: "minor_unit", decimalPlaces: 2 }),
    engineVersion: configuration.engineVersion,
    currentPeriod: context.period,
    comparisonPeriod: null,
    filterContext: context,
    assumptions: Object.freeze(["No causal interpretation is attached to descriptive changes."]),
    dataQuality: dataset.dataQuality,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: `trend:${reason}`,
        rows: [],
        filterContext: context,
        affectedDateBuckets: [context.period],
        metricDependencies: ["total_revenue"],
      },
      configuration,
    ),
  });
}

export function analyzeTrendContributions(
  dataset: ValidatedDataset,
  query: TrendContributionQuery,
  configuration: AnalyticsConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): AnalyticsResult<TrendContributionResult | NonComputableResult> {
  const current = filterDataset(dataset, query.filter, configuration.missingDimensionKey);
  if (current.status === "error") {
    return current;
  }
  const resolution = resolveComparisonPeriod(current.value.filterContext.period, query.comparison);
  if (resolution.status !== "ok") {
    return {
      status: "ok",
      value: failure(
        dataset,
        current.value.filterContext,
        "invalid_filter",
        resolution.message,
        configuration,
      ),
      warnings: [],
    };
  }
  if (!intervalContains(dataset.metadata.dateRange, resolution.comparisonPeriod)) {
    return {
      status: "ok",
      value: failure(
        dataset,
        current.value.filterContext,
        "insufficient_history",
        "The dataset does not cover the complete comparison period.",
        configuration,
      ),
      warnings: [],
    };
  }
  const previous = filterDataset(
    dataset,
    { ...query.filter, period: resolution.comparisonPeriod },
    configuration.missingDimensionKey,
  );
  if (previous.status === "error") {
    return previous;
  }

  const currentTotal = aggregateRows(current.value.rows);
  const previousTotal = aggregateRows(previous.value.rows);
  const totalChange = subtractMoneyCents(currentTotal.revenue, previousTotal.revenue);
  const currentGroups = new Map(
    groupRows(current.value.rows, query.dimension, configuration.missingDimensionKey).map(
      (entry) => [entry.key, entry],
    ),
  );
  const previousGroups = new Map(
    groupRows(previous.value.rows, query.dimension, configuration.missingDimensionKey).map(
      (entry) => [entry.key, entry],
    ),
  );
  const keys = [...new Set([...currentGroups.keys(), ...previousGroups.keys()])].sort(
    compareCodePoints,
  );
  const contributions = keys.map((key): RevenueContribution => {
    const currentGroup = currentGroups.get(key);
    const previousGroup = previousGroups.get(key);
    const currentRevenue = currentGroup?.revenue ?? moneyCents(0);
    const previousRevenue = previousGroup?.revenue ?? moneyCents(0);
    const change = subtractMoneyCents(currentRevenue, previousRevenue);
    const evidenceRows = Object.freeze([
      ...(currentGroup?.rows ?? []),
      ...(previousGroup?.rows ?? []),
    ]);
    return Object.freeze({
      key,
      label: currentGroup?.label ?? previousGroup?.label ?? key,
      currentRevenue,
      previousRevenue,
      absoluteChange: change,
      contributionToTotalChange:
        totalChange === 0
          ? nonComputableValue(
              "zero_denominator",
              "Contribution share is undefined because total revenue change is zero.",
            )
          : rateMetricValue(change, totalChange),
      evidence: buildEvidenceReference(
        {
          datasetVersion: dataset.metadata.datasetVersion,
          engineVersion: configuration.engineVersion,
          operationId: `trend:contribution:${query.dimension}:${key}`,
          ruleVersion: "revenue-contribution-v1",
          rows: evidenceRows,
          filterContext: current.value.filterContext,
          affectedDateBuckets: [current.value.filterContext.period, resolution.comparisonPeriod],
          segmentKeys: [key],
          metricDependencies: ["total_revenue"],
        },
        configuration,
      ),
    });
  });
  contributions.sort((left, right) => {
    if (left.absoluteChange === right.absoluteChange) {
      return compareCodePoints(left.key, right.key);
    }
    return left.absoluteChange > right.absoluteChange ? -1 : 1;
  });

  const limit = query.contributorLimit ?? 5;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    return {
      status: "ok",
      value: failure(
        dataset,
        current.value.filterContext,
        "invalid_filter",
        "Contributor limit must be a positive safe integer.",
        configuration,
      ),
      warnings: [],
    };
  }
  const frequency = query.frequency ?? "monthly";
  const series = revenueSeries(current.value.rows, current.value.filterContext.period, frequency);
  const combinedRows = Object.freeze([...current.value.rows, ...previous.value.rows]);
  const percentageChange =
    previousTotal.revenue === 0
      ? currentTotal.revenue === 0
        ? rateMetricValue(0, 1)
        : nonComputableValue(
            "zero_denominator",
            "Percentage revenue change is undefined because prior revenue is zero.",
          )
      : rateMetricValue(totalChange, Math.abs(previousTotal.revenue));

  const result: TrendContributionResult = Object.freeze({
    resultType: "trend_contribution",
    status: "ok",
    engineVersion: configuration.engineVersion,
    currentPeriod: current.value.filterContext.period,
    comparisonPeriod: resolution.comparisonPeriod,
    filterContext: current.value.filterContext,
    assumptions: Object.freeze([
      "The same non-date filters are applied to both periods.",
      "Contribution is an arithmetic decomposition of revenue change and does not imply causation.",
      "Missing dates inside the selected interval are represented as zero-revenue buckets.",
    ]),
    dataQuality: dataset.dataQuality,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: `trend:${query.dimension}:${query.comparison.kind}`,
        ruleVersion: "revenue-trend-v1",
        rows: combinedRows,
        filterContext: current.value.filterContext,
        affectedDateBuckets: [current.value.filterContext.period, resolution.comparisonPeriod],
        segmentKeys: keys,
        metricDependencies: ["total_revenue"],
      },
      configuration,
    ),
    dimension: query.dimension,
    frequency,
    currentRevenue: currentTotal.revenue,
    previousRevenue: previousTotal.revenue,
    absoluteChange: totalChange,
    percentageChange,
    contributions: Object.freeze(contributions),
    largestPositiveContributors: Object.freeze(
      contributions.filter((entry) => entry.absoluteChange > 0).slice(0, limit),
    ),
    largestNegativeContributors: Object.freeze(
      contributions
        .filter((entry) => entry.absoluteChange < 0)
        .sort((left, right) =>
          left.absoluteChange === right.absoluteChange
            ? compareCodePoints(left.key, right.key)
            : left.absoluteChange < right.absoluteChange
              ? -1
              : 1,
        )
        .slice(0, limit),
    ),
    series,
    consecutiveDecline: declineSummary(series),
  });
  return { status: "ok", value: result, warnings: [] };
}
