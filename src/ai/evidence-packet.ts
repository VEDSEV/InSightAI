import type { Finding } from "@/findings";
import {
  AI_EXPLANATION_SCHEMA_VERSION,
  AI_EVIDENCE_PACKET_VERSION,
  AI_PROMPT_VERSION,
  type EvidencePacket,
} from "./types";

const ALLOWED_RECOMMENDATIONS = Object.freeze([
  "Investigate",
  "Monitor",
  "Compare",
  "Review allocation",
  "Audit",
  "Test",
  "Protect strength",
  "Reduce exposure cautiously",
  "Validate data",
]);

/** Removes source IDs and arbitrary source fields before any provider can be invoked. */
export function createEvidencePacket(datasetFingerprint: string, finding: Finding): EvidencePacket {
  return Object.freeze({
    version: AI_EVIDENCE_PACKET_VERSION,
    datasetFingerprint,
    finding: {
      findingId: finding.findingId,
      ruleId: finding.ruleId,
      ruleVersion: finding.ruleVersion,
      findingType: finding.findingType,
      category: finding.category,
      severity: finding.severity,
      priority: finding.priority,
      summary: finding.summary,
      explanation: finding.explanation,
      evidenceStrength: finding.evidenceStrength,
      affectedMetric: finding.affectedMetric,
      affectedDimension: finding.affectedDimension,
      affectedSegment: finding.affectedSegment,
      currentValue: finding.currentValue,
      comparisonValue: finding.comparisonValue,
      absoluteChange: finding.absoluteChange,
      percentageChangeBasisPoints: finding.percentageChangeBasisPoints,
      materiality: finding.materiality,
      period: finding.period,
      filterContext: finding.filterContext,
    },
    evidence: Object.freeze(
      finding.evidence.map((item) =>
        Object.freeze({
          evidenceId: item.evidenceId,
          matchingRowCount: item.matchingRowCount,
          distinctOrderCount: item.distinctOrderCount,
          affectedDateBuckets: item.affectedDateBuckets.map(
            (bucket) => `${bucket.start}/${bucket.end}`,
          ),
          segmentKeys: item.segmentKeys,
          numerator: item.numerator,
          denominator: item.denominator,
          metricDependencies: item.metricDependencies,
        }),
      ),
    ),
    limitations: Object.freeze([
      "This interpretation is advisory. The available data does not establish causation.",
    ]),
    allowedRecommendationScope: ALLOWED_RECOMMENDATIONS,
  });
}

/** Browser-safe deterministic identity for every input that may change a visible explanation. */
export function createExplanationContextKey(packet: EvidencePacket): string {
  const serialized = JSON.stringify({
    packet,
    promptVersion: AI_PROMPT_VERSION,
    schemaVersion: AI_EXPLANATION_SCHEMA_VERSION,
  });
  let hash = 2_166_136_261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `ai-explanation-${(hash >>> 0).toString(16)}`;
}
