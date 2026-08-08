import type { FindingRuleConfiguration } from "./types.ts";

/**
 * Project defaults, deliberately visible and overridable. They are materiality guardrails rather
 * than universal business benchmarks.
 */
export const DEFAULT_FINDING_RULE_CONFIGURATION: FindingRuleConfiguration = Object.freeze({
  minimumAbsoluteChangeCents: 10_000,
  minimumSegmentChangeCents: 7_500,
  minimumChangeBasisPoints: 1_000,
  concentrationTopOneBasisPoints: 3_000,
  weakMarketingRoiBasisPoints: 0,
  minimumMarketingSpendCents: 5_000,
  minimumSupportingOrders: 5,
  maximumVisibleFindings: 6,
});
