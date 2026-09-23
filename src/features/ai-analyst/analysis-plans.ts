import type { BreakdownEntry, EvidenceReference } from "@/analytics";
import {
  asComputableBreakdown,
  type DashboardMetric,
  type DashboardViewModel,
} from "@/features/dashboard/analytics-adapter";
import {
  formatCurrencyCents,
  formatFounderDateRange,
  formatMetricValue,
  formatRate,
} from "@/features/dashboard/presentation-formatters";

import type {
  AnalystAnswer,
  AnalystClassification,
  AnalystDimension,
  AnalystIntent,
  AnalystPlan,
  ResolvedEntity,
} from "./types";

const LIMITATIONS = Object.freeze([
  "This answer is based on the selected data and describes measurable patterns, not proven causes.",
]);

function metric(viewModel: DashboardViewModel, id: DashboardMetric["id"]): DashboardMetric | null {
  return (
    [...viewModel.primaryKpis, ...viewModel.secondaryKpis].find((item) => item.id === id) ?? null
  );
}

function metricValue(viewModel: DashboardViewModel, id: DashboardMetric["id"]): string {
  const selected = metric(viewModel, id);
  return selected?.result.status === "ok" ? formatMetricValue(selected.result.value) : "—";
}

function periodLabel(viewModel: DashboardViewModel): string {
  return formatFounderDateRange(viewModel.filter.start, viewModel.filter.end);
}

function entryFor(
  viewModel: DashboardViewModel,
  dimension: AnalystDimension,
  entity: ResolvedEntity | undefined,
): BreakdownEntry | null {
  if (!entity) return null;
  const breakdown = asComputableBreakdown(viewModel.breakdowns[dimension]);
  return breakdown?.entries.find((entry) => entry.key === entity.key) ?? null;
}

function entries(
  viewModel: DashboardViewModel,
  dimension: AnalystDimension,
): readonly BreakdownEntry[] {
  return asComputableBreakdown(viewModel.breakdowns[dimension])?.entries ?? [];
}

function byHighestProfit(values: readonly BreakdownEntry[]): BreakdownEntry | null {
  return (
    [...values].sort(
      (left, right) =>
        right.grossProfit - left.grossProfit || left.label.localeCompare(right.label),
    )[0] ?? null
  );
}

function byLowestProfit(values: readonly BreakdownEntry[]): BreakdownEntry | null {
  return (
    [...values].sort(
      (left, right) =>
        left.grossProfit - right.grossProfit || left.label.localeCompare(right.label),
    )[0] ?? null
  );
}

function byHighestRevenue(values: readonly BreakdownEntry[]): BreakdownEntry | null {
  return (
    [...values].sort(
      (left, right) => right.revenue - left.revenue || left.label.localeCompare(right.label),
    )[0] ?? null
  );
}

function changeEntry(
  values: readonly BreakdownEntry[],
  direction: "positive" | "negative",
): BreakdownEntry | null {
  const candidates = values.filter((entry) => {
    const change = entry.comparison?.absoluteRevenueChange;
    return change !== undefined && (direction === "positive" ? change > 0 : change < 0);
  });
  return (
    [...candidates].sort((left, right) => {
      const leftChange = left.comparison?.absoluteRevenueChange ?? 0;
      const rightChange = right.comparison?.absoluteRevenueChange ?? 0;
      return direction === "positive" ? rightChange - leftChange : leftChange - rightChange;
    })[0] ?? null
  );
}

function answer(
  viewModel: DashboardViewModel,
  values: Omit<AnalystAnswer, "contextLabel" | "limitations">,
): AnalystAnswer {
  return Object.freeze({
    ...values,
    contextLabel: `${periodLabel(viewModel)}${
      viewModel.activeFilterChips.length ? ` · ${viewModel.activeFilterChips.join(" · ")}` : ""
    }`,
    limitations: LIMITATIONS,
  });
}

function noMatchesAnswer(
  viewModel: DashboardViewModel,
  intent: AnalystIntent,
  directAnswer: string,
  whatItMeans: string,
  nextStep: string,
  evidence: EvidenceReference | null = null,
  evidenceTitle = "Current selection",
  evidenceDescription = "The verified analysis found no matching result for this question.",
  referencedEntities: readonly ResolvedEntity[] = Object.freeze([]),
  explore: AnalystAnswer["explore"] = null,
): AnalystAnswer {
  return answer(viewModel, {
    status: "no_matches",
    intent,
    directAnswer,
    supportingFact: null,
    whatItMeans,
    nextStep,
    evidence,
    evidenceTitle,
    evidenceDescription,
    referencedEntities,
    suggestedQuestions: Object.freeze([
      "How is my business doing?",
      "What's going well?",
      "What should I look at first?",
    ]),
    explore,
  });
}

function withEntry(
  viewModel: DashboardViewModel,
  intent: AnalystIntent,
  entry: BreakdownEntry,
  dimension: AnalystDimension,
  directAnswer: string,
  supportingFact: string,
  whatItMeans: string,
  nextStep: string,
): AnalystAnswer {
  const entity = Object.freeze({ dimension, key: entry.key, label: entry.label });
  return answer(viewModel, {
    status: "answer",
    intent,
    directAnswer,
    supportingFact,
    whatItMeans,
    nextStep,
    evidence: entry.evidence,
    evidenceTitle: `${entry.label} performance`,
    evidenceDescription:
      "See the selected period, calculation inputs, and bounded supporting records.",
    referencedEntities: Object.freeze([entity]),
    suggestedQuestions: Object.freeze([
      `What about ${entry.label}?`,
      "What should I investigate first?",
      "How do you know?",
    ]),
    explore: Object.freeze({ dimension, value: entry.key }),
  });
}

function fromFinding(
  viewModel: DashboardViewModel,
  intent: AnalystIntent,
  findingIndex = 0,
): AnalystAnswer {
  const finding = viewModel.findings.findings[findingIndex];
  if (!finding)
    return noMatchesAnswer(
      viewModel,
      intent,
      intent === "priority"
        ? "I don't see a major issue that needs immediate attention in this view."
        : "I don't see a material signal that matches this question in this view.",
      "That is a valid result from the current deterministic checks, not a verification failure.",
      "Try another period or open Explore for more detail.",
    );
  const entity = finding.affectedSegment
    ? (() => {
        const dimension: AnalystDimension | null =
          finding.affectedDimension === "product" ||
          finding.affectedDimension === "category" ||
          finding.affectedDimension === "region" ||
          finding.affectedDimension === "channel"
            ? finding.affectedDimension
            : null;
        if (!dimension) return Object.freeze([]);
        const options =
          dimension === "product"
            ? viewModel.filterOptions.products
            : dimension === "channel"
              ? viewModel.filterOptions.channels
              : dimension === "region"
                ? viewModel.filterOptions.regions
                : viewModel.filterOptions.categories;
        const match = options.find((option) => option.value === finding.affectedSegment);
        return match
          ? Object.freeze([{ dimension, key: finding.affectedSegment, label: match.label }])
          : Object.freeze([]);
      })()
    : Object.freeze([]);
  return answer(viewModel, {
    status: "answer",
    intent,
    directAnswer: finding.summary,
    supportingFact:
      finding.currentValue === null
        ? null
        : `Current measured value: ${formatMetricValue(finding.currentValue)}.`,
    whatItMeans:
      "This is a measured signal worth reviewing; it does not establish why it happened.",
    nextStep:
      finding.affectedDimension === "product"
        ? "Review pricing, discounts, and direct costs for the affected product."
        : "Open the detail and compare the affected area in Explore.",
    evidence: finding.evidence[0] ?? null,
    evidenceTitle: finding.title,
    evidenceDescription:
      "See the rule, current selection, and bounded supporting records for this insight.",
    referencedEntities: entity,
    suggestedQuestions: Object.freeze([
      "How do you know?",
      "What should I do about it?",
      "What's going well?",
    ]),
    explore:
      entity[0] === undefined
        ? null
        : Object.freeze({ dimension: entity[0].dimension, value: entity[0].key }),
  });
}

function priority(
  viewModel: DashboardViewModel,
  intent: "priority" | "improvement",
): AnalystAnswer {
  const finding = viewModel.findings.findings[0];
  if (!finding) {
    return noMatchesAnswer(
      viewModel,
      intent,
      intent === "priority"
        ? "I don't see a major issue that needs immediate attention in this view."
        : "I don't see a major improvement issue in this view right now.",
      "That is a valid result from the current deterministic checks, not a verification failure.",
      "Review what is going well or open Explore to compare a product, channel, or region.",
    );
  }
  const findingAnswer = fromFinding(viewModel, intent);
  return Object.freeze({
    ...findingAnswer,
    directAnswer:
      intent === "priority"
        ? `The insight “${finding.title}” deserves your attention first.`
        : `${finding.title} is the first measured area I would review.`,
    supportingFact: finding.summary,
    whatItMeans:
      "This priority comes from the existing deterministic materiality and evidence rules; it does not prove why it happened.",
  });
}

function lowestGrossMargin(values: readonly BreakdownEntry[]): BreakdownEntry | null {
  const rateEntries = values.filter(
    (
      entry,
    ): entry is BreakdownEntry & {
      grossMargin: Extract<BreakdownEntry["grossMargin"], { kind: "rate" }>;
    } => entry.grossMargin.kind === "rate",
  );
  return (
    [...rateEntries].sort(
      (left, right) =>
        left.grossMargin.basisPoints - right.grossMargin.basisPoints ||
        left.label.localeCompare(right.label),
    )[0] ?? null
  );
}

function losingMoney(viewModel: DashboardViewModel): AnalystAnswer {
  const productEntries = entries(viewModel, "product");
  const negativeProfit = productEntries.filter((entry) => entry.grossProfit < 0);
  const mostMaterialLoss = byLowestProfit(negativeProfit);
  if (mostMaterialLoss) {
    return withEntry(
      viewModel,
      "least_money",
      mostMaterialLoss,
      "product",
      `${mostMaterialLoss.label} is losing money after direct product costs.`,
      `${mostMaterialLoss.label} generated ${formatCurrencyCents(mostMaterialLoss.grossProfit)} in gross profit.`,
      "Negative gross profit means direct product costs are higher than the revenue shown here.",
      "Review pricing, discounts, and direct costs before making a change.",
    );
  }

  const weakestMargin = lowestGrossMargin(productEntries);
  if (!weakestMargin || weakestMargin.grossMargin.kind !== "rate") {
    return noMatchesAnswer(
      viewModel,
      "least_money",
      "I don't see anything currently losing money after direct product costs in this view.",
      "No product with a usable gross-margin result is available to compare in this selection.",
      "Try a broader period or open Explore to inspect product performance.",
    );
  }
  const entity = Object.freeze({
    dimension: "product" as const,
    key: weakestMargin.key,
    label: weakestMargin.label,
  });
  return noMatchesAnswer(
    viewModel,
    "least_money",
    "I don't see anything currently losing money after direct product costs in this view.",
    `The weakest gross margin is ${weakestMargin.label} at ${formatRate(weakestMargin.grossMargin)}, so that is where I would look next.`,
    "Compare its pricing, discounts, and direct costs in Explore.",
    weakestMargin.evidence,
    `${weakestMargin.label} performance`,
    "See the selected period, calculation inputs, and bounded supporting records.",
    Object.freeze([entity]),
    Object.freeze({ dimension: "product", value: weakestMargin.key }),
  );
}

function overview(viewModel: DashboardViewModel): AnalystAnswer {
  const revenue = metric(viewModel, "total_revenue");
  return answer(viewModel, {
    status: "answer",
    intent: "business_overview",
    directAnswer: `Your business generated ${metricValue(viewModel, "total_revenue")} in sales and ${metricValue(viewModel, "gross_profit")} in gross profit during ${periodLabel(viewModel)}.`,
    supportingFact: `${metricValue(viewModel, "distinct_orders")} orders from ${metricValue(viewModel, "unique_customers")} customers, with a ${metricValue(viewModel, "gross_margin")} gross margin.`,
    whatItMeans:
      viewModel.findings.findings[0]?.summary ?? "No material issue is currently flagged.",
    nextStep: "Review the top insight to see what deserves attention first.",
    evidence: revenue?.evidence ?? null,
    evidenceTitle: "Business overview",
    evidenceDescription:
      "See the selected period and verified calculation context for these business totals.",
    referencedEntities: Object.freeze([]),
    suggestedQuestions: Object.freeze([
      "What should I look at first?",
      "What's going well?",
      "Where am I losing money?",
    ]),
    explore: null,
  });
}

function periodChange(
  viewModel: DashboardViewModel,
  intent: "sales_decline" | "sales_increase",
): AnalystAnswer {
  const revenue = metric(viewModel, "total_revenue");
  const comparison = revenue?.comparison;
  if (!comparison || comparison.status !== "ok" || comparison.percentageChange?.kind !== "rate") {
    return answer(viewModel, {
      status: "insufficient_data",
      intent,
      directAnswer: "I don't have a complete matching prior period to compare with this view.",
      supportingFact: null,
      whatItMeans:
        "A reliable change explanation needs a valid earlier period with the same filters.",
      nextStep: "Choose a period with enough earlier data, then try again.",
      evidence: revenue?.evidence ?? null,
      evidenceTitle: "Revenue comparison",
      evidenceDescription:
        "Comparison availability is determined by the analytics engine for this selection.",
      referencedEntities: Object.freeze([]),
      suggestedQuestions: Object.freeze([
        "How is my business doing?",
        "What should I look at first?",
      ]),
      explore: null,
    });
  }
  const direction = comparison.percentageChange.basisPoints < 0 ? "negative" : "positive";
  const requestedDirection = intent === "sales_decline" ? "negative" : "positive";
  if (direction !== requestedDirection) {
    return answer(viewModel, {
      status: "answer",
      intent,
      directAnswer:
        requestedDirection === "negative"
          ? "Sales are higher than the matching prior period in this view."
          : "Sales are lower than the matching prior period in this view.",
      supportingFact: `Revenue changed ${formatRate(comparison.percentageChange)} versus the matching prior period.`,
      whatItMeans: "The direction in the data does not match the question's assumption.",
      nextStep: "Ask what changed recently to inspect the active period.",
      evidence: revenue.evidence,
      evidenceTitle: "Revenue comparison",
      evidenceDescription: "See the active and matching prior periods used for this comparison.",
      referencedEntities: Object.freeze([]),
      suggestedQuestions: Object.freeze(["What changed recently?", "What should I look at first?"]),
      explore: null,
    });
  }
  const contributor = changeEntry(entries(viewModel, "product"), requestedDirection);
  if (!contributor) return fromFinding(viewModel, intent);
  const change = contributor.comparison?.absoluteRevenueChange ?? 0;
  return withEntry(
    viewModel,
    intent,
    contributor,
    "product",
    `The largest measurable contributor to the ${requestedDirection === "negative" ? "drop" : "increase"} was ${contributor.label}.`,
    `${contributor.label} revenue changed ${formatCurrencyCents(change)} versus the matching prior period.`,
    "This identifies the biggest measured change, not a proven cause.",
    "Compare this product's pricing, orders, and discounts in Explore.",
  );
}

function entityOrTop(
  viewModel: DashboardViewModel,
  dimension: AnalystDimension,
  entity: ResolvedEntity | undefined,
  chooser: (values: readonly BreakdownEntry[]) => BreakdownEntry | null,
): BreakdownEntry | null {
  return entryFor(viewModel, dimension, entity) ?? chooser(entries(viewModel, dimension));
}

function rankedAnswer(
  viewModel: DashboardViewModel,
  intent:
    | "most_money"
    | "best_product"
    | "worst_product"
    | "least_money"
    | "best_channel"
    | "region_performance"
    | "going_well",
  dimension: AnalystDimension,
  entity: ResolvedEntity | undefined,
  chooser: (values: readonly BreakdownEntry[]) => BreakdownEntry | null,
  basis: "revenue" | "gross profit" | "quantity",
): AnalystAnswer {
  const entry = entityOrTop(viewModel, dimension, entity, chooser);
  if (!entry) return fromFinding(viewModel, intent);
  const value =
    basis === "revenue"
      ? formatCurrencyCents(entry.revenue)
      : basis === "quantity"
        ? String(entry.quantity)
        : formatCurrencyCents(entry.grossProfit);
  const qualifier =
    basis === "revenue" ? "revenue" : basis === "quantity" ? "units" : "gross profit";
  // A negative channel/region total must not receive product-pricing advice.
  const negativeProduct = dimension === "product" && entry.grossProfit < 0;
  const direct =
    intent === "worst_product" || intent === "least_money"
      ? negativeProduct
        ? `${entry.label} is losing money after direct product costs.`
        : `${entry.label} is the weakest product by gross profit in this view.`
      : `${entry.label} is your strongest ${dimension === "channel" ? "sales channel" : dimension} by ${qualifier}.`;
  return withEntry(
    viewModel,
    intent,
    entry,
    dimension,
    direct,
    `${entry.label} generated ${value} in ${qualifier}.`,
    negativeProduct
      ? "Negative gross profit means direct product costs are higher than the revenue shown here."
      : "This ranking is based on the active period and filters.",
    negativeProduct
      ? "Review pricing, discounts, and direct costs before making a change."
      : `Compare ${entry.label} with the other ${dimension === "channel" ? "sales channels" : `${dimension}s`} in Explore.`,
  );
}

function unusual(viewModel: DashboardViewModel): AnalystAnswer {
  const anomaly = viewModel.findings.findings.find((finding) => finding.category === "anomaly");
  if (!anomaly)
    return noMatchesAnswer(
      viewModel,
      "unusual_activity",
      "I don't see a major unusual change in this view.",
      "The current anomaly rules did not flag a material change; that does not rule out every difference.",
      "Ask what changed recently or explore the trend for more detail.",
    );
  return fromFinding(viewModel, "unusual_activity", viewModel.findings.findings.indexOf(anomaly));
}

export function createAnalystPlan(
  classification: Extract<AnalystClassification, { status: "supported" }>,
): AnalystPlan {
  const dimension = classification.entities[0]?.dimension ?? null;
  const kind =
    classification.intent === "business_overview"
      ? "overview"
      : classification.intent === "priority" ||
          classification.intent === "improvement" ||
          classification.intent === "recent_changes"
        ? "findings_priority"
        : classification.intent === "sales_decline" || classification.intent === "sales_increase"
          ? "period_comparison"
          : classification.intent === "unusual_activity"
            ? "anomaly_lookup"
            : classification.intent === "least_money" || classification.intent === "worst_product"
              ? "margin_analysis"
              : "ranked_breakdown";
  return Object.freeze({
    intent: classification.intent,
    kind,
    dimension,
    metric: classification.requestedMetric,
    entities: classification.entities,
    followUpKind: classification.followUpKind,
    referenceEvidenceId: classification.referenceEvidenceId ?? null,
  });
}

function referencedFinding(viewModel: DashboardViewModel, evidenceId: string | null) {
  return evidenceId === null
    ? null
    : (viewModel.findings.findings.find((finding) =>
        finding.evidence.some((evidence) => evidence.evidenceId === evidenceId),
      ) ?? null);
}

function channelRisk(viewModel: DashboardViewModel, base: AnalystAnswer): AnalystAnswer {
  const channel = base.referencedEntities.find((entity) => entity.dimension === "channel");
  if (!channel) return base;
  const concentration = viewModel.findings.findings.find(
    (finding) =>
      finding.findingType === "revenue_concentration" &&
      finding.affectedDimension === "channel" &&
      finding.affectedSegment === channel.key,
  );
  return answer(viewModel, {
    ...base,
    directAnswer: `${channel.label} is the strongest sales channel in this view. That is not necessarily bad.`,
    supportingFact: concentration?.summary ?? base.supportingFact,
    whatItMeans: concentration
      ? "A large share of sales comes through this channel. That reliance is worth monitoring, but the data does not establish a future risk."
      : "Strong performance is not itself a problem. The current checks do not flag a material concentration concern for this channel.",
    nextStep:
      "Compare this channel with the other sales channels and review how dependent sales are on it.",
    evidence: concentration?.evidence[0] ?? base.evidence,
    evidenceTitle: concentration?.title ?? base.evidenceTitle,
    evidenceDescription: concentration
      ? "See the verified channel concentration calculation and supporting records."
      : base.evidenceDescription,
  });
}

function adaptFollowUp(answer: AnalystAnswer, kind: AnalystPlan["followUpKind"]): AnalystAnswer {
  if (kind === "none" || kind === "entity") return answer;

  if (kind === "evidence") {
    return Object.freeze({
      ...answer,
      directAnswer: "Here is how we know.",
      supportingFact:
        answer.supportingFact ??
        "This answer uses the verified calculation and evidence for the current selection.",
      whatItMeans:
        "The supporting fact and How we know details are tied to the active data and filters.",
      nextStep: "Open How we know to inspect the calculation context and supporting evidence.",
    });
  }

  if (kind === "risk") {
    return Object.freeze({
      ...answer,
      directAnswer: `${answer.directAnswer} It is worth checking before you make a change.`,
      whatItMeans:
        "This is a measured pattern, not a prediction of a future outcome or proof of why it happened.",
      nextStep:
        answer.nextStep ?? "Compare the affected area in Explore before deciding what to do.",
    });
  }

  return Object.freeze({
    ...answer,
    directAnswer:
      answer.supportingFact ??
      "The answer is based on the verified calculation for the current data selection.",
    whatItMeans:
      "The data identifies what changed or stands out; it does not prove the reason it happened.",
    nextStep:
      answer.nextStep ?? "Open Explore to compare the relevant business area in more detail.",
  });
}

/** Executes a closed analysis plan over existing engine-derived dashboard results; no formula lives here. */
export function executeAnalystPlan(
  plan: AnalystPlan,
  viewModel: DashboardViewModel,
): AnalystAnswer {
  if (plan.followUpKind !== "none" && plan.followUpKind !== "entity") {
    const baseAnswer = executeAnalystPlan(
      Object.freeze({ ...plan, followUpKind: "none" }),
      viewModel,
    );
    if (plan.followUpKind === "risk" && plan.intent === "best_channel") {
      return channelRisk(viewModel, baseAnswer);
    }
    const finding = referencedFinding(viewModel, plan.referenceEvidenceId);
    const currentAnswer = finding
      ? fromFinding(viewModel, plan.intent, viewModel.findings.findings.indexOf(finding))
      : baseAnswer;
    return adaptFollowUp(currentAnswer, plan.followUpKind);
  }
  const entity = plan.entities[0];
  switch (plan.intent) {
    case "business_overview":
      return overview(viewModel);
    case "priority":
      return priority(viewModel, "priority");
    case "improvement":
      return priority(viewModel, "improvement");
    case "recent_changes":
      return fromFinding(viewModel, plan.intent);
    case "sales_decline":
    case "sales_increase":
      return periodChange(viewModel, plan.intent);
    case "unusual_activity":
      return unusual(viewModel);
    case "most_money":
      return rankedAnswer(
        viewModel,
        plan.intent,
        entity?.dimension ?? "product",
        entity,
        byHighestProfit,
        "gross profit",
      );
    case "least_money":
      return losingMoney(viewModel);
    case "worst_product":
      return rankedAnswer(
        viewModel,
        plan.intent,
        "product",
        entity?.dimension === "product" ? entity : undefined,
        byLowestProfit,
        "gross profit",
      );
    case "best_product": {
      const basis =
        plan.metric === "revenue"
          ? "revenue"
          : plan.metric === "quantity"
            ? "quantity"
            : "gross profit";
      const choose =
        basis === "revenue"
          ? byHighestRevenue
          : basis === "quantity"
            ? (values: readonly BreakdownEntry[]) =>
                [...values].sort(
                  (left, right) =>
                    right.quantity - left.quantity || left.label.localeCompare(right.label),
                )[0] ?? null
            : byHighestProfit;
      return rankedAnswer(
        viewModel,
        plan.intent,
        "product",
        entity?.dimension === "product" ? entity : undefined,
        choose,
        basis,
      );
    }
    case "best_channel":
      return rankedAnswer(
        viewModel,
        plan.intent,
        "channel",
        entity?.dimension === "channel" ? entity : undefined,
        byHighestRevenue,
        "revenue",
      );
    case "region_performance":
      return rankedAnswer(
        viewModel,
        plan.intent,
        "region",
        entity?.dimension === "region" ? entity : undefined,
        byHighestRevenue,
        "revenue",
      );
    case "going_well":
      return rankedAnswer(
        viewModel,
        plan.intent,
        entity?.dimension ?? "product",
        entity,
        byHighestProfit,
        "gross profit",
      );
  }
}

export function analystEvidenceIds(answer: AnalystAnswer): readonly string[] {
  return answer.evidence ? Object.freeze([answer.evidence.evidenceId]) : Object.freeze([]);
}

export function analystEvidenceMatches(
  answer: AnalystAnswer,
  evidence: readonly EvidenceReference[],
): boolean {
  return (
    answer.evidence === null ||
    evidence.some((item) => item.evidenceId === answer.evidence?.evidenceId)
  );
}
