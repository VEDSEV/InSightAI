declare const moneyCentsBrand: unique symbol;
declare const isoDateBrand: unique symbol;
declare const basisPointsBrand: unique symbol;
declare const validatedDatasetBrand: unique symbol;

export type MoneyCents = number & { readonly [moneyCentsBrand]: "MoneyCents" };
export type IsoDate = string & { readonly [isoDateBrand]: "IsoDate" };
export type BasisPoints = number & { readonly [basisPointsBrand]: "BasisPoints" };

export type RawOrderLine = {
  readonly sourceRowNumber: number;
  readonly order_line_id: string;
  readonly order_id: string;
  readonly order_date: string;
  readonly customer_id: string;
  readonly customer_segment: string;
  readonly product_id: string;
  readonly product_name: string;
  readonly category: string;
  readonly region: string;
  readonly sales_channel: string;
  readonly quantity: string;
  readonly unit_price: string;
  readonly unit_cost: string;
  readonly discount_amount: string;
  readonly revenue: string;
  readonly cost: string;
  readonly campaign: string;
  readonly marketing_spend: string;
};

export type NormalizedOrderLine = {
  readonly sourceRowNumber: number;
  readonly orderLineId: string;
  readonly orderId: string;
  readonly orderDate: string;
  readonly customerId: string;
  readonly customerSegment: string | null;
  readonly productId: string;
  readonly productName: string;
  readonly category: string;
  readonly region: string;
  readonly salesChannel: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly unitCost: string;
  readonly discountAmount: string;
  readonly revenue: string;
  readonly cost: string;
  readonly campaign: string | null;
  readonly marketingSpend: string;
};

export type CanonicalOrderLine = {
  readonly sourceRowNumber: number;
  readonly orderLineId: string;
  readonly orderId: string;
  readonly orderDate: IsoDate;
  readonly customerId: string;
  readonly customerSegment: string | null;
  readonly productId: string;
  readonly productName: string;
  readonly category: string;
  readonly region: string;
  readonly salesChannel: string;
  readonly quantity: number;
  readonly unitPriceCents: MoneyCents;
  readonly unitCostCents: MoneyCents;
  readonly discountAmountCents: MoneyCents;
  readonly revenueCents: MoneyCents;
  readonly costCents: MoneyCents;
  readonly campaign: string | null;
  readonly marketingSpendCents: MoneyCents;
};

export type DateInterval = {
  readonly start: IsoDate;
  readonly end: IsoDate;
  readonly boundary: "inclusive";
};

export type ComparisonDefinition =
  | { readonly kind: "previous_equal_length" }
  | { readonly kind: "previous_calendar_month" }
  | { readonly kind: "previous_calendar_quarter" }
  | { readonly kind: "previous_year" };

export type ComparisonPeriodResolution =
  | {
      readonly status: "ok";
      readonly definition: ComparisonDefinition;
      readonly currentPeriod: DateInterval;
      readonly comparisonPeriod: DateInterval;
    }
  | {
      readonly status: "non_computable";
      readonly definition: ComparisonDefinition;
      readonly currentPeriod: DateInterval;
      readonly reason: "invalid_filter";
      readonly message: string;
    };

export type CustomerType = "one_time" | "repeat";
export type CustomerTypeScope = "within_selection" | "full_dataset";

export type CustomerTypeFilter = {
  readonly scope: CustomerTypeScope;
  readonly values: readonly CustomerType[];
};

export type FilterContext = {
  readonly period: DateInterval;
  readonly timezone: string;
  readonly productIds: readonly string[];
  readonly categories: readonly string[];
  readonly regions: readonly string[];
  readonly salesChannels: readonly string[];
  readonly customerSegments: readonly string[];
  readonly campaigns: readonly string[];
  readonly customerTypes: CustomerTypeFilter | null;
};

export type MetricId =
  | "total_revenue"
  | "total_cost"
  | "gross_profit"
  | "gross_margin"
  | "distinct_orders"
  | "order_lines"
  | "total_quantity"
  | "average_order_value"
  | "unique_customers"
  | "one_time_customers_within_selection"
  | "repeat_customers_within_selection"
  | "repeat_customer_rate_within_selection"
  | "one_time_customers_full_dataset"
  | "repeat_customers_full_dataset"
  | "repeat_customer_rate_full_dataset"
  | "total_discounts"
  | "total_marketing_spend"
  | "marketing_contribution"
  | "marketing_roi";

export type MetricUnit = "currency" | "count" | "quantity" | "percent" | "ratio";

export type Rational = {
  readonly numerator: number;
  readonly denominator: number;
};

export type MoneyMetricValue = {
  readonly kind: "money";
  readonly cents: MoneyCents;
};

export type RationalMoneyMetricValue = {
  readonly kind: "rational_money";
  readonly numeratorCents: MoneyCents;
  readonly denominator: number;
};

export type CountMetricValue = {
  readonly kind: "count";
  readonly value: number;
};

export type QuantityMetricValue = {
  readonly kind: "quantity";
  readonly value: number;
};

export type RateMetricValue = {
  readonly kind: "rate";
  readonly ratio: Rational;
  readonly basisPoints: BasisPoints;
};

export type MetricValue =
  | MoneyMetricValue
  | RationalMoneyMetricValue
  | CountMetricValue
  | QuantityMetricValue
  | RateMetricValue;

export type ResultPrecision =
  | { readonly kind: "minor_unit"; readonly decimalPlaces: number }
  | { readonly kind: "integer"; readonly decimalPlaces: 0 }
  | { readonly kind: "basis_points"; readonly decimalPlaces: number }
  | { readonly kind: "exact_ratio"; readonly decimalPlaces: number };

export type AnalyticsErrorSeverity = "error" | "warning";
export type AnalyticsStage =
  | "parsing"
  | "normalization"
  | "row_validation"
  | "dataset_validation"
  | "filtering"
  | "calculation";

export type AnalyticsErrorCode =
  | "csv_syntax"
  | "missing_column"
  | "unexpected_column"
  | "invalid_required_value"
  | "invalid_optional_value"
  | "invalid_id"
  | "invalid_date"
  | "invalid_category"
  | "invalid_quantity"
  | "invalid_money"
  | "unsafe_integer"
  | "arithmetic_mismatch"
  | "duplicate_order_line_id"
  | "inconsistent_order"
  | "inconsistent_dimension"
  | "invalid_date_range"
  | "invalid_currency"
  | "invalid_timezone"
  | "invalid_filter"
  | "unsupported_semantics"
  | "empty_dataset";

export type AnalyticsError = {
  readonly kind: "analytics_error";
  readonly code: AnalyticsErrorCode;
  readonly severity: AnalyticsErrorSeverity;
  readonly stage: AnalyticsStage;
  readonly message: string;
  readonly rowNumber: number | null;
  readonly field: string | null;
  readonly value: string | null;
};

export type DataQualityStatus = "valid" | "valid_with_warnings" | "invalid";

export type DataQualityState = {
  readonly status: DataQualityStatus;
  readonly inputRowCount: number;
  readonly acceptedRowCount: number;
  readonly rejectedRowCount: number;
  readonly warningCount: number;
  readonly errors: readonly AnalyticsError[];
  readonly warnings: readonly AnalyticsError[];
};

export type DatasetMetadata = {
  readonly datasetVersion: string;
  readonly transformationVersion: string;
  readonly analyticsSpecificationVersion: string;
  readonly currency: string;
  readonly timezone: string;
  readonly dateRange: DateInterval;
  readonly revenueSemantics: "net_after_line_discount";
  readonly costSemantics: "line_cost_of_goods";
  readonly marketingSpendSemantics: "line_level" | "single_line_order_allocation" | "unavailable";
};

export type ValidatedDataset = {
  readonly rows: readonly CanonicalOrderLine[];
  readonly metadata: DatasetMetadata;
  readonly dataQuality: DataQualityState;
  readonly [validatedDatasetBrand]: "ValidatedDataset";
};

export type EvidenceMeasureSummary = {
  readonly metricId: MetricId | null;
  readonly value: MetricValue | null;
};

export type EvidenceReference = {
  readonly evidenceId: string;
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly ruleVersion: string | null;
  readonly matchingRowCount: number;
  readonly distinctOrderCount: number;
  readonly affectedDateBuckets: readonly DateInterval[];
  readonly segmentKeys: readonly string[];
  readonly numerator: EvidenceMeasureSummary | null;
  readonly denominator: EvidenceMeasureSummary | null;
  readonly metricDependencies: readonly MetricId[];
  readonly sampleOrderLineIds: readonly string[];
  readonly sampleOrderIds: readonly string[];
  readonly sampleLimit: number;
  readonly truncated: boolean;
};

export type NonComputableReason =
  | "empty_dataset"
  | "invalid_filter"
  | "zero_denominator"
  | "insufficient_history"
  | "unavailable_dimension"
  | "invalid_source_data"
  | "insufficient_segments"
  | "unsupported_allocation";

export type NonComputableStatus = "not_applicable" | "insufficient_data" | "invalid_input";

export type NonComputableValue = {
  readonly kind: "non_computable_value";
  readonly status: NonComputableStatus;
  readonly reason: NonComputableReason;
  readonly message: string;
};

export type ResultContext = {
  readonly engineVersion: string;
  readonly currentPeriod: DateInterval;
  readonly comparisonPeriod: DateInterval | null;
  readonly filterContext: FilterContext;
  readonly assumptions: readonly string[];
  readonly dataQuality: DataQualityState;
  readonly evidence: EvidenceReference;
};

export type ComputableMetricResult = ResultContext & {
  readonly resultType: "metric";
  readonly status: "ok";
  readonly metricId: MetricId;
  readonly label: string;
  readonly value: MetricValue;
  readonly unit: MetricUnit;
  readonly currency: string | null;
  readonly precision: ResultPrecision;
  readonly numerator: MetricValue | null;
  readonly denominator: MetricValue | null;
  readonly previousValue: MetricValue | null;
  readonly absoluteChange: MetricValue | null;
  readonly percentageChange: RateMetricValue | NonComputableValue | null;
};

export type NonComputableResult = ResultContext & {
  readonly resultType: "non_computable";
  readonly operation: "metric" | "breakdown" | "diagnostic";
  readonly status: NonComputableStatus;
  readonly reason: NonComputableReason;
  readonly message: string;
  readonly metricId: MetricId | null;
  readonly label: string;
  readonly value: null;
  readonly unit: MetricUnit | null;
  readonly currency: string | null;
  readonly precision: ResultPrecision | null;
};

export type MetricResult = ComputableMetricResult | NonComputableResult;

export type BreakdownDimension =
  "product" | "category" | "region" | "channel" | "customer_segment" | "campaign";

export type BreakdownComparison = {
  readonly previousRevenue: MoneyCents;
  readonly absoluteRevenueChange: MoneyCents;
  readonly percentageRevenueChange: RateMetricValue | NonComputableValue;
};

export type BreakdownEntry = {
  readonly key: string;
  readonly label: string;
  readonly revenue: MoneyCents;
  readonly cost: MoneyCents;
  readonly grossProfit: MoneyCents;
  readonly grossMargin: RateMetricValue | NonComputableValue;
  readonly orders: number;
  readonly quantity: number;
  readonly customers: number;
  readonly revenueShare: RateMetricValue | NonComputableValue;
  readonly profitShare: RateMetricValue | NonComputableValue;
  readonly comparison: BreakdownComparison | null;
  readonly evidence: EvidenceReference;
};

export type ComputableBreakdownResult = ResultContext & {
  readonly resultType: "breakdown";
  readonly status: "ok";
  readonly dimension: BreakdownDimension;
  readonly entries: readonly BreakdownEntry[];
};

export type BreakdownResult = ComputableBreakdownResult | NonComputableResult;

export type DiagnosticValue = MetricValue | string | boolean | DateInterval | null;

export type DiagnosticFinding = {
  readonly findingId: string;
  readonly kind: "concentration" | "margin" | "trend" | "anomaly";
  readonly ruleVersion: string;
  readonly label: string;
  readonly description: string;
  readonly severity: "informational" | "watch" | "high";
  readonly values: Readonly<Record<string, DiagnosticValue>>;
  readonly evidence: EvidenceReference;
};

export type ComputableDiagnosticResult = ResultContext & {
  readonly resultType: "diagnostic";
  readonly status: "ok";
  readonly diagnosticId: string;
  readonly findings: readonly DiagnosticFinding[];
};

export type DiagnosticResult = ComputableDiagnosticResult | NonComputableResult;

export type AnalyticsResult<T> =
  | { readonly status: "ok"; readonly value: T; readonly warnings: readonly AnalyticsError[] }
  | { readonly status: "error"; readonly errors: readonly AnalyticsError[] };

export type DatasetValidationResult =
  | { readonly status: "valid"; readonly dataset: ValidatedDataset }
  | {
      readonly status: "invalid";
      readonly dataQuality: DataQualityState;
      readonly errors: readonly AnalyticsError[];
    };

export type ValidationVocabulary = {
  readonly categories: readonly string[];
  readonly regions: readonly string[];
  readonly salesChannels: readonly string[];
  readonly customerSegments: readonly string[];
  readonly campaigns: readonly string[];
};

export type ValidationConfiguration = {
  readonly currency: string;
  readonly timezone: string;
  readonly dateRange: DateInterval;
  readonly vocabulary: ValidationVocabulary;
  readonly idPatterns: {
    readonly orderLineId: RegExp;
    readonly orderId: RegExp;
    readonly customerId: RegExp;
    readonly productId: RegExp;
  };
  readonly marketingSpendSemantics: DatasetMetadata["marketingSpendSemantics"];
};

export type MarginRuleConfiguration = {
  readonly aggregateNegativeMinimumOrders: number;
  readonly highRevenueMinimumOrders: number;
  readonly highRevenueMinimumEligibleProducts: number;
  readonly highRevenuePercentileBasisPoints: BasisPoints;
  readonly maximumLowMarginBasisPoints: BasisPoints;
  readonly overallMarginGapBasisPoints: BasisPoints;
  readonly promotionalMinimumNegativeRows: number;
};

export type AnomalyFrequency = "daily" | "weekly";

export type AnomalyConfiguration = {
  readonly frequency: AnomalyFrequency;
  readonly minimumSeriesBuckets: number;
  readonly minimumBaselineBuckets: number;
  readonly maximumBaselineBuckets: number;
  readonly robustZThresholdMilli: number;
  readonly relativeMaterialityBasisPoints: BasisPoints;
  readonly absoluteMaterialityFloorCents: MoneyCents;
  readonly includePartialWeeks: boolean;
};

export type AnalyticsConfiguration = {
  readonly engineVersion: string;
  readonly analyticsSpecificationVersion: string;
  readonly missingDimensionKey: string;
  readonly evidenceSampleLimit: number;
  readonly marginRules: MarginRuleConfiguration;
  readonly anomaly: AnomalyConfiguration;
};

export type MetricDefinition = {
  readonly label: string;
  readonly unit: MetricUnit;
  readonly precision: ResultPrecision;
  readonly currencyRequired: boolean;
};
