import { createAnalysisRuntime, type AnalysisRuntime } from "./analysis-context.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION, METRIC_DEFINITIONS } from "./configuration.ts";
import {
  buildEvidenceReference,
  prepareEvidenceRowSupport,
  type EvidenceRowSupport,
} from "./evidence.ts";
import { createAnalyticsError } from "./errors.ts";
import { rateMetricValue } from "./money.ts";
import type {
  AnalyticsConfiguration,
  CanonicalOrderLine,
  ComputableMetricResult,
  CountMetricValue,
  DataQualityState,
  EvidenceMeasureSummary,
  FilterContext,
  MetricId,
  MetricResult,
  MetricValue,
  MoneyCents,
  MoneyMetricValue,
  NonComputableReason,
  NonComputableResult,
  NonComputableStatus,
  QuantityMetricValue,
  RationalMoneyMetricValue,
  ValidatedDataset,
} from "./types.ts";

export type ComputeMetricsInput = {
  readonly dataset: ValidatedDataset;
  readonly filterContext: FilterContext;
  readonly configuration?: AnalyticsConfiguration;
};

export type MetricResultSet = Readonly<Record<MetricId, MetricResult>>;

type MetricComponent = {
  readonly metricId: MetricId | null;
  readonly value: MetricValue;
};

type MetricEnvelopeInput = {
  readonly dataset: ValidatedDataset;
  readonly rows: readonly CanonicalOrderLine[];
  readonly filterContext: FilterContext;
  readonly configuration: AnalyticsConfiguration;
  readonly dataQuality: DataQualityState;
  readonly evidenceSupport: EvidenceRowSupport;
};

type MetricParts = {
  readonly numerator?: MetricComponent | null;
  readonly denominator?: MetricComponent | null;
  readonly dependencies?: readonly MetricId[];
};

type AggregateState = {
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

const METRIC_IDS = Object.freeze(Object.keys(METRIC_DEFINITIONS) as MetricId[]);

function moneyValue(cents: MoneyCents): MoneyMetricValue {
  return Object.freeze({ kind: "money", cents });
}

function rationalMoneyValue(
  numeratorCents: MoneyCents,
  denominator: number,
): RationalMoneyMetricValue {
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError("A rational-money denominator must be a positive safe integer.");
  }
  return Object.freeze({ kind: "rational_money", numeratorCents, denominator });
}

function countValue(value: number): CountMetricValue {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("A count metric must be a non-negative safe integer.");
  }
  return Object.freeze({ kind: "count", value });
}

function quantityValue(value: number): QuantityMetricValue {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("A quantity metric must be a non-negative safe integer.");
  }
  return Object.freeze({ kind: "quantity", value });
}

function evidenceSummary(
  component: MetricComponent | null | undefined,
): EvidenceMeasureSummary | null {
  if (!component) {
    return null;
  }
  return Object.freeze({ metricId: component.metricId, value: component.value });
}

function assumptionsFor(metricId: MetricId, envelope: MetricEnvelopeInput): readonly string[] {
  const assumptions = [
    `Dates use inclusive civil-date boundaries in ${envelope.dataset.metadata.timezone}.`,
    `Authoritative money is aggregated as checked integer cents in ${envelope.dataset.metadata.currency}.`,
  ];

  if (metricId.includes("within_selection")) {
    assumptions.push(
      "Repeat status uses at least two distinct orders visible after the full filter context is applied.",
    );
  } else if (metricId.includes("full_dataset")) {
    assumptions.push(
      "Repeat status uses all validated dataset rows, then intersects that status with selected customers.",
    );
  }

  if (metricId === "distinct_orders" || metricId === "average_order_value") {
    assumptions.push(
      "A filtered product/category slice counts an order once when at least one selected line is visible.",
    );
  }

  if (
    metricId === "total_marketing_spend" ||
    metricId === "marketing_contribution" ||
    metricId === "marketing_roi"
  ) {
    assumptions.push(
      "Marketing contribution and ROI are descriptive contribution-after-allocated-spend measures, not causal attribution.",
    );
    if (
      envelope.dataset.metadata.marketingSpendSemantics === "single_line_order_allocation" &&
      (envelope.filterContext.productIds.length > 0 || envelope.filterContext.categories.length > 0)
    ) {
      assumptions.push(
        "Product/category filtering can select or exclude the one allocated spend line; this result is not product/category marketing attribution.",
      );
    }
  }

  return Object.freeze(assumptions);
}

function resultCurrency(metricId: MetricId, dataset: ValidatedDataset): string | null {
  return METRIC_DEFINITIONS[metricId].currencyRequired ? dataset.metadata.currency : null;
}

function evidenceFor(metricId: MetricId, envelope: MetricEnvelopeInput, parts: MetricParts) {
  return buildEvidenceReference(
    {
      datasetVersion: envelope.dataset.metadata.datasetVersion,
      engineVersion: envelope.configuration.engineVersion,
      operationId: metricId,
      rows: envelope.rows,
      filterContext: envelope.filterContext,
      affectedDateBuckets: [envelope.filterContext.period],
      numerator: evidenceSummary(parts.numerator),
      denominator: evidenceSummary(parts.denominator),
      metricDependencies: parts.dependencies ?? [],
      sampleLimit: envelope.configuration.evidenceSampleLimit,
      rowSupport: envelope.evidenceSupport,
    },
    envelope.configuration,
  );
}

function computableMetric(
  metricId: MetricId,
  value: MetricValue,
  envelope: MetricEnvelopeInput,
  parts: MetricParts = {},
): ComputableMetricResult {
  const definition = METRIC_DEFINITIONS[metricId];
  return Object.freeze({
    resultType: "metric",
    status: "ok",
    metricId,
    label: definition.label,
    value,
    unit: definition.unit,
    currency: resultCurrency(metricId, envelope.dataset),
    precision: definition.precision,
    currentPeriod: envelope.filterContext.period,
    comparisonPeriod: null,
    filterContext: envelope.filterContext,
    assumptions: assumptionsFor(metricId, envelope),
    dataQuality: envelope.dataQuality,
    evidence: evidenceFor(metricId, envelope, parts),
    engineVersion: envelope.configuration.engineVersion,
    numerator: parts.numerator?.value ?? null,
    denominator: parts.denominator?.value ?? null,
    previousValue: null,
    absoluteChange: null,
    percentageChange: null,
  });
}

function nonComputableMetric(
  metricId: MetricId,
  status: NonComputableStatus,
  reason: NonComputableReason,
  message: string,
  envelope: MetricEnvelopeInput,
  parts: MetricParts = {},
): NonComputableResult {
  const definition = METRIC_DEFINITIONS[metricId];
  return Object.freeze({
    resultType: "non_computable",
    operation: "metric",
    status,
    reason,
    message,
    metricId,
    label: definition.label,
    value: null,
    unit: definition.unit,
    currency: resultCurrency(metricId, envelope.dataset),
    precision: definition.precision,
    currentPeriod: envelope.filterContext.period,
    comparisonPeriod: null,
    filterContext: envelope.filterContext,
    assumptions: assumptionsFor(metricId, envelope),
    dataQuality: envelope.dataQuality,
    evidence: evidenceFor(metricId, envelope, parts),
    engineVersion: envelope.configuration.engineVersion,
  });
}

function nonComputableMetricSet(
  envelope: MetricEnvelopeInput,
  status: NonComputableStatus,
  reason: NonComputableReason,
  message: string,
): MetricResultSet {
  const results = {} as Record<MetricId, MetricResult>;
  for (const metricId of METRIC_IDS) {
    results[metricId] = nonComputableMetric(metricId, status, reason, message, envelope);
  }
  return Object.freeze(results);
}

function invalidCalculationQuality(dataset: ValidatedDataset, error: unknown): DataQualityState {
  const calculationError = createAnalyticsError({
    code: "unsafe_integer",
    stage: "calculation",
    message: error instanceof Error ? error.message : "Metric aggregation failed.",
  });
  return Object.freeze({
    ...dataset.dataQuality,
    status: "invalid",
    errors: Object.freeze([...dataset.dataQuality.errors, calculationError]),
  });
}

function component(metricId: MetricId, value: MetricValue): MetricComponent {
  return Object.freeze({ metricId, value });
}

function rateOrZeroDenominator(
  metricId: MetricId,
  numerator: MetricComponent,
  denominator: MetricComponent,
  numeratorInteger: number,
  denominatorInteger: number,
  envelope: MetricEnvelopeInput,
  dependencies: readonly MetricId[],
  zeroMessage: string,
): MetricResult {
  const parts = { numerator, denominator, dependencies } as const;
  if (denominatorInteger === 0) {
    return nonComputableMetric(
      metricId,
      "not_applicable",
      "zero_denominator",
      zeroMessage,
      envelope,
      parts,
    );
  }
  return computableMetric(
    metricId,
    rateMetricValue(numeratorInteger, denominatorInteger),
    envelope,
    parts,
  );
}

function createMetricResult(
  metricId: MetricId,
  aggregate: AggregateState,
  envelope: MetricEnvelopeInput,
): MetricResult {
  const revenue = moneyValue(aggregate.revenue);
  const cost = moneyValue(aggregate.cost);
  const grossProfit = moneyValue(aggregate.grossProfit);
  const orderLines = countValue(envelope.rows.length);
  const orders = countValue(aggregate.orderCount);
  const customers = countValue(aggregate.uniqueCustomerCount);
  const repeatWithin = countValue(aggregate.repeatWithinSelection);
  const repeatFull = countValue(aggregate.repeatFullDataset);
  const marketingSpend = moneyValue(aggregate.marketingSpend);
  const marketingContribution = moneyValue(aggregate.marketingContribution);

  const marketingUnavailable = envelope.dataset.metadata.marketingSpendSemantics === "unavailable";
  const unsupportedMarketing = (metricId: MetricId): MetricResult =>
    nonComputableMetric(
      metricId,
      "not_applicable",
      "unsupported_allocation",
      "Marketing spend semantics are unavailable for this validated dataset.",
      envelope,
    );

  switch (metricId) {
    case "total_revenue":
      return computableMetric(metricId, revenue, envelope);
    case "total_cost":
      return computableMetric(metricId, cost, envelope);
    case "gross_profit":
      return computableMetric(metricId, grossProfit, envelope, {
        dependencies: ["total_revenue", "total_cost"],
      });
    case "gross_margin":
      return rateOrZeroDenominator(
        metricId,
        component("gross_profit", grossProfit),
        component("total_revenue", revenue),
        aggregate.grossProfit,
        aggregate.revenue,
        envelope,
        ["gross_profit", "total_revenue"],
        "Gross margin is not computable when selected revenue is zero.",
      );
    case "distinct_orders":
      return computableMetric(metricId, orders, envelope);
    case "order_lines":
      return computableMetric(metricId, orderLines, envelope);
    case "total_quantity":
      return computableMetric(metricId, quantityValue(aggregate.quantity), envelope);
    case "average_order_value": {
      const parts = {
        numerator: component("total_revenue", revenue),
        denominator: component("distinct_orders", orders),
        dependencies: ["total_revenue", "distinct_orders"],
      } as const;
      return aggregate.orderCount === 0
        ? nonComputableMetric(
            metricId,
            "not_applicable",
            "zero_denominator",
            "Average order value is not computable when no selected orders exist.",
            envelope,
            parts,
          )
        : computableMetric(
            metricId,
            rationalMoneyValue(aggregate.revenue, aggregate.orderCount),
            envelope,
            parts,
          );
    }
    case "unique_customers":
      return computableMetric(metricId, customers, envelope);
    case "one_time_customers_within_selection":
      return computableMetric(metricId, countValue(aggregate.oneTimeWithinSelection), envelope);
    case "repeat_customers_within_selection":
      return computableMetric(metricId, repeatWithin, envelope);
    case "repeat_customer_rate_within_selection":
      return rateOrZeroDenominator(
        metricId,
        component("repeat_customers_within_selection", repeatWithin),
        component("unique_customers", customers),
        aggregate.repeatWithinSelection,
        aggregate.uniqueCustomerCount,
        envelope,
        ["repeat_customers_within_selection", "unique_customers"],
        "Within-selection repeat rate is not computable when no selected customers exist.",
      );
    case "one_time_customers_full_dataset":
      return computableMetric(metricId, countValue(aggregate.oneTimeFullDataset), envelope);
    case "repeat_customers_full_dataset":
      return computableMetric(metricId, repeatFull, envelope);
    case "repeat_customer_rate_full_dataset":
      return rateOrZeroDenominator(
        metricId,
        component("repeat_customers_full_dataset", repeatFull),
        component("unique_customers", customers),
        aggregate.repeatFullDataset,
        aggregate.uniqueCustomerCount,
        envelope,
        ["repeat_customers_full_dataset", "unique_customers"],
        "Full-dataset repeat rate is not computable when no selected customers exist.",
      );
    case "total_discounts":
      return computableMetric(metricId, moneyValue(aggregate.discounts), envelope);
    case "total_marketing_spend":
      return marketingUnavailable
        ? unsupportedMarketing(metricId)
        : computableMetric(metricId, marketingSpend, envelope);
    case "marketing_contribution":
      return marketingUnavailable
        ? unsupportedMarketing(metricId)
        : computableMetric(metricId, marketingContribution, envelope, {
            dependencies: ["gross_profit", "total_marketing_spend"],
          });
    case "marketing_roi":
      return marketingUnavailable
        ? unsupportedMarketing(metricId)
        : rateOrZeroDenominator(
            metricId,
            component("marketing_contribution", marketingContribution),
            component("total_marketing_spend", marketingSpend),
            aggregate.marketingContribution,
            aggregate.marketingSpend,
            envelope,
            ["marketing_contribution", "total_marketing_spend"],
            "Marketing ROI is not computable when selected marketing spend is zero.",
          );
  }
}

function createMetricSet(
  aggregate: AggregateState,
  envelope: MetricEnvelopeInput,
): MetricResultSet {
  const results = {} as Record<MetricId, MetricResult>;
  for (const metricId of METRIC_IDS) {
    results[metricId] = createMetricResult(metricId, aggregate, envelope);
  }
  return Object.freeze(results);
}

/**
 * Computes every authoritative core metric from one normalized filter context. The input dataset and
 * rows are never mutated, and callers receive a frozen record of typed result envelopes.
 */
function createInitialEnvelope(
  runtime: AnalysisRuntime,
  filterContext: FilterContext,
): MetricEnvelopeInput {
  const emptyRows = Object.freeze([]) as readonly CanonicalOrderLine[];
  return {
    dataset: runtime.dataset,
    rows: emptyRows,
    filterContext,
    configuration: runtime.configuration,
    dataQuality: runtime.dataset.dataQuality,
    evidenceSupport: prepareEvidenceRowSupport(emptyRows),
  };
}

export function computeMetricsWithRuntime(
  runtime: AnalysisRuntime,
  filterContext: FilterContext,
): MetricResultSet {
  const inputDataset = runtime.dataset;
  const envelopeBeforeResolution = createInitialEnvelope(runtime, filterContext);

  if (inputDataset.rows.length === 0) {
    return nonComputableMetricSet(
      envelopeBeforeResolution,
      "invalid_input",
      "empty_dataset",
      "Metrics require a validated dataset containing at least one order line.",
    );
  }
  if (
    inputDataset.dataQuality.status === "invalid" ||
    inputDataset.dataQuality.rejectedRowCount > 0 ||
    inputDataset.dataQuality.acceptedRowCount !== inputDataset.rows.length
  ) {
    return nonComputableMetricSet(
      envelopeBeforeResolution,
      "invalid_input",
      "invalid_source_data",
      "Metrics require a fully validated dataset with no rejected source rows.",
    );
  }

  const resolved = runtime.resolve(filterContext);
  if (resolved.status === "error") {
    return nonComputableMetricSet(
      envelopeBeforeResolution,
      "invalid_input",
      "invalid_filter",
      resolved.errors.map((error) => error.message).join(" "),
    );
  }

  const context = resolved.value;
  const envelope: MetricEnvelopeInput = {
    ...envelopeBeforeResolution,
    rows: context.rows,
    filterContext: context.filterContext,
    evidenceSupport: context.evidenceSupport,
  };

  try {
    return createMetricSet(context.aggregate, envelope);
  } catch (error) {
    return nonComputableMetricSet(
      { ...envelope, dataQuality: invalidCalculationQuality(inputDataset, error) },
      "invalid_input",
      "invalid_source_data",
      error instanceof Error ? error.message : "Metric aggregation failed.",
    );
  }
}

export function computeMetrics(input: ComputeMetricsInput): MetricResultSet {
  return computeMetricsWithRuntime(
    createAnalysisRuntime(input.dataset, input.configuration ?? DEFAULT_ANALYTICS_CONFIGURATION),
    input.filterContext,
  );
}

/** Internal single-metric path used by comparisons to avoid constructing unrelated envelopes. */
export function computeMetricWithRuntime(
  runtime: AnalysisRuntime,
  filterContext: FilterContext,
  metricId: MetricId,
): MetricResult {
  const inputDataset = runtime.dataset;
  const envelopeBeforeResolution = createInitialEnvelope(runtime, filterContext);

  if (inputDataset.rows.length === 0) {
    return nonComputableMetric(
      metricId,
      "invalid_input",
      "empty_dataset",
      "Metrics require a validated dataset containing at least one order line.",
      envelopeBeforeResolution,
    );
  }
  if (
    inputDataset.dataQuality.status === "invalid" ||
    inputDataset.dataQuality.rejectedRowCount > 0 ||
    inputDataset.dataQuality.acceptedRowCount !== inputDataset.rows.length
  ) {
    return nonComputableMetric(
      metricId,
      "invalid_input",
      "invalid_source_data",
      "Metrics require a fully validated dataset with no rejected source rows.",
      envelopeBeforeResolution,
    );
  }

  const resolved = runtime.resolve(filterContext);
  if (resolved.status === "error") {
    return nonComputableMetric(
      metricId,
      "invalid_input",
      "invalid_filter",
      resolved.errors.map((error) => error.message).join(" "),
      envelopeBeforeResolution,
    );
  }

  const context = resolved.value;
  const envelope: MetricEnvelopeInput = {
    ...envelopeBeforeResolution,
    rows: context.rows,
    filterContext: context.filterContext,
    evidenceSupport: context.evidenceSupport,
  };

  try {
    return createMetricResult(metricId, context.aggregate, envelope);
  } catch (error) {
    return nonComputableMetric(
      metricId,
      "invalid_input",
      "invalid_source_data",
      error instanceof Error ? error.message : "Metric aggregation failed.",
      { ...envelope, dataQuality: invalidCalculationQuality(inputDataset, error) },
    );
  }
}

export function computeMetric(input: ComputeMetricsInput, metricId: MetricId): MetricResult {
  return computeMetricWithRuntime(
    createAnalysisRuntime(input.dataset, input.configuration ?? DEFAULT_ANALYTICS_CONFIGURATION),
    input.filterContext,
    metricId,
  );
}
