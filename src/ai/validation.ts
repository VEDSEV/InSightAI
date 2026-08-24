import {
  MAX_EVIDENCE_PACKET_BYTES,
  type AiExplanation,
  type AiExplanationDraft,
  type EvidencePacket,
} from "./types";

const CAUSAL_OR_CERTAIN =
  /\b(because of|because|caused|will result in|will increase|will decrease|guarantee(?:d)?|definitely|certainly)\b/iu;
const NUMBER = /\d+(?:[,.]\d+)?%?/gu;
const RECOMMENDATION_VERB =
  /^(investigate|review|compare|audit|monitor|test|validate|protect|evaluate|reduce)\b/iu;
const PROHIBITED_RECOMMENDATION =
  /\b(guarantee|increase revenue|exact roi|hire|fire|terminate|legal|deceive|manipulat|forecast)\b/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown, maximum = 8): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every((item) => typeof item === "string")
  );
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isBoundedStringArray(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): value is string[] {
  return (
    isStringArray(value, maximumItems) &&
    value.every((item) => isBoundedString(item, maximumLength))
  );
}

function hasOnlyKeys(value: unknown, allowed: readonly string[]): boolean {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

export function validateEvidencePacket(value: unknown): value is EvidencePacket {
  if (!value || typeof value !== "object") return false;
  const packet = value as Partial<EvidencePacket>;
  const packetBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  return (
    packet.version === "1.0.0" &&
    typeof packet.datasetFingerprint === "string" &&
    hasOnlyKeys(packet.finding, [
      "findingId",
      "ruleId",
      "ruleVersion",
      "findingType",
      "category",
      "severity",
      "priority",
      "summary",
      "explanation",
      "evidenceStrength",
      "affectedMetric",
      "affectedDimension",
      "affectedSegment",
      "currentValue",
      "comparisonValue",
      "absoluteChange",
      "percentageChangeBasisPoints",
      "materiality",
      "period",
      "filterContext",
    ]) &&
    Boolean(packet.finding?.findingId) &&
    Array.isArray(packet.evidence) &&
    packet.evidence.length > 0 &&
    packet.evidence.every(
      (item) =>
        hasOnlyKeys(item, [
          "evidenceId",
          "matchingRowCount",
          "distinctOrderCount",
          "affectedDateBuckets",
          "segmentKeys",
          "numerator",
          "denominator",
          "metricDependencies",
        ]) && typeof item.evidenceId === "string",
    ) &&
    packetBytes <= MAX_EVIDENCE_PACKET_BYTES
  );
}

/** Checks the strict provider shape before any generated text reaches grounding checks. */
export function parseExplanationDraft(value: unknown): AiExplanationDraft | null {
  if (!isRecord(value)) return null;
  const allowed = new Set([
    "findingId",
    "verifiedFact",
    "interpretation",
    "recommendedActions",
    "questionsToInvestigate",
    "assumptions",
    "limitations",
    "confidenceLanguage",
    "evidenceReferences",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (
    !isBoundedString(value.findingId, 120) ||
    !isBoundedString(value.verifiedFact, 800) ||
    !isBoundedString(value.interpretation, 1_000) ||
    !isBoundedString(value.confidenceLanguage, 300) ||
    !isBoundedStringArray(value.questionsToInvestigate, 4, 400) ||
    !isBoundedStringArray(value.assumptions, 4, 400) ||
    !isBoundedStringArray(value.limitations, 4, 400) ||
    !isBoundedStringArray(value.evidenceReferences, 8, 120)
  )
    return null;
  if (!Array.isArray(value.recommendedActions) || value.recommendedActions.length > 3) return null;
  if (
    value.assumptions.length === 0 ||
    value.limitations.length === 0 ||
    value.evidenceReferences.length === 0
  )
    return null;
  if (
    !value.recommendedActions.every((action) => {
      if (!isRecord(action)) return false;
      const actionKeys = [
        "action",
        "rationale",
        "expectedDirection",
        "priority",
        "supportingEvidenceIds",
        "prerequisitesOrConstraints",
        "confidence",
      ];
      return (
        Object.keys(action).length === actionKeys.length &&
        actionKeys.every((key) => key in action) &&
        isBoundedString(action.action, 280) &&
        isBoundedString(action.rationale, 500) &&
        ["investigate", "monitor", "compare", "protect", "validate"].includes(
          String(action.expectedDirection),
        ) &&
        ["high", "medium", "low"].includes(String(action.priority)) &&
        isBoundedStringArray(action.supportingEvidenceIds, 8, 120) &&
        isBoundedString(action.prerequisitesOrConstraints, 500) &&
        ["limited", "moderate"].includes(String(action.confidence))
      );
    })
  )
    return null;
  return value as unknown as AiExplanationDraft;
}

function allowedNumericalTokens(packet: EvidencePacket): Set<string> {
  const text = JSON.stringify({
    summary: packet.finding.summary,
    explanation: packet.finding.explanation,
    period: packet.finding.period,
    evidence: packet.evidence,
  });
  return new Set(text.match(NUMBER) ?? []);
}

function unsupportedNumbers(packet: EvidencePacket, text: string): boolean {
  const allowed = allowedNumericalTokens(packet);
  return [...text.matchAll(NUMBER)].some((match) => !allowed.has(match[0]));
}

/** Rejects free-form numeric facts and unsupported citations rather than attempting to repair them. */
export function validateGrounding(
  packet: EvidencePacket,
  explanation: AiExplanation,
): string | null {
  const allowedIds = new Set(packet.evidence.map((item) => item.evidenceId));
  if (explanation.findingId !== packet.finding.findingId)
    return "The explanation refers to another finding.";
  if (!explanation.evidenceReferences.every((id) => allowedIds.has(id)))
    return "The explanation cites unavailable evidence.";
  if (explanation.verifiedFact !== packet.finding.summary)
    return "The explanation changes the deterministic finding fact.";
  if (explanation.limitations.length === 0 || explanation.assumptions.length === 0)
    return "The explanation must include assumptions and limitations.";
  const generatedText = [
    explanation.interpretation,
    ...explanation.recommendedActions.flatMap((action) => [action.action, action.rationale]),
    ...explanation.questionsToInvestigate,
  ].join(" ");
  if (unsupportedNumbers(packet, generatedText))
    return "The explanation introduces an unsupported numerical claim.";
  if (CAUSAL_OR_CERTAIN.test(generatedText))
    return "The explanation makes an unsupported causal or certain claim.";
  if (
    explanation.recommendedActions.some(
      (action) => !action.supportingEvidenceIds.every((id) => allowedIds.has(id)),
    )
  )
    return "A suggested action cites unavailable evidence.";
  if (
    explanation.recommendedActions.some(
      (action) =>
        !RECOMMENDATION_VERB.test(action.action) || PROHIBITED_RECOMMENDATION.test(action.action),
    )
  )
    return "The explanation includes an unsupported recommendation.";
  return null;
}
