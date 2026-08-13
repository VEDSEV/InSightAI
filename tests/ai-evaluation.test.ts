import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { createEvidencePacket } from "@/ai/evidence-packet";
import { ProviderFailure, type AiProvider } from "@/ai/provider";
import { clearExplanationCache, explainEvidencePacket } from "@/ai/service";
import { parseExplanationDraft, validateGrounding } from "@/ai/validation";
import type { Finding } from "@/findings";

const baseFinding = {
  findingId: "eval-finding",
  ruleId: "evaluation-rule",
  ruleVersion: "v1",
  findingType: "trend",
  category: "risk",
  severity: "medium",
  priority: 100,
  summary: "Revenue declined in the selected period.",
  explanation: "The deterministic comparison shows a decline in the selected period.",
  evidenceStrength: "moderate",
  period: { start: "2025-01-01", end: "2025-01-31", boundary: "inclusive" },
  filterContext: { period: { start: "2025-01-01", end: "2025-01-31", boundary: "inclusive" } },
  evidence: [
    {
      evidenceId: "evidence:eval",
      matchingRowCount: 12,
      distinctOrderCount: 8,
      affectedDateBuckets: [],
      segmentKeys: ["North"],
      numerator: null,
      denominator: null,
      metricDependencies: [],
      sampleOrderLineIds: ["LINE-PRIVATE"],
      sampleOrderIds: ["ORDER-PRIVATE"],
      sampleLimit: 1,
      truncated: false,
    },
  ],
} as unknown as Finding;

function packet(dataset = "dataset-eval") {
  return createEvidencePacket(dataset, baseFinding);
}

function validExplanation(source = packet()) {
  return {
    findingId: source.finding.findingId,
    verifiedFact: source.finding.summary,
    interpretation:
      "The observed signal merits investigation with the active dashboard breakdowns.",
    recommendedActions: [
      {
        action: "Investigate the selected segment.",
        rationale: "Use the deterministic dashboard evidence.",
        expectedDirection: "investigate" as const,
        priority: "medium" as const,
        supportingEvidenceIds: [source.evidence[0].evidenceId],
        prerequisitesOrConstraints: "Keep the active period and filters visible.",
        confidence: "limited" as const,
      },
    ],
    questionsToInvestigate: ["Which existing breakdown has the largest contribution?"],
    assumptions: ["The dataset does not establish causal mechanisms."],
    limitations: source.limitations,
    confidenceLanguage: "Evidence is limited to the supplied deterministic finding.",
    evidenceReferences: [source.evidence[0].evidenceId],
  };
}

function fakeProvider(output: unknown, model = "evaluation-model"): AiProvider {
  return { kind: "mock", model, generate: async () => output as never };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe("Phase 7 deterministic evaluation suite", () => {
  it.each([
    "revenue-decline",
    "concentration",
    "negative-margin",
    "anomaly",
    "marketing-efficiency",
    "positive-opportunity",
    "limited-evidence",
  ])("accepts a bounded valid %s explanation", () => {
    const source = packet();
    expect(
      validateGrounding(source, {
        ...validExplanation(source),
        provider: "mock",
        model: "eval",
        promptVersion: "ai-explain-v1",
      }),
    ).toBeNull();
  });

  it.each([
    ["invented amount", "Interpretation includes $900.", /numerical/u],
    ["altered percentage", "The rate is 99%.", /numerical/u],
    ["wrong sign", "The result is -20.", /numerical/u],
    ["invented date", "The event occurred on 2026-02-01.", /numerical/u],
    ["invented ranking", "This is rank 3.", /numerical/u],
    ["causal overclaim", "This happened because of the campaign.", /causal/u],
    ["guaranteed outcome", "This will result in improved outcomes.", /causal/u],
  ])("rejects %s", (_name, interpretation, expected) => {
    const source = packet();
    expect(
      validateGrounding(source, {
        ...validExplanation(source),
        provider: "mock",
        model: "eval",
        promptVersion: "ai-explain-v1",
        interpretation,
      }),
    ).toMatch(expected);
  });

  it("allows an equivalent deterministic count representation", () => {
    const source = packet();
    expect(
      validateGrounding(source, {
        ...validExplanation(source),
        provider: "mock",
        model: "eval",
        promptVersion: "ai-explain-v1",
        interpretation: "The 12 matching rows merit investigation.",
      }),
    ).toBeNull();
  });

  it("rejects nonexistent, stale-filter, and cross-dataset evidence IDs", () => {
    const source = packet();
    for (const id of ["unknown", "evidence:stale-filter", "evidence:other-dataset"]) {
      expect(
        validateGrounding(source, {
          ...validExplanation(source),
          provider: "mock",
          model: "eval",
          promptVersion: "ai-explain-v1",
          evidenceReferences: [id],
        }),
      ).toMatch(/unavailable/u);
    }
  });

  it("rejects unsupported recommendation and malformed or oversized provider output", () => {
    const source = packet();
    expect(
      validateGrounding(source, {
        ...validExplanation(source),
        provider: "mock",
        model: "eval",
        promptVersion: "ai-explain-v1",
        recommendedActions: [
          { ...validExplanation(source).recommendedActions[0], action: "Hire staff immediately." },
        ],
      }),
    ).toMatch(/recommendation/u);
    expect(parseExplanationDraft({ findingId: "missing-fields" })).toBeNull();
    expect(
      parseExplanationDraft({ ...validExplanation(source), interpretation: "x".repeat(1_001) }),
    ).toBeNull();
  });

  it("maps provider refusal, timeout, and rate-limit errors to safe deterministic fallbacks", async () => {
    const source = packet();
    for (const [kind, expected] of [
      ["refused", "refused"],
      ["timeout", "timeout"],
      ["rate_limited", "rate_limited"],
    ] as const) {
      const provider: AiProvider = {
        kind: "mock",
        model: kind,
        generate: async () => {
          throw new ProviderFailure(kind, "safe provider failure");
        },
      };
      await expect(explainEvidencePacket(source, provider)).resolves.toMatchObject({
        status: expected,
      });
    }
  });

  it("evicts the oldest bounded in-session cache entry", async () => {
    clearExplanationCache();
    for (let index = 0; index < 13; index += 1) {
      await expect(explainEvidencePacket(packet(`dataset-${index}`))).resolves.toMatchObject({
        status: "ok",
        cached: false,
      });
    }
    await expect(explainEvidencePacket(packet("dataset-0"))).resolves.toMatchObject({
      status: "ok",
      cached: false,
    });
  });

  it("keeps raw identifiers out of every evaluation packet", () => {
    const serialized = JSON.stringify(packet());
    expect(serialized).not.toContain("LINE-PRIVATE");
    expect(serialized).not.toContain("ORDER-PRIVATE");
  });

  it("returns a safe invalid result for malformed provider JSON-shaped output", async () => {
    const result = await explainEvidencePacket(packet(), fakeProvider({ malformed: true }));
    expect(result).toMatchObject({ status: "invalid" });
  });

  it("benchmarks bounded local explanation stages without a network provider", async () => {
    const source = packet();
    const draft = validExplanation(source);
    const stages = {
      packet: () => createEvidencePacket("dataset-eval", baseFinding),
      validation: () =>
        validateGrounding(source, {
          ...draft,
          provider: "mock",
          model: "eval",
          promptVersion: "ai-explain-v1",
        }),
      schema: () => parseExplanationDraft(draft),
      cache: () => explainEvidencePacket(source),
    };
    clearExplanationCache();
    await stages.cache();
    const measurements = await Promise.all(
      Object.entries(stages).map(async ([name, stage]) => {
        await stage();
        const samples: number[] = [];
        for (let index = 0; index < 30; index += 1) {
          const started = performance.now();
          await stage();
          samples.push(performance.now() - started);
        }
        return [name, Number(median(samples).toFixed(3))] as const;
      }),
    );
    const report = Object.fromEntries(measurements);
    console.info("AI local benchmark (30 iterations; bounded packet; no network):", report);
    expect(Object.values(report).every((milliseconds) => milliseconds < 50)).toBe(true);
  });
});
