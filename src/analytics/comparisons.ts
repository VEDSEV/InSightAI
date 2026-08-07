import { createAnalysisRuntime, type AnalysisRuntime } from "./analysis-context.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import { intervalContains, resolveComparisonPeriod } from "./dates.ts";
import { buildEvidenceReference, prepareEvidenceRowSupport } from "./evidence.ts";
import type { FilterContextInput } from "./filters.ts";
import { computeMetricWithRuntime } from "./metrics.ts";
import { moneyCents, rateMetricValue, rational, subtractMoneyCents } from "./money.ts";
import type {
  AnalyticsConfiguration,
  AnalyticsResult,
  ComparisonDefinition,
  ComputableMetricResult,
  MetricId,
  MetricResult,
  MetricValue,
  NonComputableReason,
  NonComputableResult,
  NonComputableValue,
  Rational,
  ValidatedDataset,
} from "./types.ts";

export type MetricComparisonQuery = {
  readonly metricId: MetricId;
  readonly filter: FilterContextInput;
  readonly comparison: ComparisonDefinition;
};

function greatestCommonDivisorBigInt(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right < BigInt(0) ? -right : right;
  while (b !== BigInt(0)) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function safeRationalFromBigInt(numerator: bigint, denominator: bigint): Rational {
  if (denominator === BigInt(0)) {
    throw new RangeError("Comparison rational denominator must not be zero.");
  }
  const sign = denominator < BigInt(0) ? BigInt(-1) : BigInt(1);
  const signedNumerator = numerator * sign;
  const positiveDenominator = denominator * sign;
  const divisor = greatestCommonDivisorBigInt(signedNumerator, positiveDenominator);
  const reducedNumerator = signedNumerator / divisor;
  const reducedDenominator = positiveDenominator / divisor;
  const numeratorNumber = Number(reducedNumerator);
  const denominatorNumber = Number(reducedDenominator);
  if (!Number.isSafeInteger(numeratorNumber) || !Number.isSafeInteger(denominatorNumber)) {
    throw new RangeError("Reduced comparison ratio exceeds the safe-integer result contract.");
  }
  return rational(numeratorNumber, denominatorNumber);
}

function asRational(value: MetricValue): Rational {
  switch (value.kind) {
    case "money":
      return rational(value.cents, 1);
    case "count":
    case "quantity":
      return rational(value.value, 1);
    case "rational_money":
      return rational(value.numeratorCents, value.denominator);
    case "rate":
      return value.ratio;
  }
}

function subtractRationals(left: Rational, right: Rational): Rational {
  return safeRationalFromBigInt(
    BigInt(left.numerator) * BigInt(right.denominator) -
      BigInt(right.numerator) * BigInt(left.denominator),
    BigInt(left.denominator) * BigInt(right.denominator),
  );
}

function absoluteChange(current: MetricValue, previous: MetricValue): MetricValue {
  if (current.kind === "money" && previous.kind === "money") {
    return Object.freeze({
      kind: "money",
      cents: subtractMoneyCents(current.cents, previous.cents),
    });
  }
  if (current.kind === "count" && previous.kind === "count") {
    return Object.freeze({ kind: "count", value: current.value - previous.value });
  }
  if (current.kind === "quantity" && previous.kind === "quantity") {
    return Object.freeze({ kind: "quantity", value: current.value - previous.value });
  }

  const difference = subtractRationals(asRational(current), asRational(previous));
  if (current.kind === "rational_money" && previous.kind === "rational_money") {
    return Object.freeze({
      kind: "rational_money",
      numeratorCents: moneyCents(difference.numerator),
      denominator: difference.denominator,
    });
  }
  return rateMetricValue(difference.numerator, difference.denominator);
}

function nonComputableChange(reason: NonComputableReason, message: string): NonComputableValue {
  return Object.freeze({
    kind: "non_computable_value",
    status: reason === "insufficient_history" ? "insufficient_data" : "not_applicable",
    reason,
    message,
  });
}

function percentageChange(
  current: MetricValue,
  previous: MetricValue,
): ComputableMetricResult["percentageChange"] {
  const currentRatio = asRational(current);
  const previousRatio = asRational(previous);
  if (previousRatio.numerator === 0) {
    return currentRatio.numerator === 0
      ? rateMetricValue(0, 1)
      : nonComputableChange(
          "zero_denominator",
          "Percentage change is undefined because the prior value is zero.",
        );
  }
  const difference = subtractRationals(currentRatio, previousRatio);
  const growth = safeRationalFromBigInt(
    BigInt(difference.numerator) * BigInt(previousRatio.denominator),
    BigInt(difference.denominator) * BigInt(Math.abs(previousRatio.numerator)),
  );
  return rateMetricValue(growth.numerator, growth.denominator);
}

function comparisonFailure(
  current: MetricResult,
  reason: NonComputableReason,
  message: string,
  dataset: ValidatedDataset,
  configuration: AnalyticsConfiguration,
): NonComputableResult {
  return Object.freeze({
    resultType: "non_computable",
    operation: "metric",
    status: reason === "insufficient_history" ? "insufficient_data" : "not_applicable",
    reason,
    message,
    metricId: current.metricId,
    label: current.label,
    value: null,
    unit: current.unit,
    currency: current.currency,
    precision: current.precision,
    engineVersion: configuration.engineVersion,
    currentPeriod: current.currentPeriod,
    comparisonPeriod: null,
    filterContext: current.filterContext,
    assumptions: current.assumptions,
    dataQuality: dataset.dataQuality,
    evidence: current.evidence,
  });
}

export function compareMetricWithRuntime(
  runtime: AnalysisRuntime,
  query: MetricComparisonQuery,
): AnalyticsResult<MetricResult> {
  const { dataset, configuration } = runtime;
  const currentContext = runtime.resolve(query.filter);
  if (currentContext.status === "error") {
    return currentContext;
  }
  const normalized = currentContext.value.filterContext;
  const current = computeMetricWithRuntime(runtime, normalized, query.metricId);
  const resolution = resolveComparisonPeriod(normalized.period, query.comparison);
  if (resolution.status !== "ok") {
    return {
      status: "ok",
      value: comparisonFailure(
        current,
        "invalid_filter",
        resolution.message,
        dataset,
        configuration,
      ),
      warnings: [],
    };
  }
  if (!intervalContains(dataset.metadata.dateRange, resolution.comparisonPeriod)) {
    return {
      status: "ok",
      value: comparisonFailure(
        current,
        "insufficient_history",
        "The validated dataset does not cover the complete comparison period.",
        dataset,
        configuration,
      ),
      warnings: [],
    };
  }

  const previousContext = runtime.resolve({ ...query.filter, period: resolution.comparisonPeriod });
  if (previousContext.status === "error") {
    return previousContext;
  }
  const previous = computeMetricWithRuntime(
    runtime,
    previousContext.value.filterContext,
    query.metricId,
  );

  if (current.status !== "ok") {
    return { status: "ok", value: current, warnings: [] };
  }
  if (previous.status !== "ok") {
    return {
      status: "ok",
      value: comparisonFailure(
        current,
        previous.reason,
        `Prior-period ${previous.label.toLowerCase()} is not computable: ${previous.message}`,
        dataset,
        configuration,
      ),
      warnings: [],
    };
  }

  const combinedRows = Object.freeze([...currentContext.value.rows, ...previousContext.value.rows]);
  const combinedSupport = prepareEvidenceRowSupport(combinedRows);
  const absolute = absoluteChange(current.value, previous.value);
  const percentage = percentageChange(current.value, previous.value);

  return {
    status: "ok",
    value: Object.freeze({
      ...current,
      comparisonPeriod: resolution.comparisonPeriod,
      assumptions: Object.freeze([
        ...current.assumptions,
        "The same non-date filters are applied to the current and comparison periods.",
        ...(current.value.kind === "rate"
          ? ["Absolute change for a rate is an exact percentage-point change ratio."]
          : []),
      ]),
      evidence: buildEvidenceReference(
        {
          datasetVersion: dataset.metadata.datasetVersion,
          engineVersion: configuration.engineVersion,
          operationId: `comparison:${query.metricId}:${query.comparison.kind}`,
          rows: combinedRows,
          filterContext: normalized,
          affectedDateBuckets: [normalized.period, resolution.comparisonPeriod],
          metricDependencies: [query.metricId],
          rowSupport: combinedSupport,
        },
        configuration,
      ),
      previousValue: previous.value,
      absoluteChange: absolute,
      percentageChange: percentage,
    }),
    warnings: [],
  };
}

export function compareMetric(
  dataset: ValidatedDataset,
  query: MetricComparisonQuery,
  configuration: AnalyticsConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): AnalyticsResult<MetricResult> {
  return compareMetricWithRuntime(createAnalysisRuntime(dataset, configuration), query);
}
