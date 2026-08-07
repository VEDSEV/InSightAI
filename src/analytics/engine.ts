import {
  detectRevenueAnomaliesWithRuntime,
  type AnomalyQuery,
  type AnomalyResult,
} from "./anomalies.ts";
import { createAnalysisRuntime } from "./analysis-context.ts";
import { calculateBreakdownWithRuntime, type BreakdownQuery } from "./breakdowns.ts";
import { compareMetricWithRuntime, type MetricComparisonQuery } from "./comparisons.ts";
import {
  calculateConcentration,
  type ConcentrationQuery,
  type ConcentrationResult,
} from "./concentration.ts";
import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import type { FilterContextInput } from "./filters.ts";
import {
  analyzeMargins,
  type MarginDiagnosticsQuery,
  type MarginDiagnosticsResult,
} from "./margins.ts";
import { computeMetricsWithRuntime, type MetricResultSet } from "./metrics.ts";
import {
  analyzeTrendContributions,
  type TrendContributionQuery,
  type TrendContributionResult,
} from "./trends.ts";
import {
  analyzePerformanceTrendWithRuntime,
  type PerformanceTrendQuery,
  type PerformanceTrendResult,
} from "./performance-trends.ts";
import type {
  AnalyticsConfiguration,
  AnalyticsResult,
  BreakdownResult,
  FilterContext,
  MetricResult,
  NonComputableResult,
  ValidatedDataset,
} from "./types.ts";

export type AnalyticsEngine = {
  readonly engineVersion: string;
  readonly datasetVersion: string;
  readonly metrics: (filter: FilterContextInput) => MetricResultSet;
  readonly comparison: (query: MetricComparisonQuery) => AnalyticsResult<MetricResult>;
  readonly breakdown: (query: BreakdownQuery) => AnalyticsResult<BreakdownResult>;
  readonly concentration: (query: ConcentrationQuery) => AnalyticsResult<ConcentrationResult>;
  readonly marginDiagnostics: (
    query: MarginDiagnosticsQuery,
  ) => AnalyticsResult<MarginDiagnosticsResult>;
  readonly trendContributions: (
    query: TrendContributionQuery,
  ) => AnalyticsResult<TrendContributionResult | NonComputableResult>;
  readonly performanceTrend: (
    query: PerformanceTrendQuery,
  ) => AnalyticsResult<PerformanceTrendResult | NonComputableResult>;
  readonly anomalies: (query: AnomalyQuery) => AnalyticsResult<AnomalyResult>;
};

function unvalidatedContext(input: FilterContextInput, dataset: ValidatedDataset): FilterContext {
  return Object.freeze({
    period: input.period,
    timezone: input.timezone ?? dataset.metadata.timezone,
    productIds: Object.freeze([...(input.productIds ?? [])]),
    categories: Object.freeze([...(input.categories ?? [])]),
    regions: Object.freeze([...(input.regions ?? [])]),
    salesChannels: Object.freeze([...(input.salesChannels ?? [])]),
    customerSegments: Object.freeze([...(input.customerSegments ?? [])]),
    campaigns: Object.freeze([...(input.campaigns ?? [])]),
    customerTypes:
      input.customerTypes === undefined || input.customerTypes === null
        ? null
        : Object.freeze({
            scope: input.customerTypes.scope,
            values: Object.freeze([...input.customerTypes.values]),
          }),
  });
}

/**
 * Creates the supported framework-independent analytics facade for one fully validated dataset.
 * The facade closes over immutable data and delegates every numerical result to versioned engine
 * modules; future UI and AI consumers should use this object rather than importing internals.
 */
export function createAnalyticsEngine(
  dataset: ValidatedDataset,
  configuration: AnalyticsConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): AnalyticsEngine {
  const runtime = createAnalysisRuntime(dataset, configuration);
  return Object.freeze({
    engineVersion: runtime.configuration.engineVersion,
    datasetVersion: dataset.metadata.datasetVersion,
    metrics: (filter: FilterContextInput) =>
      computeMetricsWithRuntime(runtime, unvalidatedContext(filter, dataset)),
    comparison: (query: MetricComparisonQuery) => compareMetricWithRuntime(runtime, query),
    breakdown: (query: BreakdownQuery) => calculateBreakdownWithRuntime(runtime, query),
    concentration: (query: ConcentrationQuery) =>
      calculateConcentration(dataset, query, configuration),
    marginDiagnostics: (query: MarginDiagnosticsQuery) =>
      analyzeMargins(dataset, query, configuration),
    trendContributions: (query: TrendContributionQuery) =>
      analyzeTrendContributions(dataset, query, configuration),
    performanceTrend: (query: PerformanceTrendQuery) =>
      analyzePerformanceTrendWithRuntime(runtime, query),
    anomalies: (query: AnomalyQuery) => detectRevenueAnomaliesWithRuntime(runtime, query),
  });
}
