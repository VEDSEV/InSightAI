import type { DashboardViewModel } from "@/features/dashboard/analytics-adapter";

import type {
  AnalystClassification,
  AnalystConversationContext,
  AnalystIntent,
  AnalystMetric,
  ResolvedEntity,
  SupportedClassification,
} from "./types";

const DEFAULT_SUGGESTIONS = Object.freeze([
  "How is my business doing?",
  "What should I look at first?",
  "What's going well?",
  "Where am I losing money?",
]);

function normalize(question: string): string {
  return question.toLowerCase().replace(/[’']/gu, "'").replace(/\s+/gu, " ").trim();
}

function classifyMetric(question: string): AnalystMetric {
  if (/profit percentage|profit margin|gross margin/iu.test(question)) return "gross_margin";
  if (/units|quantity|selling the most/iu.test(question)) return "quantity";
  if (/sales|revenue|sell/iu.test(question)) return "revenue";
  if (/money|profit|making/iu.test(question)) return "gross_profit";
  return null;
}

function resolvedEntities(
  question: string,
  viewModel: DashboardViewModel,
): readonly ResolvedEntity[] {
  const matches: ResolvedEntity[] = [];
  const options = [
    ["product", viewModel.filterOptions.products] as const,
    ["category", viewModel.filterOptions.categories] as const,
    ["region", viewModel.filterOptions.regions] as const,
    ["channel", viewModel.filterOptions.channels] as const,
  ] as const;
  for (const [dimension, values] of options) {
    for (const option of values) {
      const label = normalize(option.label);
      const shortenedRetail =
        dimension === "channel" && label.startsWith("retail") && /retail/iu.test(question);
      if (label.length > 1 && (question.includes(label) || shortenedRetail)) {
        matches.push(Object.freeze({ dimension, key: option.value, label: option.label }));
      }
    }
  }
  return Object.freeze(matches);
}

function supported(
  intent: AnalystIntent,
  question: string,
  viewModel: DashboardViewModel,
  followUpReference: "none" | "prior_answer" = "none",
): SupportedClassification {
  return Object.freeze({
    status: "supported",
    intent,
    confidence: "high",
    entities: resolvedEntities(question, viewModel),
    requestedMetric: classifyMetric(question),
    followUpReference,
    followUpKind: "none",
    referenceEvidenceId: null,
  });
}

function ambiguous(): AnalystClassification {
  return Object.freeze({
    status: "clarification",
    message: "Do you mean your best product, sales channel, or region?",
    suggestions: Object.freeze([
      "What product is doing the best?",
      "Which sales channel is strongest?",
      "Which region is strongest?",
    ]),
  });
}

function unsupported(): AnalystClassification {
  return Object.freeze({
    status: "unsupported",
    message:
      "I can help with sales, profit, products, channels, regions, unusual changes, and what deserves attention. I can't reliably answer that from this data yet.",
    suggestions: DEFAULT_SUGGESTIONS,
  });
}

function followUp(
  question: string,
  viewModel: DashboardViewModel,
  context: AnalystConversationContext,
): AnalystClassification | null {
  if (context.lastAnswer === null) return null;
  const priorIntent = context.lastAnswer.intent;
  if (priorIntent === null) return null;
  const reference = {
    entities: context.lastAnswer.referencedEntities,
    referenceEvidenceId: context.lastAnswer.evidence?.evidenceId ?? null,
  };
  if (/^how do you know\??$/iu.test(question))
    return {
      ...supported(priorIntent, question, viewModel, "prior_answer"),
      ...reference,
      followUpKind: "evidence",
    };
  if (/^(why|tell me more|what changed)\??$/iu.test(question))
    return {
      ...supported(priorIntent, question, viewModel, "prior_answer"),
      ...reference,
      followUpKind: "why",
    };
  if (/^is that bad\??$/iu.test(question))
    return {
      ...supported(priorIntent, question, viewModel, "prior_answer"),
      ...reference,
      followUpKind: "risk",
    };
  if (/^what should i do about it\??$/iu.test(question))
    return {
      ...supported(priorIntent, question, viewModel, "prior_answer"),
      ...reference,
      followUpKind: "why",
    };
  if (/^show me the worst one\??$/iu.test(question))
    return {
      ...supported("worst_product", question, viewModel, "prior_answer"),
      followUpKind: "none",
    };
  if (/^what about /iu.test(question)) {
    const entities = resolvedEntities(question, viewModel);
    if (entities.length > 0) {
      return Object.freeze({
        status: "supported",
        intent: priorIntent,
        confidence: "high",
        entities,
        requestedMetric: classifyMetric(question),
        followUpReference: "prior_answer",
        followUpKind: "entity",
        referenceEvidenceId: null,
      });
    }
  }
  return null;
}

/**
 * A closed, local classifier: it emits only known intent IDs and never evaluates user text as an
 * expression. This Phase 9 implementation intentionally does not transmit the question to a
 * provider; its output is the strict routing boundary for deterministic analysis plans.
 */
export function classifyAnalystQuestion(
  rawQuestion: string,
  viewModel: DashboardViewModel,
  context: AnalystConversationContext,
): AnalystClassification {
  const question = normalize(rawQuestion);
  if (!question) {
    return Object.freeze({
      status: "clarification",
      message: "Ask a short question about your sales, profit, products, channels, or regions.",
      suggestions: DEFAULT_SUGGESTIONS,
    });
  }

  const prior = followUp(question, viewModel, context);
  if (prior) return prior;
  if (/forecast|next month|ad budget|facebook ads|hire|legal|tax|price by \d/iu.test(question)) {
    return unsupported();
  }
  if (
    /which one.*best|what.*best\??$/iu.test(question) &&
    !/(product|channel|region|sell|profit)/iu.test(question)
  ) {
    return ambiguous();
  }
  if (/how.*business|quick summary|what.*going on|doing okay/iu.test(question))
    return supported("business_overview", question, viewModel);
  if (/look at first|needs? my attention|worried|should i check|matters most/iu.test(question))
    return supported("priority", question, viewModel);
  if (/going well|what.*working|doing well|looks good/iu.test(question))
    return supported("going_well", question, viewModel);
  if (/sales.*(down|lower)|why.*(sales|money).*(down|less)|made less|drop/iu.test(question))
    return supported("sales_decline", question, viewModel);
  if (
    /sales.*(up|increase)|why.*(sales|money).*(up|increase)|drove growth|made more/iu.test(question)
  )
    return supported("sales_increase", question, viewModel);
  if (/least money|losing money|losing|hurting.*profit|worst.*margin/iu.test(question))
    return supported("least_money", question, viewModel);
  if (/most money|most profitable|brings.*profit|making.*money/iu.test(question))
    return supported("most_money", question, viewModel);
  if (/worst product|product.*worst|product.*check/iu.test(question))
    return supported("worst_product", question, viewModel);
  if (/best product|product.*best|product sells|selling the most/iu.test(question))
    return supported("best_product", question, viewModel);
  if (/channel|way of selling|web.*retail|retail.*web|where.*sales come/iu.test(question))
    return supported("best_channel", question, viewModel);
  if (/region|area|geographic|where.*sales strongest|where.*look geographically/iu.test(question))
    return supported("region_performance", question, viewModel);
  if (
    /changed recently|this month|happened lately|anything different|what changed/iu.test(question)
  )
    return supported("recent_changes", question, viewModel);
  if (/unusual|weird|out of the ordinary/iu.test(question))
    return supported("unusual_activity", question, viewModel);
  if (/improve|should i fix|do better|check next/iu.test(question))
    return supported("improvement", question, viewModel);
  return unsupported();
}

export const ANALYST_DEFAULT_SUGGESTIONS = DEFAULT_SUGGESTIONS;
