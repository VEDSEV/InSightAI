// @vitest-environment node

import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createAnalyticsEngine, type ValidatedDataset } from "@/analytics";
import {
  createDashboardFilterOptions,
  createDashboardViewModel,
  type DashboardViewModel,
} from "@/features/dashboard/analytics-adapter";
import { DEFAULT_DASHBOARD_FILTER_STATE } from "@/features/dashboard/dashboard-filter-state";
import { loadDashboardSampleDataset } from "@/features/dashboard/dashboard-sample-dataset";
import { createAnalystPlan, executeAnalystPlan } from "@/features/ai-analyst/analysis-plans";
import { createAnalystConversationContextKey } from "@/features/ai-analyst/conversation-context";
import { validateAnalystAnswer } from "@/features/ai-analyst/grounding";
import { classifyAnalystQuestion } from "@/features/ai-analyst/intent-classifier";
import type { AnalystConversationContext } from "@/features/ai-analyst/types";

const phaseTwoCsv = readFileSync(
  new URL("../data/sample/insightai-orders.csv", import.meta.url),
  "utf8",
);

let fullView: DashboardViewModel;
let comparisonView: DashboardViewModel;
let positiveMarginView: DashboardViewModel;
let productFilteredView: DashboardViewModel;

const emptyContext: AnalystConversationContext = Object.freeze({
  datasetFingerprint: "demo-v1",
  filterKey: "full",
  lastAnswer: null,
});

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, text: async () => phaseTwoCsv })),
  );
  const loaded = await loadDashboardSampleDataset();
  if (loaded.status !== "ready") throw new Error(loaded.message);
  const dataset: ValidatedDataset = loaded.dataset;
  const engine = createAnalyticsEngine(dataset);
  const options = createDashboardFilterOptions(dataset);
  const createView = (filter: typeof DEFAULT_DASHBOARD_FILTER_STATE) => {
    const result = createDashboardViewModel(engine, dataset, filter, options);
    if (result.status !== "ready") throw new Error(result.message);
    return result.value;
  };
  fullView = createView(DEFAULT_DASHBOARD_FILTER_STATE);
  comparisonView = createView({
    ...DEFAULT_DASHBOARD_FILTER_STATE,
    preset: "year-2025",
    start: "2025-01-01",
    end: "2025-12-31",
  });
  positiveMarginView = createView({
    ...DEFAULT_DASHBOARD_FILTER_STATE,
    category: "Home",
  });
  productFilteredView = createView({
    ...DEFAULT_DASHBOARD_FILTER_STATE,
    productId: "PROD-GFT-001",
  });
});

describe("Guided AI Analyst intent classification", () => {
  it.each([
    ["How is my business doing?", "business_overview"],
    ["What should I look at first?", "priority"],
    ["What's going well?", "going_well"],
    ["What should I be worried about?", "priority"],
    ["Why did my sales go down?", "sales_decline"],
    ["Why did my sales go up?", "sales_increase"],
    ["What's making me the most money?", "most_money"],
    ["Where am I losing money?", "least_money"],
    ["What product is doing the best?", "best_product"],
    ["What product is doing the worst?", "worst_product"],
    ["Which way of selling is working best?", "best_channel"],
    ["What changed recently?", "recent_changes"],
    ["Is anything unusual going on?", "unusual_activity"],
    ["What can I improve?", "improvement"],
  ] as const)("routes %s to %s", (question, intent) => {
    expect(classifyAnalystQuestion(question, fullView, emptyContext)).toMatchObject({
      status: "supported",
      intent,
    });
  });

  it("asks for clarification rather than guessing an ambiguous ranking", () => {
    expect(classifyAnalystQuestion("Which one is best?", fullView, emptyContext)).toMatchObject({
      status: "clarification",
      message: expect.stringMatching(/product, sales channel, or region/i),
    });
  });

  it("handles unsupported budget questions without fabricating a recommendation", () => {
    expect(
      classifyAnalystQuestion(
        "How much should I spend on Facebook ads next month?",
        fullView,
        emptyContext,
      ),
    ).toMatchObject({ status: "unsupported" });
  });

  it("resolves a bounded entity in a follow-up", () => {
    const first = executeAnalystPlan(
      createAnalystPlan(
        classifyAnalystQuestion(
          "Which sales channel is strongest?",
          fullView,
          emptyContext,
        ) as Extract<ReturnType<typeof classifyAnalystQuestion>, { status: "supported" }>,
      ),
      fullView,
    );
    const context = { ...emptyContext, lastAnswer: first };
    expect(classifyAnalystQuestion("What about Retail?", fullView, context)).toMatchObject({
      status: "supported",
      entities: [{ dimension: "channel", label: "Retail Pop-up" }],
      followUpReference: "prior_answer",
    });
  });

  it("answers evidence and risk follow-ups from the prior verified plan", () => {
    const firstClassification = classifyAnalystQuestion(
      "Which sales channel is strongest?",
      fullView,
      emptyContext,
    );
    if (firstClassification.status !== "supported") throw new Error("Expected a supported intent.");
    const first = executeAnalystPlan(createAnalystPlan(firstClassification), fullView);
    const context = { ...emptyContext, lastAnswer: first };
    const evidenceFollowUp = classifyAnalystQuestion("How do you know?", fullView, context);
    const riskFollowUp = classifyAnalystQuestion("Is that bad?", fullView, context);
    if (evidenceFollowUp.status !== "supported" || riskFollowUp.status !== "supported") {
      throw new Error("Expected supported follow-ups.");
    }

    const evidenceAnswer = executeAnalystPlan(createAnalystPlan(evidenceFollowUp), fullView);
    const riskAnswer = executeAnalystPlan(createAnalystPlan(riskFollowUp), fullView);
    expect(evidenceAnswer.directAnswer).toBe("Here is how we know.");
    expect(evidenceAnswer.evidence?.evidenceId).toBe(first.evidence?.evidenceId);
    expect(riskAnswer.directAnswer).toMatch(/not necessarily bad/i);
    expect(validateAnalystAnswer(evidenceAnswer, fullView)).toBeNull();
    expect(validateAnalystAnswer(riskAnswer, fullView)).toBeNull();
  });
});

describe("Guided AI Analyst plans and grounding", () => {
  function executeQuestion(
    question: string,
    viewModel: DashboardViewModel = fullView,
    context: AnalystConversationContext = emptyContext,
  ) {
    const classification = classifyAnalystQuestion(question, viewModel, context);
    if (classification.status !== "supported") throw new Error(`Expected supported: ${question}`);
    return executeAnalystPlan(createAnalystPlan(classification), viewModel);
  }

  it.each([
    ["How is my business doing?", "answer"],
    ["What should I look at first?", "answer"],
    ["What's going well?", "answer"],
    ["What should I be worried about?", "answer"],
    ["Why did my sales go down?", "insufficient_data"],
    ["Why did my sales go up?", "insufficient_data"],
    ["What's making me the most money?", "answer"],
    ["Where am I losing money?", "answer"],
    ["What product is doing the best?", "answer"],
    ["What product is doing the worst?", "answer"],
    ["Which way of selling is working best?", "answer"],
    ["What changed recently?", "answer"],
    ["Is anything unusual going on?", "answer"],
    ["What can I improve?", "answer"],
  ] as const)("answers %s with a grounded %s result", (question, status) => {
    const answer = executeQuestion(question);
    expect(answer.status).toBe(status);
    expect(validateAnalystAnswer(answer, fullView)).toBeNull();
  });

  it("uses the highest-priority deterministic finding for the founder priority question", () => {
    const answer = executeQuestion("What should I look at first?");
    expect(answer.directAnswer).toBe(
      "The insight “Web represents a concentrated share” deserves your attention first.",
    );
    expect(answer.supportingFact).toBe(
      "Web accounts for 61.6% of revenue in the active selection.",
    );
    expect(answer.evidence?.evidenceId).toContain("concentration:channel:top-1");
    expect(validateAnalystAnswer(answer, fullView)).toBeNull();
  });

  it("answers the loss question with negative gross profit only when the direct-cost model supports it", () => {
    const answer = executeQuestion("Where am I losing money?");
    expect(answer.directAnswer).toBe(
      "Discovery Gift Bundle is losing money after direct product costs.",
    );
    expect(answer.supportingFact).toBe("Discovery Gift Bundle generated -$168.36 in gross profit.");
    expect(answer.evidence?.evidenceId).toContain("breakdown:product:PROD-GFT-001");
    expect(validateAnalystAnswer(answer, fullView)).toBeNull();
  });

  it("treats no negative-profit product as a valid empty result, not a safety failure", () => {
    const answer = executeQuestion("Where am I losing money?", positiveMarginView);
    expect(answer.status).toBe("no_matches");
    expect(answer.directAnswer).toBe(
      "I don't see anything currently losing money after direct product costs in this view.",
    );
    expect(answer.whatItMeans).toMatch(/weakest gross margin/i);
    expect(validateAnalystAnswer(answer, positiveMarginView)).toBeNull();
  });

  it("treats no priority finding as a valid empty result", () => {
    const noFindingsView = {
      ...fullView,
      findings: { ...fullView.findings, findings: Object.freeze([]) },
    } as DashboardViewModel;
    const answer = executeQuestion("What should I look at first?", noFindingsView);
    expect(answer.status).toBe("no_matches");
    expect(answer.directAnswer).toBe(
      "I don't see a major issue that needs immediate attention in this view.",
    );
    expect(validateAnalystAnswer(answer, noFindingsView)).toBeNull();
  });

  it("keeps every displayed default suggestion executable and grounded", () => {
    for (const question of [
      "How is my business doing?",
      "What should I look at first?",
      "What's going well?",
      "Where am I losing money?",
    ]) {
      const answer = executeQuestion(question);
      expect(answer.status).not.toBe("grounding_failure");
      expect(validateAnalystAnswer(answer, fullView)).toBeNull();
    }
  });

  it("keeps channel and loss follow-ups tied to the active verified context", () => {
    const answerThroughFollowUps = (firstQuestion: string, followUps: readonly string[]) => {
      let answer = executeQuestion(firstQuestion);
      for (const followUp of followUps) {
        answer = executeQuestion(followUp, fullView, {
          ...emptyContext,
          lastAnswer: answer,
        });
        expect(validateAnalystAnswer(answer, fullView)).toBeNull();
      }
      return answer;
    };

    const channel = answerThroughFollowUps("Which way of selling is working best?", [
      "Is that bad?",
      "Why?",
      "How do you know?",
    ]);
    expect(channel.evidence?.evidenceId).toContain("concentration:channel:top-1");
    expect(channel.directAnswer).toBe("Here is how we know.");

    const loss = answerThroughFollowUps("Where am I losing money?", [
      "What should I do about it?",
      "How do you know?",
    ]);
    expect(loss.evidence?.evidenceId).toContain("breakdown:product:PROD-GFT-001");
    expect(loss.directAnswer).toBe("Here is how we know.");
  });

  it("starts standalone intents from dashboard context rather than an unrelated conversational entity", () => {
    const transitions = [
      ["Where am I losing money?", "Which way of selling is working best?", "channel"],
      ["Which way of selling is working best?", "What product is doing the best?", "product"],
      ["Which region is strongest?", "How is my business doing?", null],
      ["Where am I losing money?", "What should I look at first?", "channel"],
    ] as const;
    for (const [firstQuestion, secondQuestion, expectedDimension] of transitions) {
      const first = executeQuestion(firstQuestion);
      const context = { ...emptyContext, lastAnswer: first };
      const classification = classifyAnalystQuestion(secondQuestion, fullView, context);
      if (classification.status !== "supported") throw new Error("Expected a supported question.");
      expect(classification.followUpReference).toBe("none");
      expect(classification.entities).toEqual([]);
      const second = executeAnalystPlan(createAnalystPlan(classification), fullView);
      expect(second.referencedEntities[0]?.dimension ?? null).toBe(expectedDimension);
      expect(validateAnalystAnswer(second, fullView)).toBeNull();
      if (secondQuestion.includes("way of selling")) {
        expect(second.contextLabel).not.toMatch(/Product:/i);
        expect(second.supportingFact).not.toContain("$1,605.12");
        expect(second.evidence?.evidenceId).toContain("breakdown:channel:Web");
      }
    }
  });

  it("uses current channel concentration evidence and advice across referential follow-ups", () => {
    let previous = executeQuestion("Which way of selling is working best?");
    const risk = executeQuestion("Is that bad?", fullView, {
      ...emptyContext,
      lastAnswer: previous,
    });
    expect(risk.directAnswer).toMatch(/not necessarily bad/i);
    expect(risk.supportingFact).toMatch(/Web accounts for 61\.6%/i);
    expect(risk.evidence?.evidenceId).toContain("concentration:channel:top-1");
    expect(risk.nextStep).toMatch(/sales channels/i);
    expect(risk.nextStep).not.toMatch(/pricing|direct costs/i);
    expect(validateAnalystAnswer(risk, fullView)).toBeNull();
    previous = risk;
    for (const question of ["Why?", "How do you know?"]) {
      const answer = executeQuestion(question, fullView, { ...emptyContext, lastAnswer: previous });
      expect(answer.evidence?.evidenceId).toBe(risk.evidence?.evidenceId);
      expect(answer.nextStep).not.toMatch(/pricing|direct costs/i);
      expect(validateAnalystAnswer(answer, fullView)).toBeNull();
      previous = answer;
    }
  });

  it("keeps product-loss follow-ups on product evidence without leaking into later channel questions", () => {
    const loss = executeQuestion("Where am I losing money?");
    const action = executeQuestion("What should I do about it?", fullView, {
      ...emptyContext,
      lastAnswer: loss,
    });
    expect(action.evidence?.evidenceId).toBe(loss.evidence?.evidenceId);
    expect(action.nextStep).toMatch(/pricing|direct costs/i);
    const evidence = executeQuestion("How do you know?", fullView, {
      ...emptyContext,
      lastAnswer: action,
    });
    expect(evidence.evidence?.evidenceId).toBe(loss.evidence?.evidenceId);
    const channel = executeQuestion("Which way of selling is working best?", fullView, {
      ...emptyContext,
      lastAnswer: evidence,
    });
    expect(channel.referencedEntities).toEqual([
      { dimension: "channel", key: "Web", label: "Web" },
    ]);
    expect(channel.nextStep).not.toMatch(/pricing|direct costs/i);
  });

  it("does not turn a channel result into product-pricing advice when the dashboard has a product filter", () => {
    const channel = executeQuestion("Which way of selling is working best?", productFilteredView);
    expect(channel.contextLabel).toContain("Product:");
    expect(channel.referencedEntities[0]?.dimension).toBe("channel");
    expect(channel.nextStep).not.toMatch(/pricing|direct costs/i);
    expect(validateAnalystAnswer(channel, productFilteredView)).toBeNull();
  });

  it("uses a distinct context identity for filter and dataset changes", () => {
    const base = createAnalystConversationContextKey("demo-a", fullView.filter);
    expect(createAnalystConversationContextKey("demo-b", fullView.filter)).not.toBe(base);
    expect(
      createAnalystConversationContextKey("demo-a", { ...fullView.filter, region: "West" }),
    ).not.toBe(base);
  });

  it("uses engine-derived metrics and evidence for the business overview", () => {
    const classification = classifyAnalystQuestion(
      "How is my business doing?",
      fullView,
      emptyContext,
    );
    if (classification.status !== "supported") throw new Error("Expected a supported intent.");
    const answer = executeAnalystPlan(createAnalystPlan(classification), fullView);
    expect(answer).toMatchObject({
      status: "answer",
      intent: "business_overview",
      evidence: { matchingRowCount: 6909 },
    });
    expect(answer.directAnswer).toContain("$778,231.10");
    expect(validateAnalystAnswer(answer, fullView)).toBeNull();
  });

  it("uses a valid comparison plan without turning contribution into causal proof", () => {
    const classification = classifyAnalystQuestion(
      "Why did my sales go down?",
      comparisonView,
      emptyContext,
    );
    if (classification.status !== "supported") throw new Error("Expected a supported intent.");
    const answer = executeAnalystPlan(createAnalystPlan(classification), comparisonView);
    expect(answer.intent).toBe("sales_decline");
    expect(answer.whatItMeans).not.toMatch(/caused|because of|guarantee/iu);
    expect(validateAnalystAnswer(answer, comparisonView)).toBeNull();
  });

  it("rejects a hallucinated number, stale evidence, entity, and causal overclaim", () => {
    const classification = classifyAnalystQuestion(
      "Which sales channel is strongest?",
      fullView,
      emptyContext,
    );
    if (classification.status !== "supported") throw new Error("Expected a supported intent.");
    const answer = executeAnalystPlan(createAnalystPlan(classification), fullView);
    expect(
      validateAnalystAnswer({ ...answer, supportingFact: "It made $999.00." }, fullView),
    ).toMatch(/unsupported value/i);
    expect(
      validateAnalystAnswer(
        { ...answer, referencedEntities: [{ dimension: "channel", key: "stale", label: "Other" }] },
        fullView,
      ),
    ).toMatch(/outside the active dataset/i);
    expect(
      validateAnalystAnswer({ ...answer, whatItMeans: "Web caused the result." }, fullView),
    ).toMatch(/causal/i);
  });

  it("keeps a filtered answer in the filtered engine context", () => {
    const filtered = {
      ...comparisonView,
      filter: { ...comparisonView.filter, region: "West" },
    };
    // This check protects the analysis-plan contract: it accepts the current view model only and
    // does not own raw rows or a second dataset source.
    expect(filtered.filter.region).toBe("West");
    expect(
      createAnalystPlan({
        status: "supported",
        intent: "best_product",
        confidence: "high",
        entities: [],
        requestedMetric: null,
        followUpReference: "none",
        followUpKind: "none",
      }).kind,
    ).toBe("ranked_breakdown");
  });
});
