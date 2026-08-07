import {
  createAnalysisRuntime,
  type AnalysisRuntime,
  type PreparedDateIndex,
} from "./analysis-context.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import { dateInterval, endOfIsoWeek, enumerateDates, startOfIsoWeek } from "./dates.ts";
import { createAnalyticsError } from "./errors.ts";
import { buildEvidenceReference, type EvidenceRowSupport } from "./evidence.ts";
import type { FilterContextInput } from "./filters.ts";
import { addMoneyCents, moneyCents } from "./money.ts";
import type {
  AnalyticsConfiguration,
  AnalyticsResult,
  AnomalyConfiguration,
  AnomalyFrequency,
  CanonicalOrderLine,
  DateInterval,
  EvidenceReference,
  FilterContext,
  MoneyCents,
  NonComputableResult,
  ResultContext,
  ValidatedDataset,
} from "./types.ts";

export type AnomalyConfigurationOverride = Partial<AnomalyConfiguration>;

export type AnomalyQuery = {
  readonly filter: FilterContextInput;
  readonly configuration?: AnomalyConfigurationOverride;
};

export type ExactRationalValue = {
  readonly numerator: string;
  readonly denominator: string;
};

export type AnomalyRevenueBucket = {
  readonly period: DateInterval;
  readonly revenue: MoneyCents;
  readonly rowCount: number;
  readonly complete: boolean;
};

export type AnomalyBaseline = {
  readonly method: "trailing_mad" | "trailing_mad_with_weekday_guard";
  readonly bucketCount: number;
  readonly periods: readonly DateInterval[];
  readonly medianRevenueCents: ExactRationalValue;
  readonly medianAbsoluteDeviationCents: ExactRationalValue;
  readonly weekdayGuard: {
    readonly bucketCount: number;
    readonly periods: readonly DateInterval[];
    readonly medianRevenueCents: ExactRationalValue;
  } | null;
};

export type RevenueAnomalyFinding = {
  readonly findingId: string;
  readonly kind: "revenue_anomaly";
  readonly direction: "spike" | "drop";
  readonly frequency: AnomalyFrequency;
  readonly bucket: AnomalyRevenueBucket;
  readonly baseline: AnomalyBaseline;
  readonly absoluteDeviationCents: ExactRationalValue;
  readonly robustZ: ExactRationalValue | null;
  readonly zeroMadFallback: boolean;
  readonly description: string;
  readonly evidence: EvidenceReference;
};

export type ComputableAnomalyResult = ResultContext & {
  readonly resultType: "anomaly";
  readonly status: "ok";
  readonly frequency: AnomalyFrequency;
  readonly configuration: AnomalyConfiguration;
  readonly bucketCount: number;
  readonly evaluatedBucketCount: number;
  readonly findings: readonly RevenueAnomalyFinding[];
};

export type AnomalyResult = ComputableAnomalyResult | NonComputableResult;

type Fraction = {
  readonly numerator: bigint;
  readonly denominator: bigint;
};

type InternalBucket = AnomalyRevenueBucket & {
  readonly rows: readonly CanonicalOrderLine[];
};

type BaselineSelection = {
  readonly method: AnomalyBaseline["method"];
  readonly buckets: readonly InternalBucket[];
  readonly weekdayGuardBuckets: readonly InternalBucket[];
};

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const ONE_THOUSAND = BigInt(1_000);
const TEN_THOUSAND = BigInt(10_000);
const ROBUST_Z_NUMERATOR = BigInt(6_745);

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < ZERO ? -left : left;
  let b = right < ZERO ? -right : right;
  while (b !== ZERO) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function fraction(numerator: bigint, denominator: bigint = ONE): Fraction {
  if (denominator === ZERO) {
    throw new RangeError("Fraction denominator must not be zero.");
  }
  if (numerator === ZERO) {
    return { numerator: ZERO, denominator: ONE };
  }
  const sign = denominator < ZERO ? -ONE : ONE;
  const signedNumerator = numerator * sign;
  const positiveDenominator = denominator * sign;
  const divisor = greatestCommonDivisor(signedNumerator, positiveDenominator);
  return {
    numerator: signedNumerator / divisor,
    denominator: positiveDenominator / divisor,
  };
}

function centsFraction(value: MoneyCents): Fraction {
  return fraction(BigInt(value));
}

function subtractFractions(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function addFractions(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function absoluteFraction(value: Fraction): Fraction {
  return value.numerator < ZERO
    ? { numerator: -value.numerator, denominator: value.denominator }
    : value;
}

function compareFractions(left: Fraction, right: Fraction): -1 | 0 | 1 {
  const leftScaled = left.numerator * right.denominator;
  const rightScaled = right.numerator * left.denominator;
  if (leftScaled < rightScaled) {
    return -1;
  }
  if (leftScaled > rightScaled) {
    return 1;
  }
  return 0;
}

function averageFractions(left: Fraction, right: Fraction): Fraction {
  const sum = addFractions(left, right);
  return fraction(sum.numerator, sum.denominator * TWO);
}

function median(values: readonly Fraction[]): Fraction {
  if (values.length === 0) {
    throw new RangeError("Median requires at least one observation.");
  }
  const sorted = [...values].sort(compareFractions);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    const value = sorted[middle];
    if (!value) {
      throw new Error("Median index is unexpectedly absent.");
    }
    return value;
  }
  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (!left || !right) {
    throw new Error("Median indices are unexpectedly absent.");
  }
  return averageFractions(left, right);
}

function publicFraction(value: Fraction): ExactRationalValue {
  return Object.freeze({
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
  });
}

function weekday(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getUTCDay();
}

function validateConfiguration(
  configuration: AnomalyConfiguration,
): AnalyticsResult<AnomalyConfiguration> {
  const invalid =
    (configuration.frequency !== "daily" && configuration.frequency !== "weekly") ||
    !Number.isSafeInteger(configuration.minimumSeriesBuckets) ||
    configuration.minimumSeriesBuckets < 1 ||
    !Number.isSafeInteger(configuration.minimumBaselineBuckets) ||
    configuration.minimumBaselineBuckets < 1 ||
    !Number.isSafeInteger(configuration.maximumBaselineBuckets) ||
    configuration.maximumBaselineBuckets < configuration.minimumBaselineBuckets ||
    !Number.isSafeInteger(configuration.robustZThresholdMilli) ||
    configuration.robustZThresholdMilli <= 0 ||
    !Number.isSafeInteger(configuration.relativeMaterialityBasisPoints) ||
    configuration.relativeMaterialityBasisPoints < 0 ||
    !Number.isSafeInteger(configuration.absoluteMaterialityFloorCents) ||
    configuration.absoluteMaterialityFloorCents < 0;

  if (invalid) {
    return {
      status: "error",
      errors: [
        createAnalyticsError({
          code: "invalid_filter",
          stage: "calculation",
          message:
            "Anomaly configuration requires valid frequency, positive history windows and threshold, and non-negative materiality values.",
          field: "anomaly.configuration",
        }),
      ],
    };
  }
  return { status: "ok", value: Object.freeze({ ...configuration }), warnings: [] };
}

function revenueForRows(rows: readonly CanonicalOrderLine[]): MoneyCents {
  let revenue = moneyCents(0);
  for (const row of rows) {
    revenue = addMoneyCents(revenue, row.revenueCents);
  }
  return revenue;
}

function dailyBuckets(
  dateIndex: PreparedDateIndex,
  context: FilterContext,
): readonly InternalBucket[] {
  return Object.freeze(
    enumerateDates(context.period).map((date) => {
      const prepared = dateIndex.get(date);
      const bucketRows = prepared?.rows ?? Object.freeze([]);
      return Object.freeze({
        period: dateInterval(date, date),
        revenue: prepared?.revenue ?? moneyCents(0),
        rowCount: bucketRows.length,
        complete: true,
        rows: bucketRows,
      });
    }),
  );
}

function weeklyBuckets(
  dateIndex: PreparedDateIndex,
  context: FilterContext,
  includePartialWeeks: boolean,
): readonly InternalBucket[] {
  const rowsByWeek = new Map<string, CanonicalOrderLine[]>();
  for (const day of dateIndex.buckets) {
    const weekStart = startOfIsoWeek(day.date);
    const existing = rowsByWeek.get(weekStart);
    if (existing) {
      existing.push(...day.rows);
    } else {
      rowsByWeek.set(weekStart, [...day.rows]);
    }
  }

  const weekStarts = new Set(enumerateDates(context.period).map(startOfIsoWeek));
  const buckets: InternalBucket[] = [];
  for (const weekStart of [...weekStarts].sort()) {
    const weekEnd = endOfIsoWeek(weekStart);
    const complete = weekStart >= context.period.start && weekEnd <= context.period.end;
    if (!complete && !includePartialWeeks) {
      continue;
    }
    const start = weekStart < context.period.start ? context.period.start : weekStart;
    const end = weekEnd > context.period.end ? context.period.end : weekEnd;
    const bucketRows = Object.freeze([...(rowsByWeek.get(weekStart) ?? [])]);
    buckets.push(
      Object.freeze({
        period: dateInterval(start, end),
        revenue: revenueForRows(bucketRows),
        rowCount: bucketRows.length,
        complete,
        rows: bucketRows,
      }),
    );
  }
  return Object.freeze(buckets);
}

function selectBaseline(
  buckets: readonly InternalBucket[],
  index: number,
  configuration: AnomalyConfiguration,
): BaselineSelection | null {
  const candidate = buckets[index];
  if (!candidate) {
    return null;
  }
  const prior = buckets
    .slice(0, index)
    .filter((bucket) => configuration.frequency !== "weekly" || bucket.complete);
  const trailing = prior.slice(-configuration.maximumBaselineBuckets);
  if (trailing.length < configuration.minimumBaselineBuckets) {
    return null;
  }
  if (configuration.frequency === "daily") {
    const candidateWeekday = weekday(candidate.period.start);
    const matching = prior
      .filter((bucket) => weekday(bucket.period.start) === candidateWeekday)
      .slice(-configuration.maximumBaselineBuckets);
    if (matching.length >= configuration.minimumBaselineBuckets) {
      return {
        method: "trailing_mad_with_weekday_guard",
        buckets: trailing,
        weekdayGuardBuckets: matching,
      };
    }
  }
  return { method: "trailing_mad", buckets: trailing, weekdayGuardBuckets: [] };
}

function materialityPasses(
  currentRevenue: MoneyCents,
  baselineMedian: Fraction,
  configuration: AnomalyConfiguration,
): boolean {
  const deviation = absoluteFraction(
    subtractFractions(centsFraction(currentRevenue), baselineMedian),
  );
  const medianMagnitude = absoluteFraction(baselineMedian);
  const floor = centsFraction(configuration.absoluteMaterialityFloorCents);
  const materialityBase = compareFractions(medianMagnitude, floor) >= 0 ? medianMagnitude : floor;
  return (
    deviation.numerator * materialityBase.denominator * TEN_THOUSAND >=
    materialityBase.numerator *
      deviation.denominator *
      BigInt(configuration.relativeMaterialityBasisPoints)
  );
}

function thresholdPasses(
  currentRevenue: MoneyCents,
  medianRevenue: Fraction,
  madRevenue: Fraction,
  weekdayGuardMedian: Fraction | null,
  configuration: AnomalyConfiguration,
): {
  readonly candidate: boolean;
  readonly deviation: Fraction;
  readonly robustZ: Fraction | null;
} {
  const deviation = absoluteFraction(
    subtractFractions(centsFraction(currentRevenue), medianRevenue),
  );
  const passesPrimaryMateriality = materialityPasses(currentRevenue, medianRevenue, configuration);
  const passesWeekdayGuard =
    weekdayGuardMedian === null ||
    materialityPasses(currentRevenue, weekdayGuardMedian, configuration);

  if (!passesPrimaryMateriality || !passesWeekdayGuard || deviation.numerator === ZERO) {
    return { candidate: false, deviation, robustZ: null };
  }
  if (madRevenue.numerator === ZERO) {
    return { candidate: true, deviation, robustZ: null };
  }

  const robustPasses =
    ROBUST_Z_NUMERATOR * deviation.numerator * madRevenue.denominator * ONE_THOUSAND >=
    BigInt(configuration.robustZThresholdMilli) *
      madRevenue.numerator *
      deviation.denominator *
      TEN_THOUSAND;
  const signedDifference = subtractFractions(centsFraction(currentRevenue), medianRevenue);
  const robustZ = fraction(
    ROBUST_Z_NUMERATOR * signedDifference.numerator * madRevenue.denominator,
    TEN_THOUSAND * signedDifference.denominator * madRevenue.numerator,
  );
  return { candidate: robustPasses, deviation, robustZ };
}

function contextFor(
  dataset: ValidatedDataset,
  context: FilterContext,
  rows: readonly CanonicalOrderLine[],
  frequency: AnomalyFrequency,
  configuration: AnalyticsConfiguration,
  evidenceSupport: EvidenceRowSupport,
) {
  return Object.freeze({
    engineVersion: configuration.engineVersion,
    currentPeriod: context.period,
    comparisonPeriod: null,
    filterContext: context,
    assumptions: Object.freeze([
      "Anomalies are descriptive values unusual versus a robust recent revenue baseline; they are not forecasts or causal claims.",
      frequency === "daily"
        ? "Daily mode uses an immediate trailing MAD baseline plus a matching-weekday materiality guard when sufficient weekday history exists."
        : "Weekly mode uses prior selected complete weeks; partial edge weeks follow the explicit configuration.",
      "Missing buckets are filled with zero only inside the selected validated dataset coverage.",
    ]),
    dataQuality: dataset.dataQuality,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: `anomaly:${frequency}`,
        rows,
        filterContext: context,
        affectedDateBuckets: [context.period],
        metricDependencies: ["total_revenue"],
        rowSupport: evidenceSupport,
      },
      configuration,
    ),
  } as const);
}

function insufficientHistory(
  dataset: ValidatedDataset,
  context: FilterContext,
  rows: readonly CanonicalOrderLine[],
  frequency: AnomalyFrequency,
  message: string,
  configuration: AnalyticsConfiguration,
  evidenceSupport: EvidenceRowSupport,
): NonComputableResult {
  return Object.freeze({
    ...contextFor(dataset, context, rows, frequency, configuration, evidenceSupport),
    resultType: "non_computable",
    operation: "diagnostic",
    status: "insufficient_data",
    reason: "insufficient_history",
    message,
    metricId: null,
    label: `${frequency === "daily" ? "Daily" : "Weekly"} revenue anomalies`,
    value: null,
    unit: "currency",
    currency: dataset.metadata.currency,
    precision: { kind: "minor_unit" as const, decimalPlaces: 2 },
  });
}

function findingFor(
  bucket: InternalBucket,
  baseline: BaselineSelection,
  medianRevenue: Fraction,
  madRevenue: Fraction,
  deviation: Fraction,
  robustZ: Fraction | null,
  dataset: ValidatedDataset,
  context: FilterContext,
  configuration: AnalyticsConfiguration,
  anomalyConfiguration: AnomalyConfiguration,
): RevenueAnomalyFinding {
  const baselineRows = baseline.buckets.flatMap((entry) => entry.rows);
  const weekdayGuardRows = baseline.weekdayGuardBuckets.flatMap((entry) => entry.rows);
  const weekdayGuardValues = baseline.weekdayGuardBuckets.map((entry) =>
    centsFraction(entry.revenue),
  );
  const weekdayGuardMedian = weekdayGuardValues.length > 0 ? median(weekdayGuardValues) : null;
  const evidenceRows = Object.freeze([
    ...new Map(
      [...baselineRows, ...weekdayGuardRows, ...bucket.rows].map((row) => [row.orderLineId, row]),
    ).values(),
  ]);
  const evidence = buildEvidenceReference(
    {
      datasetVersion: dataset.metadata.datasetVersion,
      engineVersion: configuration.engineVersion,
      operationId: `anomaly:${anomalyConfiguration.frequency}:${bucket.period.start}`,
      rows: evidenceRows,
      filterContext: context,
      affectedDateBuckets: [
        ...baseline.buckets.map((entry) => entry.period),
        ...baseline.weekdayGuardBuckets.map((entry) => entry.period),
        bucket.period,
      ],
      numerator: {
        metricId: "total_revenue",
        value: { kind: "money", cents: bucket.revenue },
      },
      metricDependencies: ["total_revenue"],
    },
    configuration,
  );
  const direction =
    compareFractions(centsFraction(bucket.revenue), medianRevenue) > 0 ? "spike" : "drop";
  return Object.freeze({
    findingId: evidence.evidenceId,
    kind: "revenue_anomaly",
    direction,
    frequency: anomalyConfiguration.frequency,
    bucket: Object.freeze({
      period: bucket.period,
      revenue: bucket.revenue,
      rowCount: bucket.rowCount,
      complete: bucket.complete,
    }),
    baseline: Object.freeze({
      method: baseline.method,
      bucketCount: baseline.buckets.length,
      periods: Object.freeze(baseline.buckets.map((entry) => entry.period)),
      medianRevenueCents: publicFraction(medianRevenue),
      medianAbsoluteDeviationCents: publicFraction(madRevenue),
      weekdayGuard:
        weekdayGuardMedian === null
          ? null
          : Object.freeze({
              bucketCount: baseline.weekdayGuardBuckets.length,
              periods: Object.freeze(baseline.weekdayGuardBuckets.map((entry) => entry.period)),
              medianRevenueCents: publicFraction(weekdayGuardMedian),
            }),
    }),
    absoluteDeviationCents: publicFraction(deviation),
    robustZ: robustZ ? publicFraction(robustZ) : null,
    zeroMadFallback: madRevenue.numerator === ZERO,
    description: `${anomalyConfiguration.frequency === "daily" ? "Daily" : "Weekly"} revenue was unusually ${
      direction === "spike" ? "high" : "low"
    } versus its robust recent baseline.`,
    evidence,
  });
}

export function detectRevenueAnomaliesWithRuntime(
  runtime: AnalysisRuntime,
  query: AnomalyQuery,
): AnalyticsResult<AnomalyResult> {
  const { dataset, configuration } = runtime;
  const anomalyConfiguration = {
    ...configuration.anomaly,
    ...query.configuration,
  } as AnomalyConfiguration;
  const validatedConfiguration = validateConfiguration(anomalyConfiguration);
  if (validatedConfiguration.status === "error") {
    return validatedConfiguration;
  }

  const filtered = runtime.resolve(query.filter);
  if (filtered.status === "error") {
    return filtered;
  }
  const analysis = filtered.value;
  const context = analysis.filterContext;
  const dateIndex = runtime.dateIndex(analysis);
  const buckets =
    anomalyConfiguration.frequency === "daily"
      ? dailyBuckets(dateIndex, context)
      : weeklyBuckets(dateIndex, context, anomalyConfiguration.includePartialWeeks);

  if (buckets.length < anomalyConfiguration.minimumSeriesBuckets) {
    return {
      status: "ok",
      value: insufficientHistory(
        dataset,
        context,
        analysis.rows,
        anomalyConfiguration.frequency,
        `Anomaly analysis requires at least ${anomalyConfiguration.minimumSeriesBuckets} selected buckets; ${buckets.length} are available.`,
        configuration,
        analysis.evidenceSupport,
      ),
      warnings: [],
    };
  }

  const findings: RevenueAnomalyFinding[] = [];
  let evaluatedBucketCount = 0;
  for (let index = 0; index < buckets.length; index += 1) {
    const current = buckets[index];
    const baseline = selectBaseline(buckets, index, anomalyConfiguration);
    if (!current || !baseline) {
      continue;
    }
    evaluatedBucketCount += 1;
    const baselineValues = baseline.buckets.map((bucket) => centsFraction(bucket.revenue));
    const medianRevenue = median(baselineValues);
    const deviations = baselineValues.map((value) =>
      absoluteFraction(subtractFractions(value, medianRevenue)),
    );
    const madRevenue = median(deviations);
    const weekdayGuardValues = baseline.weekdayGuardBuckets.map((bucket) =>
      centsFraction(bucket.revenue),
    );
    const weekdayGuardMedian = weekdayGuardValues.length > 0 ? median(weekdayGuardValues) : null;
    const decision = thresholdPasses(
      current.revenue,
      medianRevenue,
      madRevenue,
      weekdayGuardMedian,
      anomalyConfiguration,
    );
    if (decision.candidate) {
      findings.push(
        findingFor(
          current,
          baseline,
          medianRevenue,
          madRevenue,
          decision.deviation,
          decision.robustZ,
          dataset,
          context,
          configuration,
          anomalyConfiguration,
        ),
      );
    }
  }

  if (evaluatedBucketCount === 0) {
    return {
      status: "ok",
      value: insufficientHistory(
        dataset,
        context,
        analysis.rows,
        anomalyConfiguration.frequency,
        `No bucket has the configured minimum of ${anomalyConfiguration.minimumBaselineBuckets} prior baseline observations.`,
        configuration,
        analysis.evidenceSupport,
      ),
      warnings: [],
    };
  }

  const result: ComputableAnomalyResult = Object.freeze({
    ...contextFor(
      dataset,
      context,
      analysis.rows,
      anomalyConfiguration.frequency,
      configuration,
      analysis.evidenceSupport,
    ),
    resultType: "anomaly",
    status: "ok",
    frequency: anomalyConfiguration.frequency,
    configuration: validatedConfiguration.value,
    bucketCount: buckets.length,
    evaluatedBucketCount,
    findings: Object.freeze(findings),
  });
  return { status: "ok", value: result, warnings: [] };
}

export function detectRevenueAnomalies(
  dataset: ValidatedDataset,
  query: AnomalyQuery,
  configuration: AnalyticsConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): AnalyticsResult<AnomalyResult> {
  return detectRevenueAnomaliesWithRuntime(createAnalysisRuntime(dataset, configuration), query);
}
