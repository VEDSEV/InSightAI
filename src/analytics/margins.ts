import {
  aggregateRows,
  compareCodePoints,
  groupRows,
  type SegmentAggregate,
} from "./aggregation.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import { buildEvidenceReference } from "./evidence.ts";
import { filterDataset, type FilterContextInput } from "./filters.ts";
import { compareRationals, rateMetricValue, rational } from "./money.ts";
import type {
  AnalyticsConfiguration,
  AnalyticsResult,
  DateInterval,
  EvidenceReference,
  MoneyCents,
  NonComputableValue,
  RateMetricValue,
  Rational,
  ResultContext,
  ValidatedDataset,
} from "./types.ts";

export type PromotionWindow = DateInterval & {
  readonly productIds?: readonly string[];
  readonly label?: string;
};

export type ProductMarginDistributionEntry = {
  readonly productId: string;
  readonly productName: string;
  readonly revenue: MoneyCents;
  readonly cost: MoneyCents;
  readonly grossProfit: MoneyCents;
  readonly grossMargin: RateMetricValue | NonComputableValue;
  readonly orderCount: number;
  readonly rowCount: number;
  readonly negativeMarginRowCount: number;
  readonly evidence: EvidenceReference;
};

export type PromotionalLossCase = {
  readonly productId: string;
  readonly productName: string;
  readonly classification: "candidate" | "confirmed_by_configured_window";
  readonly negativeRowCount: number;
  readonly discountedNegativeRowCount: number;
  readonly qualifyingDateRange: DateInterval;
  readonly promotionWindowLabels: readonly string[];
  readonly evidence: EvidenceReference;
};

export type MarginDiagnosticsSummary = {
  readonly negativeMarginRowCount: number;
  readonly productsWithAnyNegativeMarginRowCount: number;
  readonly aggregateNegativeMarginProductCount: number;
  readonly zeroRevenuePositiveCostProductCount: number;
  readonly highRevenueLowMarginProductCount: number;
  readonly promotionalLossCaseCount: number;
};

export type MarginDiagnosticsResult = ResultContext & {
  readonly resultType: "margin_diagnostics";
  readonly status: "ok";
  readonly summary: MarginDiagnosticsSummary;
  readonly productMargins: readonly ProductMarginDistributionEntry[];
  readonly aggregateNegativeProducts: readonly ProductMarginDistributionEntry[];
  readonly productsWithAnyNegativeRows: readonly ProductMarginDistributionEntry[];
  readonly zeroRevenuePositiveCostProducts: readonly ProductMarginDistributionEntry[];
  readonly highRevenueLowMarginProducts:
    readonly ProductMarginDistributionEntry[] | NonComputableValue;
  readonly promotionalLossCases: readonly PromotionalLossCase[];
  readonly highRevenueThreshold: Rational | null;
  readonly lowMarginThreshold: RateMetricValue | null;
};

export type MarginDiagnosticsQuery = {
  readonly filter: FilterContextInput;
  readonly promotionWindows?: readonly PromotionWindow[];
};

function nonComputableValue(
  reason: NonComputableValue["reason"],
  message: string,
): NonComputableValue {
  return Object.freeze({
    kind: "non_computable_value",
    status: "insufficient_data",
    reason,
    message,
  });
}

function subtractRational(left: Rational, right: Rational): Rational {
  const numerator =
    BigInt(left.numerator) * BigInt(right.denominator) -
    BigInt(right.numerator) * BigInt(left.denominator);
  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  const numeratorNumber = Number(numerator);
  const denominatorNumber = Number(denominator);
  if (!Number.isSafeInteger(numeratorNumber) || !Number.isSafeInteger(denominatorNumber)) {
    throw new RangeError("Reduced margin threshold exceeds the safe-integer rational contract.");
  }
  return rational(numeratorNumber, denominatorNumber);
}

function inclusivePercentile(values: readonly number[], percentileBasisPoints: number): Rational {
  if (values.length === 0) {
    throw new RangeError("A percentile requires at least one value.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const denominator = 10_000;
  const positionNumerator = (sorted.length - 1) * percentileBasisPoints;
  const lowerIndex = Math.floor(positionNumerator / denominator);
  const remainder = positionNumerator % denominator;
  const upperIndex = Math.min(lowerIndex + 1, sorted.length - 1);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) {
    throw new RangeError("Percentile index is outside the value set.");
  }
  const numerator =
    BigInt(lower) * BigInt(denominator - remainder) + BigInt(upper) * BigInt(remainder);
  const divisor = BigInt(denominator);
  const numeratorNumber = Number(numerator);
  if (!Number.isSafeInteger(numeratorNumber)) {
    throw new RangeError("Percentile threshold exceeds the safe-integer rational contract.");
  }
  return rational(numeratorNumber, Number(divisor));
}

function aggregateRate(aggregate: SegmentAggregate): RateMetricValue | NonComputableValue {
  return aggregate.revenue === 0
    ? Object.freeze({
        kind: "non_computable_value",
        status: "not_applicable",
        reason: "zero_denominator",
        message: "Product gross margin is undefined because revenue is zero.",
      })
    : rateMetricValue(aggregate.grossProfit, aggregate.revenue);
}

function productEntry(
  aggregate: SegmentAggregate,
  dataset: ValidatedDataset,
  context: ResultContext["filterContext"],
  configuration: AnalyticsConfiguration,
): ProductMarginDistributionEntry {
  const negativeRows = aggregate.rows.filter((row) => row.revenueCents - row.costCents < 0);
  return Object.freeze({
    productId: aggregate.key,
    productName: aggregate.label,
    revenue: aggregate.revenue,
    cost: aggregate.cost,
    grossProfit: aggregate.grossProfit,
    grossMargin: aggregateRate(aggregate),
    orderCount: aggregate.orders,
    rowCount: aggregate.rows.length,
    negativeMarginRowCount: negativeRows.length,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: `margin:product:${aggregate.key}`,
        ruleVersion: "margin-rules-v1",
        rows: aggregate.rows,
        filterContext: context,
        affectedDateBuckets: [context.period],
        segmentKeys: [aggregate.key],
        metricDependencies: ["total_revenue", "total_cost", "gross_profit", "gross_margin"],
      },
      configuration,
    ),
  });
}

function rowDateRange(rows: readonly SegmentAggregate["rows"][number][]): DateInterval {
  const dates = rows.map((row) => row.orderDate).sort(compareCodePoints);
  const start = dates[0];
  const end = dates.at(-1);
  if (!start || !end) {
    throw new RangeError("A promotional-loss case requires at least one row.");
  }
  return Object.freeze({ start, end, boundary: "inclusive" });
}

function windowMatches(window: PromotionWindow, productId: string, date: string): boolean {
  return (
    date >= window.start &&
    date <= window.end &&
    (!window.productIds || window.productIds.length === 0 || window.productIds.includes(productId))
  );
}

export function analyzeMargins(
  dataset: ValidatedDataset,
  query: MarginDiagnosticsQuery,
  configuration: AnalyticsConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): AnalyticsResult<MarginDiagnosticsResult> {
  const filtered = filterDataset(dataset, query.filter, configuration.missingDimensionKey);
  if (filtered.status === "error") {
    return filtered;
  }
  const rows = filtered.value.rows;
  const context = filtered.value.filterContext;
  const aggregates = groupRows(rows, "product", configuration.missingDimensionKey);
  const byProduct = new Map(aggregates.map((aggregate) => [aggregate.key, aggregate]));
  const productMargins = aggregates
    .map((aggregate) => productEntry(aggregate, dataset, context, configuration))
    .sort((left, right) => {
      if (left.revenue === 0 || right.revenue === 0) {
        if (left.revenue === right.revenue) {
          return compareCodePoints(left.productId, right.productId);
        }
        return left.revenue === 0 ? -1 : 1;
      }
      const marginComparison = compareRationals(
        rational(left.grossProfit, left.revenue),
        rational(right.grossProfit, right.revenue),
      );
      return marginComparison === 0
        ? compareCodePoints(left.productId, right.productId)
        : marginComparison;
    });

  const negativeRows = rows.filter((row) => row.revenueCents - row.costCents < 0);
  const withAnyNegative = productMargins.filter((entry) => entry.negativeMarginRowCount > 0);
  const aggregateNegative = productMargins.filter(
    (entry) =>
      entry.grossProfit < 0 &&
      entry.revenue > 0 &&
      entry.orderCount >= configuration.marginRules.aggregateNegativeMinimumOrders,
  );
  const zeroRevenuePositiveCost = productMargins.filter(
    (entry) => entry.revenue === 0 && entry.cost > 0,
  );

  const eligible = productMargins.filter(
    (entry) =>
      entry.orderCount >= configuration.marginRules.highRevenueMinimumOrders && entry.revenue > 0,
  );
  let highRevenueThreshold: Rational | null = null;
  let lowMarginThreshold: RateMetricValue | null = null;
  let highRevenueLowMarginProducts: readonly ProductMarginDistributionEntry[] | NonComputableValue;
  const overall = aggregateRows(rows);
  if (
    eligible.length < configuration.marginRules.highRevenueMinimumEligibleProducts ||
    overall.revenue === 0
  ) {
    highRevenueLowMarginProducts = nonComputableValue(
      "insufficient_segments",
      "High-revenue/low-margin analysis requires enough eligible products and positive revenue.",
    );
  } else {
    highRevenueThreshold = inclusivePercentile(
      eligible.map((entry) => entry.revenue),
      configuration.marginRules.highRevenuePercentileBasisPoints,
    );
    const overallMargin = rational(overall.grossProfit, overall.revenue);
    const configuredMaximum = rational(
      configuration.marginRules.maximumLowMarginBasisPoints,
      10_000,
    );
    const marginGap = rational(configuration.marginRules.overallMarginGapBasisPoints, 10_000);
    const marginRelativeThreshold = subtractRational(overallMargin, marginGap);
    const selectedThreshold =
      compareRationals(configuredMaximum, marginRelativeThreshold) <= 0
        ? configuredMaximum
        : marginRelativeThreshold;
    lowMarginThreshold = rateMetricValue(
      selectedThreshold.numerator,
      selectedThreshold.denominator,
    );
    highRevenueLowMarginProducts = Object.freeze(
      eligible.filter((entry) => {
        const revenueQualifies =
          BigInt(entry.revenue) * BigInt(highRevenueThreshold!.denominator) >=
          BigInt(highRevenueThreshold!.numerator);
        const margin = rational(entry.grossProfit, entry.revenue);
        return revenueQualifies && compareRationals(margin, selectedThreshold) < 0;
      }),
    );
  }

  const promotionWindows = query.promotionWindows ?? [];
  const promotionalLossCases: PromotionalLossCase[] = [];
  for (const aggregate of aggregates) {
    if (aggregate.grossProfit <= 0) {
      continue;
    }
    const negative = aggregate.rows.filter((row) => row.revenueCents - row.costCents < 0);
    const positive = aggregate.rows.filter((row) => row.revenueCents - row.costCents > 0);
    const discountedNegative = negative.filter(
      (row) =>
        row.discountAmountCents > 0 &&
        row.revenueCents + row.discountAmountCents - row.costCents >= 0,
    );
    if (
      positive.length === 0 ||
      discountedNegative.length < configuration.marginRules.promotionalMinimumNegativeRows
    ) {
      continue;
    }
    const matchingWindows = promotionWindows.filter((window) =>
      discountedNegative.some((row) => windowMatches(window, aggregate.key, row.orderDate)),
    );
    promotionalLossCases.push(
      Object.freeze({
        productId: aggregate.key,
        productName: aggregate.label,
        classification: matchingWindows.length > 0 ? "confirmed_by_configured_window" : "candidate",
        negativeRowCount: negative.length,
        discountedNegativeRowCount: discountedNegative.length,
        qualifyingDateRange: rowDateRange(discountedNegative),
        promotionWindowLabels: Object.freeze(
          matchingWindows.map((window) => window.label ?? `${window.start}/${window.end}`),
        ),
        evidence: buildEvidenceReference(
          {
            datasetVersion: dataset.metadata.datasetVersion,
            engineVersion: configuration.engineVersion,
            operationId: `margin:promotional-loss:${aggregate.key}`,
            ruleVersion: "promotional-loss-v1",
            rows: discountedNegative,
            filterContext: context,
            affectedDateBuckets: [rowDateRange(discountedNegative)],
            segmentKeys: [aggregate.key],
            metricDependencies: ["total_discounts", "gross_profit"],
          },
          configuration,
        ),
      }),
    );
  }
  promotionalLossCases.sort((left, right) => compareCodePoints(left.productId, right.productId));

  const highRevenueCount = Array.isArray(highRevenueLowMarginProducts)
    ? highRevenueLowMarginProducts.length
    : 0;
  const result: MarginDiagnosticsResult = Object.freeze({
    resultType: "margin_diagnostics",
    status: "ok",
    engineVersion: configuration.engineVersion,
    currentPeriod: context.period,
    comparisonPeriod: null,
    filterContext: context,
    assumptions: Object.freeze([
      "Margin means gross profit before marketing, tax, shipping, fees, and overhead.",
      "Promotional-loss labels are candidates unless a configured promotion window confirms them.",
      "High-revenue uses the inclusive (n−1) interpolated percentile configured by the project.",
    ]),
    dataQuality: dataset.dataQuality,
    evidence: buildEvidenceReference(
      {
        datasetVersion: dataset.metadata.datasetVersion,
        engineVersion: configuration.engineVersion,
        operationId: "margin:diagnostics",
        ruleVersion: "margin-rules-v1",
        rows,
        filterContext: context,
        affectedDateBuckets: [context.period],
        segmentKeys: [...byProduct.keys()],
        metricDependencies: ["total_revenue", "total_cost", "gross_profit", "gross_margin"],
      },
      configuration,
    ),
    summary: Object.freeze({
      negativeMarginRowCount: negativeRows.length,
      productsWithAnyNegativeMarginRowCount: withAnyNegative.length,
      aggregateNegativeMarginProductCount: aggregateNegative.length,
      zeroRevenuePositiveCostProductCount: zeroRevenuePositiveCost.length,
      highRevenueLowMarginProductCount: highRevenueCount,
      promotionalLossCaseCount: promotionalLossCases.length,
    }),
    productMargins: Object.freeze(productMargins),
    aggregateNegativeProducts: Object.freeze(aggregateNegative),
    productsWithAnyNegativeRows: Object.freeze(withAnyNegative),
    zeroRevenuePositiveCostProducts: Object.freeze(zeroRevenuePositiveCost),
    highRevenueLowMarginProducts,
    promotionalLossCases: Object.freeze(promotionalLossCases),
    highRevenueThreshold,
    lowMarginThreshold,
  });
  return { status: "ok", value: result, warnings: [] };
}
