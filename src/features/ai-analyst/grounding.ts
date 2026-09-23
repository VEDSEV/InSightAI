import type { EvidenceReference } from "@/analytics";
import {
  asComputableBreakdown,
  type DashboardViewModel,
} from "@/features/dashboard/analytics-adapter";
import {
  formatCurrencyCents,
  formatMetricValue,
  formatRate,
} from "@/features/dashboard/presentation-formatters";

import type { AnalystAnswer } from "./types";

const UNSUPPORTED_CAUSAL_LANGUAGE =
  /\b(caused|because of|guarantees?|will result in|definitely means)\b/iu;
// Keep the sign attached to money. `-$168.36` is a different authoritative value from `$168.36`.
const NUMBER_TOKEN = /[-+]?\$\d+(?:,\d{3})*(?:\.\d+)?(?:K|M)?|[-+]?\d+(?:\.\d+)?%/gu;

function activeEvidence(viewModel: DashboardViewModel): readonly EvidenceReference[] {
  const metrics = [...viewModel.primaryKpis, ...viewModel.secondaryKpis].map(
    (metric) => metric.evidence,
  );
  const breakdowns = Object.values(viewModel.breakdowns).flatMap(
    (breakdown) => asComputableBreakdown(breakdown)?.entries.map((entry) => entry.evidence) ?? [],
  );
  const findings = viewModel.findings.findings.flatMap((finding) => finding.evidence);
  return Object.freeze([...metrics, ...breakdowns, ...findings]);
}

function allowedValues(viewModel: DashboardViewModel): ReadonlySet<string> {
  const values = new Set<string>();
  for (const metric of [...viewModel.primaryKpis, ...viewModel.secondaryKpis]) {
    if (metric.result.status === "ok") values.add(formatMetricValue(metric.result.value));
    if (metric.comparison?.status === "ok" && metric.comparison.percentageChange?.kind === "rate") {
      values.add(formatRate(metric.comparison.percentageChange));
    }
  }
  for (const breakdown of Object.values(viewModel.breakdowns)) {
    for (const entry of asComputableBreakdown(breakdown)?.entries ?? []) {
      values.add(formatCurrencyCents(entry.revenue));
      values.add(formatCurrencyCents(entry.grossProfit));
      if (entry.grossMargin.kind === "rate") values.add(formatRate(entry.grossMargin));
      if (entry.revenueShare.kind === "rate") values.add(formatRate(entry.revenueShare));
      if (entry.profitShare.kind === "rate") values.add(formatRate(entry.profitShare));
      if (entry.comparison?.percentageRevenueChange.kind === "rate") {
        values.add(formatRate(entry.comparison.percentageRevenueChange));
      }
      if (entry.comparison) values.add(formatCurrencyCents(entry.comparison.absoluteRevenueChange));
    }
  }
  for (const finding of viewModel.findings.findings) {
    if (finding.currentValue) values.add(formatMetricValue(finding.currentValue));
    if (finding.comparisonValue) values.add(formatMetricValue(finding.comparisonValue));
  }
  return values;
}

function isLegitimatelyRoundedRate(token: string, allowed: ReadonlySet<string>): boolean {
  if (!token.endsWith("%")) return false;
  const requested = Number.parseFloat(token.slice(0, -1));
  if (!Number.isFinite(requested)) return false;
  return [...allowed].some((value) => {
    if (!value.endsWith("%")) return false;
    const exact = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(exact) && Math.abs(exact - requested) <= 0.051;
  });
}

/**
 * A final deterministic guard before a response reaches the UI. Phase 9 templates are local, but
 * this boundary also makes a future optional provider paraphrase prove that its values and evidence
 * belong to the active dataset/filter context.
 */
export function validateAnalystAnswer(
  answer: AnalystAnswer,
  viewModel: DashboardViewModel,
): string | null {
  const text = [answer.directAnswer, answer.supportingFact, answer.whatItMeans, answer.nextStep]
    .filter((part): part is string => part !== null)
    .join(" ");
  if (UNSUPPORTED_CAUSAL_LANGUAGE.test(text)) {
    return "The response used unsupported causal or guaranteed-outcome language.";
  }
  const evidence = activeEvidence(viewModel);
  if (
    answer.evidence &&
    !evidence.some((item) => item.evidenceId === answer.evidence?.evidenceId)
  ) {
    return "The response referenced evidence outside the active dataset and filter context.";
  }
  const entities = new Set(
    [
      ...viewModel.filterOptions.products,
      ...viewModel.filterOptions.categories,
      ...viewModel.filterOptions.regions,
      ...viewModel.filterOptions.channels,
    ].map((item) => item.label),
  );
  if (answer.referencedEntities.some((entity) => !entities.has(entity.label))) {
    return "The response referenced an entity outside the active dataset.";
  }
  const values = allowedValues(viewModel);
  for (const token of text.match(NUMBER_TOKEN) ?? []) {
    if (!values.has(token) && !isLegitimatelyRoundedRate(token, values)) {
      return `The response included an unsupported value: ${token}.`;
    }
  }
  return null;
}
