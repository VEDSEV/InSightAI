import type {
  EvidenceReference,
  FilterContext,
  MetricId,
  MetricValue,
} from "../analytics/index.ts";

export const FINDINGS_ENGINE_VERSION = "1.0.0";
export const FINDINGS_RULESET_VERSION = "findings-rules-v1";

export type FindingCategory =
  | "risk"
  | "opportunity"
  | "performance_change"
  | "efficiency_issue"
  | "concentration"
  | "margin_issue"
  | "customer_signal"
  | "marketing_signal"
  | "anomaly"
  | "data_quality_limitation"
  | "informational";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "informational";
export type FindingEvidenceStrength = "strong" | "moderate" | "limited";
export type FindingStatus = "current" | "limited_evidence";

export type FindingMateriality = Readonly<{
  absoluteExposureCents: number | null;
  affectedRevenueShareBasisPoints: number | null;
  supportingOrderCount: number;
  persistencePeriods: number;
}>;

export type FindingThresholds = Readonly<Record<string, number | string | boolean>>;

export type Finding = Readonly<{
  findingId: string;
  findingType: string;
  title: string;
  summary: string;
  explanation: string;
  category: FindingCategory;
  severity: FindingSeverity;
  priority: number;
  evidenceStrength: FindingEvidenceStrength;
  status: FindingStatus;
  affectedMetric: MetricId | null;
  affectedDimension: string | null;
  affectedSegment: string | null;
  currentValue: MetricValue | null;
  comparisonValue: MetricValue | null;
  absoluteChange: MetricValue | null;
  percentageChangeBasisPoints: number | null;
  materiality: FindingMateriality;
  period: FilterContext["period"];
  filterContext: FilterContext;
  evidence: readonly EvidenceReference[];
  ruleId: string;
  ruleVersion: string;
  thresholds: FindingThresholds;
}>;

export type FindingSuppression = Readonly<{
  ruleId: string;
  reason: "insufficient_evidence" | "invalid_denominator" | "immaterial" | "dominated";
  message: string;
}>;

export type FindingsResult = Readonly<{
  engineVersion: string;
  ruleSetVersion: string;
  filterContext: FilterContext;
  findings: readonly Finding[];
  suppressed: readonly FindingSuppression[];
  generatedInMs: number;
}>;

export type FindingsQuery = Readonly<{
  filter: import("../analytics/index.ts").FilterContextInput;
  limit?: number;
}>;

export type FindingRuleConfiguration = Readonly<{
  minimumAbsoluteChangeCents: number;
  minimumSegmentChangeCents: number;
  minimumChangeBasisPoints: number;
  concentrationTopOneBasisPoints: number;
  weakMarketingRoiBasisPoints: number;
  minimumMarketingSpendCents: number;
  minimumSupportingOrders: number;
  maximumVisibleFindings: number;
}>;

export type FindingsEngine = Readonly<{
  engineVersion: string;
  ruleSetVersion: string;
  generate: (query: FindingsQuery) => FindingsResult;
}>;
