import { basisPoints, moneyCents } from "./money.ts";
import type {
  AnalyticsConfiguration,
  AnomalyConfiguration,
  MarginRuleConfiguration,
  MetricDefinition,
  MetricId,
} from "./types.ts";

export const ANALYTICS_ENGINE_VERSION = "3.0.0";
export const ANALYTICS_SPECIFICATION_VERSION = "3.0.0";
export const MISSING_DIMENSION_KEY = "__missing__";
export const DEFAULT_EVIDENCE_SAMPLE_LIMIT = 12;

export const DEFAULT_MARGIN_RULES: MarginRuleConfiguration = Object.freeze({
  aggregateNegativeMinimumOrders: 2,
  highRevenueMinimumOrders: 3,
  highRevenueMinimumEligibleProducts: 4,
  highRevenuePercentileBasisPoints: basisPoints(7_500),
  maximumLowMarginBasisPoints: basisPoints(1_000),
  overallMarginGapBasisPoints: basisPoints(1_000),
  promotionalMinimumNegativeRows: 1,
});

export const DEFAULT_ANOMALY_CONFIGURATION: AnomalyConfiguration = Object.freeze({
  frequency: "daily",
  minimumSeriesBuckets: 14,
  minimumBaselineBuckets: 7,
  maximumBaselineBuckets: 28,
  robustZThresholdMilli: 3_500,
  relativeMaterialityBasisPoints: basisPoints(2_000),
  absoluteMaterialityFloorCents: moneyCents(5_000),
  includePartialWeeks: false,
});

export const DEFAULT_ANALYTICS_CONFIGURATION: AnalyticsConfiguration = Object.freeze({
  engineVersion: ANALYTICS_ENGINE_VERSION,
  analyticsSpecificationVersion: ANALYTICS_SPECIFICATION_VERSION,
  missingDimensionKey: MISSING_DIMENSION_KEY,
  evidenceSampleLimit: DEFAULT_EVIDENCE_SAMPLE_LIMIT,
  marginRules: DEFAULT_MARGIN_RULES,
  anomaly: DEFAULT_ANOMALY_CONFIGURATION,
});

const MONEY_PRECISION = { kind: "minor_unit", decimalPlaces: 2 } as const;
const COUNT_PRECISION = { kind: "integer", decimalPlaces: 0 } as const;
const RATE_PRECISION = { kind: "basis_points", decimalPlaces: 2 } as const;

export const METRIC_DEFINITIONS = Object.freeze({
  total_revenue: {
    label: "Total revenue",
    unit: "currency",
    precision: MONEY_PRECISION,
    currencyRequired: true,
  },
  total_cost: {
    label: "Total cost",
    unit: "currency",
    precision: MONEY_PRECISION,
    currencyRequired: true,
  },
  gross_profit: {
    label: "Gross profit",
    unit: "currency",
    precision: MONEY_PRECISION,
    currencyRequired: true,
  },
  gross_margin: {
    label: "Gross margin",
    unit: "percent",
    precision: RATE_PRECISION,
    currencyRequired: false,
  },
  distinct_orders: {
    label: "Distinct orders",
    unit: "count",
    precision: COUNT_PRECISION,
    currencyRequired: false,
  },
  order_lines: {
    label: "Order lines",
    unit: "count",
    precision: COUNT_PRECISION,
    currencyRequired: false,
  },
  total_quantity: {
    label: "Total quantity",
    unit: "quantity",
    precision: COUNT_PRECISION,
    currencyRequired: false,
  },
  average_order_value: {
    label: "Average order value",
    unit: "currency",
    precision: MONEY_PRECISION,
    currencyRequired: true,
  },
  unique_customers: {
    label: "Unique customers",
    unit: "count",
    precision: COUNT_PRECISION,
    currencyRequired: false,
  },
  one_time_customers_within_selection: {
    label: "One-time customers within selection",
    unit: "count",
    precision: COUNT_PRECISION,
    currencyRequired: false,
  },
  repeat_customers_within_selection: {
    label: "Repeat customers within selection",
    unit: "count",
    precision: COUNT_PRECISION,
    currencyRequired: false,
  },
  repeat_customer_rate_within_selection: {
    label: "Repeat customer rate within selection",
    unit: "percent",
    precision: RATE_PRECISION,
    currencyRequired: false,
  },
  one_time_customers_full_dataset: {
    label: "One-time customers by full-dataset status",
    unit: "count",
    precision: COUNT_PRECISION,
    currencyRequired: false,
  },
  repeat_customers_full_dataset: {
    label: "Repeat customers by full-dataset status",
    unit: "count",
    precision: COUNT_PRECISION,
    currencyRequired: false,
  },
  repeat_customer_rate_full_dataset: {
    label: "Repeat customer rate by full-dataset status",
    unit: "percent",
    precision: RATE_PRECISION,
    currencyRequired: false,
  },
  total_discounts: {
    label: "Total discounts",
    unit: "currency",
    precision: MONEY_PRECISION,
    currencyRequired: true,
  },
  total_marketing_spend: {
    label: "Total marketing spend",
    unit: "currency",
    precision: MONEY_PRECISION,
    currencyRequired: true,
  },
  marketing_contribution: {
    label: "Marketing contribution",
    unit: "currency",
    precision: MONEY_PRECISION,
    currencyRequired: true,
  },
  marketing_roi: {
    label: "Marketing ROI",
    unit: "ratio",
    precision: RATE_PRECISION,
    currencyRequired: false,
  },
} satisfies Record<MetricId, MetricDefinition>);
