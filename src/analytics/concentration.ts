import {
  aggregateRows,
  groupRows,
  type GroupingDimension,
  type SegmentAggregate,
} from "./aggregation.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import { buildEvidenceReference } from "./evidence.ts";
import { codePointCompare, filterDataset, type FilterContextInput } from "./filters.ts";
import { addMoneyCents, basisPoints, moneyCents, rateMetricValue } from "./money.ts";
import type {
  AnalyticsConfiguration,
  AnalyticsResult,
  BasisPoints,
  CanonicalOrderLine,
  EvidenceReference,
  FilterContext,
  MoneyCents,
  NonComputableResult,
  NonComputableValue,
  RateMetricValue,
  ResultContext,
  ValidatedDataset,
} from "./types.ts";

export type ConcentrationDimension = "product" | "category" | "region" | "channel" | "customer";

export type ConcentrationQuery = {
  readonly dimension: ConcentrationDimension;
  readonly filter: FilterContextInput;
};

export type ConcentrationSupport = {
  readonly rowCount: number;
  readonly orderCount: number;
  readonly customerCount: number;
  readonly segmentCount: number;
  readonly totalRevenue: MoneyCents;
};

export type ConcentrationSegment = {
  readonly rank: number;
  readonly key: string;
  readonly label: string;
  readonly revenue: MoneyCents;
  readonly revenueShare: RateMetricValue;
  readonly rowCount: number;
  readonly orderCount: number;
  readonly customerCount: number;
  readonly evidence: EvidenceReference;
};

export type TopRevenueShare = {
  readonly requestedSegmentCount: 1 | 3 | 5;
  readonly includedSegmentCount: number;
  readonly segmentKeys: readonly string[];
  readonly revenue: MoneyCents;
  readonly share: RateMetricValue;
  readonly evidence: EvidenceReference;
};

export type ExactHerfindahlHirschmanIndex = {
  readonly numerator: string;
  readonly denominator: string;
  readonly basisPoints: BasisPoints;
  readonly segmentCount: number;
  readonly evidence: EvidenceReference;
};

export type ComputableConcentrationResult = ResultContext & {
  readonly resultType: "concentration";
  readonly status: "ok";
  readonly dimension: ConcentrationDimension;
  readonly support: ConcentrationSupport;
  readonly segments: readonly ConcentrationSegment[];
  readonly topOne: TopRevenueShare;
  readonly topThree: TopRevenueShare | NonComputableValue;
  readonly topFive: TopRevenueShare | NonComputableValue;
  readonly hhi: ExactHerfindahlHirschmanIndex;
};

export type ConcentrationResult = ComputableConcentrationResult | NonComputableResult;

function metricMoney(cents: MoneyCents) {
  return Object.freeze({ kind: "money" as const, cents });
}

function assumptions(): readonly string[] {
  return Object.freeze([
    "Concentration is descriptive exposure and is not assigned a universal risk label.",
    "Revenue shares use net revenue after explicit line discounts in the active filter context.",
    "HHI is the sum of squared segment revenue shares and retains an exact rational representation.",
  ]);
}

function resultContext(
  dataset: ValidatedDataset,
  context: FilterContext,
  rows: readonly CanonicalOrderLine[],
  operationId: string,
  dimension: ConcentrationDimension,
  configuration: AnalyticsConfiguration,
): ResultContext {
  return Object.freeze({
    engineVersion: configuration.engineVersion,
    currentPeriod: context.period,
    comparisonPeriod: null,
    filterContext: context,
    assumptions: assumptions(),
    dataQuality: dataset.dataQuality,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId,
        rows,
        filterContext: context,
        affectedDateBuckets: [context.period],
        segmentKeys: [dimension],
        metricDependencies: ["total_revenue"],
      },
      configuration,
    ),
  });
}

function nonComputableConcentration(
  dataset: ValidatedDataset,
  context: FilterContext,
  rows: readonly CanonicalOrderLine[],
  dimension: ConcentrationDimension,
  reason: NonComputableResult["reason"],
  message: string,
  configuration: AnalyticsConfiguration,
): NonComputableResult {
  return Object.freeze({
    ...resultContext(
      dataset,
      context,
      rows,
      `concentration:${dimension}:${reason}`,
      dimension,
      configuration,
    ),
    resultType: "non_computable",
    operation: "diagnostic",
    status: reason === "insufficient_history" ? "insufficient_data" : "not_applicable",
    reason,
    message,
    metricId: null,
    label: `Revenue concentration by ${dimension}`,
    value: null,
    unit: "ratio",
    currency: dataset.metadata.currency,
    precision: { kind: "basis_points" as const, decimalPlaces: 2 },
  });
}

function insufficientSegments(required: number, actual: number): NonComputableValue {
  return Object.freeze({
    kind: "non_computable_value",
    status: "not_applicable",
    reason: "insufficient_segments",
    message: `Top-${required} share requires at least ${required} segments; ${actual} are available.`,
  });
}

function sortedAggregates(
  rows: readonly CanonicalOrderLine[],
  dimension: ConcentrationDimension,
  missingKey: string,
): readonly SegmentAggregate[] {
  const groupingDimension: GroupingDimension = dimension;
  return Object.freeze(
    [...groupRows(rows, groupingDimension, missingKey)].sort((left, right) => {
      if (left.revenue !== right.revenue) {
        return left.revenue > right.revenue ? -1 : 1;
      }
      return codePointCompare(left.key, right.key);
    }),
  );
}

function segmentResult(
  aggregate: SegmentAggregate,
  rank: number,
  totalRevenue: MoneyCents,
  dataset: ValidatedDataset,
  context: FilterContext,
  dimension: ConcentrationDimension,
  configuration: AnalyticsConfiguration,
): ConcentrationSegment {
  return Object.freeze({
    rank,
    key: aggregate.key,
    label: aggregate.label,
    revenue: aggregate.revenue,
    revenueShare: rateMetricValue(aggregate.revenue, totalRevenue),
    rowCount: aggregate.rows.length,
    orderCount: aggregate.orders,
    customerCount: aggregate.customers,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: `concentration:${dimension}:segment:${aggregate.key}`,
        rows: aggregate.rows,
        filterContext: context,
        affectedDateBuckets: [context.period],
        segmentKeys: [aggregate.key],
        numerator: { metricId: "total_revenue", value: metricMoney(aggregate.revenue) },
        denominator: { metricId: "total_revenue", value: metricMoney(totalRevenue) },
        metricDependencies: ["total_revenue"],
      },
      configuration,
    ),
  });
}

function topShare(
  count: 1 | 3 | 5,
  aggregates: readonly SegmentAggregate[],
  totalRevenue: MoneyCents,
  dataset: ValidatedDataset,
  context: FilterContext,
  dimension: ConcentrationDimension,
  configuration: AnalyticsConfiguration,
): TopRevenueShare | NonComputableValue {
  if (aggregates.length < count) {
    return insufficientSegments(count, aggregates.length);
  }

  const included = aggregates.slice(0, count);
  let revenue = moneyCents(0);
  for (const aggregate of included) {
    revenue = addMoneyCents(revenue, aggregate.revenue);
  }
  const segmentKeys = Object.freeze(included.map((aggregate) => aggregate.key));
  const rows = Object.freeze(included.flatMap((aggregate) => aggregate.rows));
  return Object.freeze({
    requestedSegmentCount: count,
    includedSegmentCount: included.length,
    segmentKeys,
    revenue,
    share: rateMetricValue(revenue, totalRevenue),
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: `concentration:${dimension}:top-${count}`,
        rows,
        filterContext: context,
        affectedDateBuckets: [context.period],
        segmentKeys,
        numerator: { metricId: "total_revenue", value: metricMoney(revenue) },
        denominator: { metricId: "total_revenue", value: metricMoney(totalRevenue) },
        metricDependencies: ["total_revenue"],
      },
      configuration,
    ),
  });
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right < BigInt(0) ? -right : right;
  while (b !== BigInt(0)) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function roundPositiveRatioToBasisPoints(numerator: bigint, denominator: bigint): BasisPoints {
  const scale = BigInt(10_000);
  const scaled = numerator * scale;
  let quotient = scaled / denominator;
  const remainder = scaled % denominator;
  if (remainder * BigInt(2) >= denominator) {
    quotient += BigInt(1);
  }
  const numeric = Number(quotient);
  if (!Number.isSafeInteger(numeric)) {
    throw new RangeError("HHI basis-point serialization exceeds the safe-integer range.");
  }
  return basisPoints(numeric);
}

function hhiResult(
  aggregates: readonly SegmentAggregate[],
  totalRevenue: MoneyCents,
  dataset: ValidatedDataset,
  context: FilterContext,
  dimension: ConcentrationDimension,
  configuration: AnalyticsConfiguration,
): ExactHerfindahlHirschmanIndex {
  let numerator = BigInt(0);
  for (const aggregate of aggregates) {
    const revenue = BigInt(aggregate.revenue);
    numerator += revenue * revenue;
  }
  const total = BigInt(totalRevenue);
  const denominator = total * total;
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  return Object.freeze({
    numerator: reducedNumerator.toString(),
    denominator: reducedDenominator.toString(),
    basisPoints: roundPositiveRatioToBasisPoints(numerator, denominator),
    segmentCount: aggregates.length,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: `concentration:${dimension}:hhi`,
        rows: aggregates.flatMap((aggregate) => aggregate.rows),
        filterContext: context,
        affectedDateBuckets: [context.period],
        segmentKeys: aggregates.map((aggregate) => aggregate.key),
        numerator: { metricId: "total_revenue", value: metricMoney(totalRevenue) },
        denominator: { metricId: "total_revenue", value: metricMoney(totalRevenue) },
        metricDependencies: ["total_revenue"],
      },
      configuration,
    ),
  });
}

export function calculateConcentration(
  dataset: ValidatedDataset,
  query: ConcentrationQuery,
  configuration: AnalyticsConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): AnalyticsResult<ConcentrationResult> {
  const filtered = filterDataset(dataset, query.filter, configuration.missingDimensionKey);
  if (filtered.status === "error") {
    return filtered;
  }

  const totals = aggregateRows(filtered.value.rows);
  if (totals.revenue === 0) {
    return {
      status: "ok",
      value: nonComputableConcentration(
        dataset,
        filtered.value.filterContext,
        filtered.value.rows,
        query.dimension,
        "zero_denominator",
        "Revenue concentration is undefined because filtered revenue is zero.",
        configuration,
      ),
      warnings: [],
    };
  }

  const aggregates = sortedAggregates(
    filtered.value.rows,
    query.dimension,
    configuration.missingDimensionKey,
  );
  if (aggregates.length === 0) {
    return {
      status: "ok",
      value: nonComputableConcentration(
        dataset,
        filtered.value.filterContext,
        filtered.value.rows,
        query.dimension,
        "insufficient_segments",
        "Revenue concentration requires at least one segment.",
        configuration,
      ),
      warnings: [],
    };
  }

  const context = filtered.value.filterContext;
  const segments = Object.freeze(
    aggregates.map((aggregate, index) =>
      segmentResult(
        aggregate,
        index + 1,
        totals.revenue,
        dataset,
        context,
        query.dimension,
        configuration,
      ),
    ),
  );
  const topOne = topShare(
    1,
    aggregates,
    totals.revenue,
    dataset,
    context,
    query.dimension,
    configuration,
  );
  if ("kind" in topOne) {
    throw new Error("A non-empty concentration result must have a top-one segment.");
  }

  const result: ComputableConcentrationResult = Object.freeze({
    ...resultContext(
      dataset,
      context,
      filtered.value.rows,
      `concentration:${query.dimension}`,
      query.dimension,
      configuration,
    ),
    resultType: "concentration",
    status: "ok",
    dimension: query.dimension,
    support: Object.freeze({
      rowCount: totals.rows.length,
      orderCount: totals.orders,
      customerCount: totals.customers,
      segmentCount: aggregates.length,
      totalRevenue: totals.revenue,
    }),
    segments,
    topOne,
    topThree: topShare(
      3,
      aggregates,
      totals.revenue,
      dataset,
      context,
      query.dimension,
      configuration,
    ),
    topFive: topShare(
      5,
      aggregates,
      totals.revenue,
      dataset,
      context,
      query.dimension,
      configuration,
    ),
    hhi: hhiResult(aggregates, totals.revenue, dataset, context, query.dimension, configuration),
  });
  return { status: "ok", value: result, warnings: [] };
}
