import {
  MISSING_DIMENSION_KEY,
  type AnalyticsEngine,
  type BreakdownDimension,
  type BreakdownEntry,
  type EvidenceReference,
  type FilterContext,
  type MetricId,
  type MetricResult,
  type MetricValue,
  type ValidatedDataset,
} from "../analytics/index.ts";

import { DEFAULT_FINDING_RULE_CONFIGURATION } from "./configuration.ts";
import {
  FINDINGS_ENGINE_VERSION,
  FINDINGS_RULESET_VERSION,
  type Finding,
  type FindingCategory,
  type FindingEvidenceStrength,
  type FindingMateriality,
  type FindingRuleConfiguration,
  type FindingSeverity,
  type FindingSuppression,
  type FindingsEngine,
  type FindingsQuery,
  type FindingsResult,
} from "./types.ts";

const COMPARISON = Object.freeze({ kind: "previous_year" } as const);
const SEVERITY_WEIGHT: Readonly<Record<FindingSeverity, number>> = Object.freeze({
  critical: 500,
  high: 400,
  medium: 300,
  low: 200,
  informational: 100,
});

function compareCodePoints(left: string, right: string): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

function money(value: MetricValue | null): number | null {
  return value?.kind === "money" ? value.cents : null;
}

function rateBasisPoints(value: MetricValue | null): number | null {
  return value?.kind === "rate" ? value.basisPoints : null;
}

function metricValue(result: MetricResult): MetricValue | null {
  return result.status === "ok" ? result.value : null;
}

function percentageChange(result: MetricResult): number | null {
  if (result.status !== "ok" || result.percentageChange?.kind !== "rate") return null;
  return result.percentageChange.basisPoints;
}

function absoluteExposure(value: MetricValue | null): number | null {
  const cents = money(value);
  return cents === null ? null : Math.abs(cents);
}

function evidenceStrength(
  evidence: readonly EvidenceReference[],
  configuration: FindingRuleConfiguration,
  comparisonSupported: boolean,
): FindingEvidenceStrength {
  const rows = evidence.reduce((total, item) => total + item.matchingRowCount, 0);
  const orders = evidence.reduce((total, item) => total + item.distinctOrderCount, 0);
  if (comparisonSupported && orders >= configuration.minimumSupportingOrders * 2 && rows >= 10)
    return "strong";
  if (orders >= configuration.minimumSupportingOrders) return "moderate";
  return "limited";
}

function severityFor(
  exposureCents: number | null,
  changeBasisPoints: number | null,
): FindingSeverity {
  const exposure = exposureCents ?? 0;
  const movement = Math.abs(changeBasisPoints ?? 0);
  if (exposure >= 100_000 && movement >= 2_500) return "critical";
  if (exposure >= 50_000 || movement >= 2_500) return "high";
  if (exposure >= 10_000 || movement >= 1_000) return "medium";
  return "low";
}

function priority(
  severity: FindingSeverity,
  exposureCents: number | null,
  changeBasisPoints: number | null,
  strength: FindingEvidenceStrength,
  persistence = 0,
): number {
  const strengthWeight = strength === "strong" ? 30 : strength === "moderate" ? 15 : 0;
  return (
    SEVERITY_WEIGHT[severity] +
    Math.min(99, Math.floor((exposureCents ?? 0) / 10_000)) +
    Math.min(50, Math.floor(Math.abs(changeBasisPoints ?? 0) / 100)) +
    strengthWeight +
    persistence * 10
  );
}

function materiality(
  exposureCents: number | null,
  evidence: readonly EvidenceReference[],
  shareBasisPoints: number | null = null,
  persistencePeriods = 0,
): FindingMateriality {
  return Object.freeze({
    absoluteExposureCents: exposureCents,
    affectedRevenueShareBasisPoints: shareBasisPoints,
    supportingOrderCount: evidence.reduce((total, item) => total + item.distinctOrderCount, 0),
    persistencePeriods,
  });
}

function finding(
  input: Omit<
    Finding,
    "findingId" | "priority" | "evidenceStrength" | "status" | "materiality" | "ruleVersion"
  > & {
    readonly exposureCents: number | null;
    readonly shareBasisPoints?: number | null;
    readonly persistencePeriods?: number;
    readonly comparisonSupported?: boolean;
  },
  configuration: FindingRuleConfiguration,
): Finding {
  const persistencePeriods = input.persistencePeriods ?? 0;
  const strength = evidenceStrength(
    input.evidence,
    configuration,
    input.comparisonSupported ?? false,
  );
  const id = [
    input.ruleId,
    input.affectedDimension ?? "overall",
    input.affectedSegment ?? "all",
    input.period.start,
    input.period.end,
  ]
    .join(":")
    .replace(/[^a-zA-Z0-9:_-]/gu, "_");
  return Object.freeze({
    ...input,
    findingId: id,
    ruleVersion: FINDINGS_RULESET_VERSION,
    evidenceStrength: strength,
    status: strength === "limited" ? "limited_evidence" : "current",
    materiality: materiality(
      input.exposureCents,
      input.evidence,
      input.shareBasisPoints ?? null,
      persistencePeriods,
    ),
    priority: priority(
      input.severity,
      input.exposureCents,
      input.percentageChangeBasisPoints,
      strength,
      persistencePeriods,
    ),
  });
}

function isMaterial(
  exposureCents: number | null,
  changeBasisPoints: number | null,
  configuration: FindingRuleConfiguration,
): boolean {
  return (
    (exposureCents ?? 0) >= configuration.minimumAbsoluteChangeCents ||
    Math.abs(changeBasisPoints ?? 0) >= configuration.minimumChangeBasisPoints
  );
}

function categoryForChange(direction: "increase" | "decrease"): FindingCategory {
  return direction === "decrease" ? "risk" : "opportunity";
}

function metricChangeFinding(
  ruleId: string,
  title: string,
  metricId: MetricId,
  result: MetricResult,
  category: FindingCategory,
  configuration: FindingRuleConfiguration,
  suppressions: FindingSuppression[],
): Finding | null {
  if (result.status !== "ok" || result.previousValue === null || result.absoluteChange === null) {
    suppressions.push({
      ruleId,
      reason: "insufficient_evidence",
      message: `${title} needs a complete comparable prior period.`,
    });
    return null;
  }
  const percentage = percentageChange(result);
  const exposure = absoluteExposure(result.absoluteChange);
  if (!isMaterial(exposure, percentage, configuration)) {
    suppressions.push({
      ruleId,
      reason: "immaterial",
      message: `${title} did not meet materiality.`,
    });
    return null;
  }
  const severity = severityFor(exposure, percentage);
  const direction = (percentage ?? 0) < 0 ? "declined" : "increased";
  return finding(
    {
      findingType: ruleId,
      title,
      summary: `${result.label} ${direction} versus the prior comparable period.`,
      explanation: `${result.label} changed by ${percentage === null ? "an uncomputed rate" : `${Math.abs(percentage / 100).toFixed(1)}%`} in the active filter context.`,
      category,
      severity,
      affectedMetric: metricId,
      affectedDimension: null,
      affectedSegment: null,
      currentValue: result.value,
      comparisonValue: result.previousValue,
      absoluteChange: result.absoluteChange,
      percentageChangeBasisPoints: percentage,
      period: result.currentPeriod,
      filterContext: result.filterContext,
      evidence: Object.freeze([result.evidence]),
      ruleId,
      thresholds: Object.freeze({
        minimumAbsoluteChangeCents: configuration.minimumAbsoluteChangeCents,
        minimumChangeBasisPoints: configuration.minimumChangeBasisPoints,
      }),
      exposureCents: exposure,
      comparisonSupported: true,
    },
    configuration,
  );
}

function segmentChangeFinding(
  entry: BreakdownEntry,
  dimension: BreakdownDimension,
  direction: "gain" | "loss",
  period: FilterContext["period"],
  filter: FilterContext,
  configuration: FindingRuleConfiguration,
): Finding | null {
  if (!entry.comparison || entry.comparison.percentageRevenueChange.kind !== "rate") return null;
  const change = entry.comparison.absoluteRevenueChange;
  if ((direction === "gain" && change <= 0) || (direction === "loss" && change >= 0)) return null;
  if (Math.abs(change) < configuration.minimumSegmentChangeCents) return null;
  const percentage = entry.comparison.percentageRevenueChange.basisPoints;
  return finding(
    {
      findingType: direction === "gain" ? "segment_revenue_gain" : "segment_revenue_loss",
      title: `${entry.label} ${direction === "gain" ? "gained" : "lost"} meaningful revenue`,
      summary: `${entry.label} ${direction === "gain" ? "increased" : "declined"} by ${Math.abs(percentage / 100).toFixed(1)}% versus the prior comparable period.`,
      explanation: `This ${dimension.replaceAll("_", " ")} changed revenue by ${(Math.abs(change) / 100).toFixed(2)} in the active filter context.`,
      category: direction === "gain" ? "opportunity" : "risk",
      severity: severityFor(Math.abs(change), percentage),
      affectedMetric: "total_revenue",
      affectedDimension: dimension,
      affectedSegment: entry.key,
      currentValue: Object.freeze({ kind: "money", cents: entry.revenue }),
      comparisonValue: Object.freeze({ kind: "money", cents: entry.comparison.previousRevenue }),
      absoluteChange: Object.freeze({ kind: "money", cents: change }),
      percentageChangeBasisPoints: percentage,
      period,
      filterContext: filter,
      evidence: Object.freeze([entry.evidence]),
      ruleId: direction === "gain" ? "segment-revenue-gain" : "segment-revenue-loss",
      thresholds: Object.freeze({
        minimumSegmentChangeCents: configuration.minimumSegmentChangeCents,
      }),
      exposureCents: Math.abs(change),
      shareBasisPoints: entry.revenueShare.kind === "rate" ? entry.revenueShare.basisPoints : null,
      comparisonSupported: true,
    },
    configuration,
  );
}

function deduplicate(
  findings: readonly Finding[],
  suppressions: FindingSuppression[],
): readonly Finding[] {
  const byKey = new Map<string, Finding>();
  for (const candidate of findings) {
    const key = [
      candidate.affectedMetric,
      candidate.affectedDimension,
      candidate.affectedSegment,
      candidate.period.start,
      candidate.period.end,
      candidate.findingType === "revenue_concentration" ? candidate.findingType : "movement",
    ].join(":");
    const current = byKey.get(key);
    if (
      !current ||
      candidate.priority > current.priority ||
      (candidate.priority === current.priority &&
        compareCodePoints(candidate.findingId, current.findingId) < 0)
    ) {
      if (current)
        suppressions.push({
          ruleId: current.ruleId,
          reason: "dominated",
          message: "A stronger equivalent finding was retained.",
        });
      byKey.set(key, candidate);
    } else {
      suppressions.push({
        ruleId: candidate.ruleId,
        reason: "dominated",
        message: "A stronger equivalent finding was retained.",
      });
    }
  }
  return Object.freeze(
    [...byKey.values()].sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      if (left.severity !== right.severity)
        return SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity];
      return compareCodePoints(left.findingId, right.findingId);
    }),
  );
}

function cacheKey(query: FindingsQuery): string {
  const filter = query.filter;
  return JSON.stringify({
    limit: query.limit ?? null,
    period: filter.period,
    timezone: filter.timezone ?? null,
    productIds: [...(filter.productIds ?? [])].sort(compareCodePoints),
    categories: [...(filter.categories ?? [])].sort(compareCodePoints),
    regions: [...(filter.regions ?? [])].sort(compareCodePoints),
    salesChannels: [...(filter.salesChannels ?? [])].sort(compareCodePoints),
    customerSegments: [...(filter.customerSegments ?? [])].sort(compareCodePoints),
    campaigns: [...(filter.campaigns ?? [])].sort(compareCodePoints),
    customerTypes: filter.customerTypes ?? null,
  });
}

/** Creates a dataset-bound deterministic findings facade over the supported analytics API. */
export function createFindingsEngine(
  analytics: AnalyticsEngine,
  dataset: ValidatedDataset,
  override: Partial<FindingRuleConfiguration> = {},
): FindingsEngine {
  const configuration = Object.freeze({ ...DEFAULT_FINDING_RULE_CONFIGURATION, ...override });
  const cache = new Map<string, FindingsResult>();
  return Object.freeze({
    engineVersion: FINDINGS_ENGINE_VERSION,
    ruleSetVersion: FINDINGS_RULESET_VERSION,
    generate: (query: FindingsQuery): FindingsResult => {
      const key = cacheKey(query);
      const cached = cache.get(key);
      if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return cached;
      }
      const started = typeof performance === "undefined" ? 0 : performance.now();
      const suppressions: FindingSuppression[] = [];
      const proposed: Finding[] = [];
      const metrics = analytics.metrics(query.filter);
      const filter = metrics.total_revenue.filterContext;
      const comparisons: readonly [MetricId, string, FindingCategory][] = [
        ["total_revenue", "Revenue change", "performance_change"],
        ["gross_profit", "Gross-profit change", "performance_change"],
        ["gross_margin", "Gross-margin change", "margin_issue"],
        ["marketing_roi", "Marketing ROI change", "marketing_signal"],
        ["repeat_customer_rate_within_selection", "Repeat-customer rate change", "customer_signal"],
      ];
      for (const [metricId, title, neutralCategory] of comparisons) {
        const response = analytics.comparison({
          metricId,
          filter: query.filter,
          comparison: COMPARISON,
        });
        if (response.status !== "ok") continue;
        const value = response.value;
        const change = percentageChange(value);
        if (change === null || change === 0) continue;
        const category =
          metricId === "gross_margin" || neutralCategory === "margin_issue"
            ? change < 0
              ? "margin_issue"
              : "opportunity"
            : categoryForChange(change < 0 ? "decrease" : "increase");
        const generated = metricChangeFinding(
          `${metricId}-${change < 0 ? "decline" : "growth"}`,
          title,
          metricId,
          value,
          category,
          configuration,
          suppressions,
        );
        if (generated) proposed.push(generated);
      }

      for (const dimension of ["category", "region", "channel", "product"] as const) {
        const concentration = analytics.concentration({
          dimension: dimension === "channel" ? "channel" : dimension,
          filter: query.filter,
        });
        if (
          concentration.status === "ok" &&
          concentration.value.status === "ok" &&
          concentration.value.topOne.share.basisPoints >=
            configuration.concentrationTopOneBasisPoints
        ) {
          const top = concentration.value.segments[0];
          if (
            top &&
            concentration.value.topOne.evidence.distinctOrderCount >=
              configuration.minimumSupportingOrders
          )
            proposed.push(
              finding(
                {
                  findingType: "revenue_concentration",
                  title: `${top.label} represents a concentrated share`,
                  summary: `${top.label} accounts for ${(concentration.value.topOne.share.basisPoints / 100).toFixed(1)}% of revenue in the active selection.`,
                  explanation: `This is a descriptive revenue-concentration signal, not a universal risk classification.`,
                  category: "concentration",
                  severity:
                    concentration.value.topOne.share.basisPoints >= 6_000 ? "high" : "medium",
                  affectedMetric: "total_revenue",
                  affectedDimension: dimension,
                  affectedSegment: top.key,
                  currentValue: Object.freeze({
                    kind: "rate",
                    ratio: concentration.value.topOne.share.ratio,
                    basisPoints: concentration.value.topOne.share.basisPoints,
                  }),
                  comparisonValue: null,
                  absoluteChange: null,
                  percentageChangeBasisPoints: null,
                  period: concentration.value.currentPeriod,
                  filterContext: concentration.value.filterContext,
                  evidence: Object.freeze([concentration.value.topOne.evidence]),
                  ruleId: "revenue-concentration",
                  thresholds: Object.freeze({
                    concentrationTopOneBasisPoints: configuration.concentrationTopOneBasisPoints,
                  }),
                  exposureCents: concentration.value.topOne.revenue,
                  shareBasisPoints: concentration.value.topOne.share.basisPoints,
                },
                configuration,
              ),
            );
          else if (top)
            suppressions.push({
              ruleId: "revenue-concentration",
              reason: "insufficient_evidence",
              message: `${top.label} does not meet the minimum supporting-order requirement for a concentration finding.`,
            });
        }
        const response = analytics.breakdown({
          dimension,
          filter: query.filter,
          comparison: COMPARISON,
          sortBy: "revenue",
        });
        if (response.status !== "ok" || response.value.status !== "ok") continue;
        const entries = response.value.entries;
        const losses = entries
          .filter((entry) => entry.comparison && entry.comparison.absoluteRevenueChange < 0)
          .sort(
            (a, b) => a.comparison!.absoluteRevenueChange - b.comparison!.absoluteRevenueChange,
          );
        const gains = entries
          .filter((entry) => entry.comparison && entry.comparison.absoluteRevenueChange > 0)
          .sort(
            (a, b) => b.comparison!.absoluteRevenueChange - a.comparison!.absoluteRevenueChange,
          );
        const loss = losses[0];
        const gain = gains[0];
        if (loss) {
          const generated = segmentChangeFinding(
            loss,
            dimension,
            "loss",
            response.value.currentPeriod,
            response.value.filterContext,
            configuration,
          );
          if (generated) proposed.push(generated);
        }
        if (gain) {
          const generated = segmentChangeFinding(
            gain,
            dimension,
            "gain",
            response.value.currentPeriod,
            response.value.filterContext,
            configuration,
          );
          if (generated) proposed.push(generated);
        }
      }

      const margins = analytics.marginDiagnostics({ filter: query.filter });
      if (margins.status === "ok" && margins.value.status === "ok") {
        for (const product of margins.value.aggregateNegativeProducts) {
          proposed.push(
            finding(
              {
                findingType: "aggregate_negative_margin_product",
                title: `${product.productName} has negative aggregate margin`,
                summary: `${product.productName} produced negative gross profit in the active selection.`,
                explanation: `The signal is based on aggregate product revenue and line-level cost, not a causal explanation.`,
                category: "margin_issue",
                severity: "high",
                affectedMetric: "gross_profit",
                affectedDimension: "product",
                affectedSegment: product.productId,
                currentValue: Object.freeze({ kind: "money", cents: product.grossProfit }),
                comparisonValue: null,
                absoluteChange: null,
                percentageChangeBasisPoints: null,
                period: margins.value.currentPeriod,
                filterContext: margins.value.filterContext,
                evidence: Object.freeze([product.evidence]),
                ruleId: "aggregate-negative-margin-product",
                thresholds: Object.freeze({ aggregateNegative: true }),
                exposureCents: Math.abs(product.grossProfit),
                shareBasisPoints:
                  product.grossMargin.kind === "rate" ? product.grossMargin.basisPoints : null,
              },
              configuration,
            ),
          );
        }
        for (const product of margins.value.productsWithAnyNegativeRows) {
          if (product.negativeMarginRowCount === 0) continue;
          proposed.push(
            finding(
              {
                findingType: "repeated-negative-margin-rows",
                title: `${product.productName} has negative-margin rows`,
                summary: `${product.negativeMarginRowCount} order lines for ${product.productName} had negative gross profit.`,
                explanation: `This does not establish why individual rows were unprofitable.`,
                category: "margin_issue",
                severity: "medium",
                affectedMetric: "gross_profit",
                affectedDimension: "product",
                affectedSegment: product.productId,
                currentValue: Object.freeze({
                  kind: "count",
                  value: product.negativeMarginRowCount,
                }),
                comparisonValue: null,
                absoluteChange: null,
                percentageChangeBasisPoints: null,
                period: margins.value.currentPeriod,
                filterContext: margins.value.filterContext,
                evidence: Object.freeze([product.evidence]),
                ruleId: "repeated-negative-margin-rows",
                thresholds: Object.freeze({ minimumNegativeRows: 1 }),
                exposureCents: Math.abs(product.grossProfit),
              },
              configuration,
            ),
          );
        }
        if (!Array.isArray(margins.value.highRevenueLowMarginProducts)) {
          // The diagnostic explicitly distinguishes unavailable high-revenue comparisons.
        } else
          for (const product of margins.value.highRevenueLowMarginProducts) {
            proposed.push(
              finding(
                {
                  findingType: "high-revenue-low-margin-product",
                  title: `${product.productName} combines revenue with a low margin`,
                  summary: `${product.productName} meets the configured high-revenue and low-margin diagnostic rules.`,
                  explanation: `This is a descriptive margin profile in the active filter context.`,
                  category: "margin_issue",
                  severity: "medium",
                  affectedMetric: "gross_margin",
                  affectedDimension: "product",
                  affectedSegment: product.productId,
                  currentValue: product.grossMargin.kind === "rate" ? product.grossMargin : null,
                  comparisonValue: null,
                  absoluteChange: null,
                  percentageChangeBasisPoints: null,
                  period: margins.value.currentPeriod,
                  filterContext: margins.value.filterContext,
                  evidence: Object.freeze([product.evidence]),
                  ruleId: "high-revenue-low-margin-product",
                  thresholds: Object.freeze({ configuredDiagnostic: "high-revenue-low-margin" }),
                  exposureCents: product.revenue,
                },
                configuration,
              ),
            );
          }
      }

      const regionalTrend = analytics.trendContributions({
        filter: query.filter,
        comparison: COMPARISON,
        dimension: "region",
        frequency: "monthly",
        contributorLimit: 1,
      });
      if (regionalTrend.status === "ok" && regionalTrend.value.status === "ok") {
        const trend = regionalTrend.value;
        const negative = trend.largestNegativeContributors[0];
        const positive = trend.largestPositiveContributors[0];
        if (
          negative &&
          Math.abs(negative.absoluteChange) >= configuration.minimumSegmentChangeCents
        ) {
          proposed.push(
            finding(
              {
                findingType: "largest-negative-contributor",
                title: `${negative.label} is the largest negative contributor`,
                summary: `${negative.label} made the largest negative contribution to revenue change in the active comparison.`,
                explanation:
                  "Contribution describes the measured revenue change; it does not establish causation.",
                category: "risk",
                severity: severityFor(Math.abs(negative.absoluteChange), null),
                affectedMetric: "total_revenue",
                affectedDimension: "region",
                affectedSegment: negative.key,
                currentValue: Object.freeze({ kind: "money", cents: negative.currentRevenue }),
                comparisonValue: Object.freeze({ kind: "money", cents: negative.previousRevenue }),
                absoluteChange: Object.freeze({ kind: "money", cents: negative.absoluteChange }),
                percentageChangeBasisPoints: null,
                period: trend.currentPeriod,
                filterContext: trend.filterContext,
                evidence: Object.freeze([negative.evidence]),
                ruleId: "largest-negative-contributor",
                thresholds: Object.freeze({
                  minimumSegmentChangeCents: configuration.minimumSegmentChangeCents,
                }),
                exposureCents: Math.abs(negative.absoluteChange),
                comparisonSupported: true,
              },
              configuration,
            ),
          );
        }
        if (positive && positive.absoluteChange >= configuration.minimumSegmentChangeCents) {
          proposed.push(
            finding(
              {
                findingType: "largest-positive-contributor",
                title: `${positive.label} is the largest positive contributor`,
                summary: `${positive.label} made the largest positive contribution to revenue change in the active comparison.`,
                explanation:
                  "Contribution describes the measured revenue change; it does not establish causation.",
                category: "opportunity",
                severity: severityFor(positive.absoluteChange, null),
                affectedMetric: "total_revenue",
                affectedDimension: "region",
                affectedSegment: positive.key,
                currentValue: Object.freeze({ kind: "money", cents: positive.currentRevenue }),
                comparisonValue: Object.freeze({ kind: "money", cents: positive.previousRevenue }),
                absoluteChange: Object.freeze({ kind: "money", cents: positive.absoluteChange }),
                percentageChangeBasisPoints: null,
                period: trend.currentPeriod,
                filterContext: trend.filterContext,
                evidence: Object.freeze([positive.evidence]),
                ruleId: "largest-positive-contributor",
                thresholds: Object.freeze({
                  minimumSegmentChangeCents: configuration.minimumSegmentChangeCents,
                }),
                exposureCents: positive.absoluteChange,
                comparisonSupported: true,
              },
              configuration,
            ),
          );
        }
        if (trend.consecutiveDecline.latestRun >= 2) {
          proposed.push(
            finding(
              {
                findingType: "consecutive-revenue-decline",
                title: "Revenue declined across consecutive monthly buckets",
                summary: `Revenue declined for ${trend.consecutiveDecline.latestRun} consecutive month-to-month movements in the active period.`,
                explanation:
                  "Persistence is descriptive and is limited to the available monthly series.",
                category: "performance_change",
                severity: trend.consecutiveDecline.latestRun >= 3 ? "high" : "medium",
                affectedMetric: "total_revenue",
                affectedDimension: null,
                affectedSegment: null,
                currentValue: Object.freeze({ kind: "money", cents: trend.currentRevenue }),
                comparisonValue: Object.freeze({ kind: "money", cents: trend.previousRevenue }),
                absoluteChange: Object.freeze({ kind: "money", cents: trend.absoluteChange }),
                percentageChangeBasisPoints:
                  trend.percentageChange.kind === "rate"
                    ? trend.percentageChange.basisPoints
                    : null,
                period: trend.currentPeriod,
                filterContext: trend.filterContext,
                evidence: Object.freeze([trend.evidence]),
                ruleId: "consecutive-revenue-decline",
                thresholds: Object.freeze({ minimumConsecutiveDeclines: 2 }),
                exposureCents: Math.abs(trend.absoluteChange),
                persistencePeriods: trend.consecutiveDecline.latestRun,
                comparisonSupported: true,
              },
              configuration,
            ),
          );
        }
      }

      const spend = money(metricValue(metrics.total_marketing_spend));
      const roi = rateBasisPoints(metricValue(metrics.marketing_roi));
      if (
        spend !== null &&
        roi !== null &&
        spend >= configuration.minimumMarketingSpendCents &&
        roi <= configuration.weakMarketingRoiBasisPoints
      ) {
        proposed.push(
          finding(
            {
              findingType: "high-spend-weak-marketing-contribution",
              title: "Marketing spend has weak measured contribution",
              summary:
                "Marketing spend meets the project materiality threshold while the descriptive ROI is at or below the configured threshold.",
              explanation:
                "Marketing contribution and ROI are descriptive allocation metrics; they do not imply causal attribution.",
              category: "efficiency_issue",
              severity: "medium",
              affectedMetric: "marketing_roi",
              affectedDimension: null,
              affectedSegment: null,
              currentValue: metricValue(metrics.marketing_roi),
              comparisonValue: null,
              absoluteChange: null,
              percentageChangeBasisPoints: null,
              period: filter.period,
              filterContext: filter,
              evidence: Object.freeze([
                metrics.marketing_roi.evidence,
                metrics.total_marketing_spend.evidence,
              ]),
              ruleId: "high-spend-weak-marketing-contribution",
              thresholds: Object.freeze({
                minimumMarketingSpendCents: configuration.minimumMarketingSpendCents,
                weakMarketingRoiBasisPoints: configuration.weakMarketingRoiBasisPoints,
              }),
              exposureCents: spend,
            },
            configuration,
          ),
        );
      }

      for (const frequency of ["daily", "weekly"] as const) {
        const anomalies = analytics.anomalies({
          filter: query.filter,
          configuration: { frequency },
        });
        if (anomalies.status !== "ok" || anomalies.value.status !== "ok") continue;
        const includedDirections = new Set<"spike" | "drop">();
        for (const anomaly of anomalies.value.findings) {
          if (includedDirections.has(anomaly.direction)) continue;
          includedDirections.add(anomaly.direction);
          proposed.push(
            finding(
              {
                findingType:
                  anomaly.direction === "spike" ? "unusual-revenue-spike" : "unusual-revenue-drop",
                title:
                  anomaly.direction === "spike" ? "Unusual revenue spike" : "Unusual revenue drop",
                summary: anomaly.description,
                explanation: `The engine compared this ${frequency} bucket with its documented robust trailing baseline.`,
                category: "anomaly",
                severity: anomaly.direction === "drop" ? "high" : "medium",
                affectedMetric: "total_revenue",
                affectedDimension: null,
                affectedSegment: anomaly.bucket.period.start,
                currentValue: Object.freeze({ kind: "money", cents: anomaly.bucket.revenue }),
                comparisonValue: null,
                absoluteChange: null,
                percentageChangeBasisPoints: null,
                period: anomaly.bucket.period,
                filterContext: anomalies.value.filterContext,
                evidence: Object.freeze([anomaly.evidence]),
                ruleId:
                  anomaly.direction === "spike" ? "unusual-revenue-spike" : "unusual-revenue-drop",
                thresholds: Object.freeze({ frequency, method: anomaly.baseline.method }),
                exposureCents: anomaly.bucket.revenue,
              },
              configuration,
            ),
          );
        }
      }

      if (dataset.dataQuality.warningCount > 0 || dataset.dataQuality.rejectedRowCount > 0) {
        proposed.push(
          finding(
            {
              findingType: "data-quality-caveat",
              title: "Data-quality limitations remain visible",
              summary: `${dataset.dataQuality.warningCount} validation warnings and ${dataset.dataQuality.rejectedRowCount} rejected rows are recorded for this dataset.`,
              explanation: `This limits interpretation where the documented validation warnings apply.`,
              category: "data_quality_limitation",
              severity: "informational",
              affectedMetric: null,
              affectedDimension: MISSING_DIMENSION_KEY,
              affectedSegment: null,
              currentValue: Object.freeze({
                kind: "count",
                value: dataset.dataQuality.warningCount + dataset.dataQuality.rejectedRowCount,
              }),
              comparisonValue: null,
              absoluteChange: null,
              percentageChangeBasisPoints: null,
              period: filter.period,
              filterContext: filter,
              evidence: Object.freeze([metrics.total_revenue.evidence]),
              ruleId: "data-quality-caveat",
              thresholds: Object.freeze({
                warnings: dataset.dataQuality.warningCount,
                rejectedRows: dataset.dataQuality.rejectedRowCount,
              }),
              exposureCents: null,
            },
            configuration,
          ),
        );
      }

      const ranked = deduplicate(proposed, suppressions);
      const limit =
        query.limit === undefined
          ? ranked.length
          : Math.max(0, Math.min(query.limit, configuration.maximumVisibleFindings));
      const result = Object.freeze({
        engineVersion: FINDINGS_ENGINE_VERSION,
        ruleSetVersion: FINDINGS_RULESET_VERSION,
        filterContext: filter,
        findings: Object.freeze(ranked.slice(0, limit)),
        suppressed: Object.freeze(suppressions),
        generatedInMs: typeof performance === "undefined" ? 0 : performance.now() - started,
      });
      cache.set(key, result);
      if (cache.size > 8) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      return result;
    },
  });
}
