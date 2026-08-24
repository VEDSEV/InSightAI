import { createHash } from "node:crypto";
import {
  AI_EXPLANATION_SCHEMA_VERSION,
  AI_PROMPT_VERSION,
  type AiExplanation,
  type AiServiceResult,
  type EvidencePacket,
} from "./types";
import { createConfiguredProvider, type AiProvider, ProviderFailure } from "./provider";
import { parseExplanationDraft, validateGrounding } from "./validation";

const cache = new Map<string, AiExplanation>();
const MAX_CACHE_ENTRIES = 12;

function cacheKey(packet: EvidencePacket, provider: AiProvider): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        datasetFingerprint: packet.datasetFingerprint,
        findingId: packet.finding.findingId,
        findingAndEvidence: packet,
        normalizedFilterContext: packet.finding.filterContext,
        promptVersion: AI_PROMPT_VERSION,
        schemaVersion: AI_EXPLANATION_SCHEMA_VERSION,
        provider: provider.kind,
        model: provider.model,
      }),
    )
    .digest("hex");
}

function putCache(key: string, explanation: AiExplanation): void {
  cache.set(key, explanation);
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
}

export function clearExplanationCache(): void {
  cache.clear();
}

/** Server-only bounded cache: only immutable packet + provider identity can reuse an explanation. */
export async function explainEvidencePacket(
  packet: EvidencePacket,
  provider = createConfiguredProvider(),
): Promise<AiServiceResult> {
  const key = cacheKey(packet, provider);
  const cached = cache.get(key);
  if (cached) return Object.freeze({ status: "ok", value: cached, cached: true });
  try {
    const draft = parseExplanationDraft(await provider.generate(packet));
    if (!draft)
      return Object.freeze({
        status: "invalid",
        message: "The AI provider returned an invalid structured response.",
      });
    const explanation = Object.freeze({
      ...draft,
      provider: provider.kind,
      model: provider.model,
      promptVersion: AI_PROMPT_VERSION,
    });
    const failure = validateGrounding(packet, explanation);
    if (failure) return Object.freeze({ status: "invalid", message: failure });
    putCache(key, explanation);
    return Object.freeze({ status: "ok", value: explanation, cached: false });
  } catch (error) {
    if (error instanceof ProviderFailure)
      return Object.freeze({ status: error.kind, message: error.message });
    return Object.freeze({
      status: "unavailable",
      message: "AI explanation is unavailable. Your deterministic finding remains available.",
    });
  }
}
