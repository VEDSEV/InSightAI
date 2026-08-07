export {
  ANALYTICS_ENGINE_VERSION,
  ANALYTICS_SPECIFICATION_VERSION,
  DEFAULT_ANALYTICS_CONFIGURATION,
  DEFAULT_ANOMALY_CONFIGURATION,
  DEFAULT_EVIDENCE_SAMPLE_LIMIT,
  DEFAULT_MARGIN_RULES,
  METRIC_DEFINITIONS,
  MISSING_DIMENSION_KEY,
} from "./configuration.ts";
export { detectRevenueAnomalies } from "./anomalies.ts";
export type {
  AnomalyBaseline,
  AnomalyConfigurationOverride,
  AnomalyQuery,
  AnomalyResult,
  ComputableAnomalyResult,
  ExactRationalValue,
  AnomalyRevenueBucket,
  RevenueAnomalyFinding,
} from "./anomalies.ts";
export { calculateConcentration } from "./concentration.ts";
export type {
  ComputableConcentrationResult,
  ConcentrationDimension,
  ConcentrationQuery,
  ConcentrationResult,
  ConcentrationSegment,
  ConcentrationSupport,
  ExactHerfindahlHirschmanIndex,
  TopRevenueShare,
} from "./concentration.ts";
export { createAnalyticsEngine } from "./engine.ts";
export type { AnalyticsEngine } from "./engine.ts";
export { compareMetric } from "./comparisons.ts";
export type { MetricComparisonQuery } from "./comparisons.ts";
export { calculateBreakdown } from "./breakdowns.ts";
export type { BreakdownQuery, BreakdownSortMeasure } from "./breakdowns.ts";
export {
  addDays,
  compareIsoDates,
  createDateInterval,
  dateInterval,
  dateIsWithin,
  daysBetween,
  daysInMonth,
  endOfIsoWeek,
  endOfMonth,
  endOfQuarter,
  enumerateDates,
  inclusiveDayCount,
  intervalContains,
  isIsoDate,
  isLeapYear,
  isoDate,
  parseIsoDate,
  quarterNumber,
  resolveComparisonPeriod,
  shiftMonthsClamped,
  shiftYearsClamped,
  startOfIsoWeek,
  startOfMonth,
  startOfQuarter,
} from "./dates.ts";
export {
  addMoneyCents,
  basisPoints,
  compareRationals,
  formatMoneyCents,
  moneyCents,
  multiplyMoneyCents,
  parseMoneyCents,
  rateMetricValue,
  rational,
  roundRationalToBasisPoints,
  roundRationalToScaledInteger,
  subtractMoneyCents,
  sumMoneyCents,
} from "./money.ts";
export { applyFilterContext, createFilterContext, filterDataset } from "./filters.ts";
export type { FilterContextInput, FilteredRows } from "./filters.ts";
export { buildEvidenceReference, stableFingerprint } from "./evidence.ts";
export type { EvidenceInput } from "./evidence.ts";
export { computeMetrics } from "./metrics.ts";
export type { ComputeMetricsInput, MetricResultSet } from "./metrics.ts";
export { analyzeMargins } from "./margins.ts";
export type {
  MarginDiagnosticsQuery,
  MarginDiagnosticsResult,
  MarginDiagnosticsSummary,
  ProductMarginDistributionEntry,
  PromotionalLossCase,
  PromotionWindow,
} from "./margins.ts";
export { analyzeTrendContributions } from "./trends.ts";
export type {
  ConsecutiveDeclineSummary,
  RevenueBucket,
  RevenueContribution,
  TrendContributionQuery,
  TrendContributionResult,
  TrendFrequency,
} from "./trends.ts";
export { normalizeRawOrderLine, normalizeRawOrderLines } from "./normalization.ts";
export { ORDER_LINE_CSV_COLUMNS, parseOrderLineCsv } from "./parsing.ts";
export { ingestCanonicalCsv, validateDataset, validateOrderLines } from "./validation.ts";
export type * from "./types.ts";
