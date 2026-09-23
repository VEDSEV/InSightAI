import type { EvidenceReference } from "@/analytics";

export const GUIDED_AI_ANALYST_VERSION = "1.0.0";

export type AnalystIntent =
  | "business_overview"
  | "priority"
  | "going_well"
  | "sales_decline"
  | "sales_increase"
  | "most_money"
  | "least_money"
  | "best_product"
  | "worst_product"
  | "best_channel"
  | "region_performance"
  | "recent_changes"
  | "unusual_activity"
  | "improvement";

export type AnalystDimension = "product" | "category" | "region" | "channel";
export type AnalystMetric = "revenue" | "gross_profit" | "gross_margin" | "quantity" | null;

export type ResolvedEntity = Readonly<{
  dimension: AnalystDimension;
  key: string;
  label: string;
}>;

export type SupportedClassification = Readonly<{
  status: "supported";
  intent: AnalystIntent;
  confidence: "high" | "medium";
  entities: readonly ResolvedEntity[];
  requestedMetric: AnalystMetric;
  followUpReference: "none" | "prior_answer";
  followUpKind: "none" | "why" | "risk" | "evidence" | "entity";
  referenceEvidenceId?: string | null;
}>;

export type ClarificationClassification = Readonly<{
  status: "clarification";
  message: string;
  suggestions: readonly string[];
}>;

export type UnsupportedClassification = Readonly<{
  status: "unsupported";
  message: string;
  suggestions: readonly string[];
}>;

export type AnalystClassification =
  SupportedClassification | ClarificationClassification | UnsupportedClassification;

export type AnalystPlan = Readonly<{
  intent: AnalystIntent;
  kind:
    | "overview"
    | "findings_priority"
    | "ranked_breakdown"
    | "period_comparison"
    | "anomaly_lookup"
    | "margin_analysis";
  dimension: AnalystDimension | null;
  metric: AnalystMetric;
  entities: readonly ResolvedEntity[];
  followUpKind: SupportedClassification["followUpKind"];
  referenceEvidenceId: string | null;
}>;

/**
 * A response status deliberately distinguishes a verified empty result from unavailable data or a
 * safety failure. A founder can safely receive “none found” without it being treated as an error.
 */
export type AnalystAnswerStatus =
  | "answer"
  | "no_matches"
  | "insufficient_data"
  | "clarification"
  | "unsupported"
  | "grounding_failure"
  | "analysis_failure";

export type AnalystAnswer = Readonly<{
  status: AnalystAnswerStatus;
  intent: AnalystIntent | null;
  directAnswer: string;
  supportingFact: string | null;
  whatItMeans: string | null;
  nextStep: string | null;
  contextLabel: string;
  evidence: EvidenceReference | null;
  evidenceTitle: string;
  evidenceDescription: string;
  referencedEntities: readonly ResolvedEntity[];
  suggestedQuestions: readonly string[];
  explore: Readonly<{ dimension: AnalystDimension; value: string }> | null;
  limitations: readonly string[];
}>;

export type AnalystConversationContext = Readonly<{
  datasetFingerprint: string;
  filterKey: string;
  lastAnswer: AnalystAnswer | null;
}>;
