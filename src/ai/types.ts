import type { Finding } from "@/findings";

export const AI_PROMPT_VERSION = "ai-explain-v1";
export const AI_EVIDENCE_PACKET_VERSION = "1.0.0";
export const AI_EXPLANATION_SCHEMA_VERSION = "1.0.0";
export const MAX_EVIDENCE_PACKET_BYTES = 18_000;

export type EvidencePacket = Readonly<{
  version: typeof AI_EVIDENCE_PACKET_VERSION;
  /** Immutable source fingerprint, not a display label; prevents cache reuse across uploaded datasets. */
  datasetFingerprint: string;
  finding: Pick<
    Finding,
    | "findingId"
    | "ruleId"
    | "ruleVersion"
    | "findingType"
    | "category"
    | "severity"
    | "priority"
    | "summary"
    | "explanation"
    | "evidenceStrength"
    | "affectedMetric"
    | "affectedDimension"
    | "affectedSegment"
    | "currentValue"
    | "comparisonValue"
    | "absoluteChange"
    | "percentageChangeBasisPoints"
    | "materiality"
    | "period"
    | "filterContext"
  >;
  evidence: readonly Readonly<{
    evidenceId: string;
    matchingRowCount: number;
    distinctOrderCount: number;
    affectedDateBuckets: readonly string[];
    segmentKeys: readonly string[];
    numerator: Finding["evidence"][number]["numerator"];
    denominator: Finding["evidence"][number]["denominator"];
    metricDependencies: readonly string[];
  }>[];
  limitations: readonly string[];
  allowedRecommendationScope: readonly string[];
}>;

export type RecommendedAction = Readonly<{
  action: string;
  rationale: string;
  expectedDirection: "investigate" | "monitor" | "compare" | "protect" | "validate";
  priority: "high" | "medium" | "low";
  supportingEvidenceIds: readonly string[];
  prerequisitesOrConstraints: string;
  confidence: "limited" | "moderate";
}>;

export type AiExplanation = Readonly<{
  findingId: string;
  verifiedFact: string;
  interpretation: string;
  recommendedActions: readonly RecommendedAction[];
  questionsToInvestigate: readonly string[];
  assumptions: readonly string[];
  limitations: readonly string[];
  confidenceLanguage: string;
  evidenceReferences: readonly string[];
  provider: "mock" | "openai";
  model: string;
  promptVersion: typeof AI_PROMPT_VERSION;
}>;

/** The strict provider contract before trusted provider metadata is attached server-side. */
export type AiExplanationDraft = Omit<AiExplanation, "provider" | "model" | "promptVersion">;

export type AiProviderKind = "mock" | "openai";

export type AiServiceResult =
  | Readonly<{ status: "ok"; value: AiExplanation; cached: boolean }>
  | Readonly<{
      status:
        "unavailable" | "invalid" | "rate_limited" | "timeout" | "refused" | "consent_required";
      message: string;
    }>;
