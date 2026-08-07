import type {
  DateInterval,
  MetricResult,
  MetricValue,
  NonComputableValue,
  RateMetricValue,
} from "@/analytics";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const countFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function moneyNumber(cents: number): number {
  return cents / 100;
}

function rateNumber(value: RateMetricValue): number {
  return value.basisPoints / 10_000;
}

export function formatCurrencyCents(cents: number): string {
  return currencyFormatter.format(moneyNumber(cents));
}

export function formatCompactCurrencyCents(cents: number): string {
  return compactCurrencyFormatter.format(moneyNumber(cents));
}

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function formatDurationMs(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}

export function formatRate(value: RateMetricValue): string {
  return percentFormatter.format(rateNumber(value));
}

export function formatSignedRate(value: RateMetricValue): string {
  const formatted = formatRate(value);
  return value.basisPoints > 0 ? `+${formatted}` : formatted;
}

export function formatPercentagePointDelta(value: RateMetricValue): string {
  const amount = value.basisPoints / 100;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(amount);
  return `${formatted} pp`;
}

export function formatMetricValue(value: MetricValue | null): string {
  if (value === null) return "—";
  switch (value.kind) {
    case "money":
      return formatCurrencyCents(value.cents);
    case "rational_money":
      return formatCurrencyCents(value.numeratorCents / value.denominator);
    case "count":
    case "quantity":
      return formatCount(value.value);
    case "rate":
      return formatRate(value);
  }
}

export function formatMetricCompactValue(value: MetricValue | null): string {
  if (value === null) return "—";
  if (value.kind === "money") return formatCompactCurrencyCents(value.cents);
  return formatMetricValue(value);
}

export function formatDateInterval(interval: DateInterval): string {
  const display = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const start = display.format(new Date(`${interval.start}T00:00:00Z`));
  const end = display.format(new Date(`${interval.end}T00:00:00Z`));
  return start === end ? start : `${start} – ${end}`;
}

export function formatNonComputable(value: NonComputableValue | null): string | null {
  return value === null ? null : value.message;
}

export function formatComparison(result: MetricResult | null): {
  readonly label: string;
  readonly accessibleLabel: string;
  readonly direction: "positive" | "negative" | "neutral";
  readonly unavailable: boolean;
} {
  if (result === null || result.status !== "ok") {
    const message = result?.message ?? "No complete comparison period is available.";
    return {
      label: "Comparison unavailable",
      accessibleLabel: message,
      direction: "neutral",
      unavailable: true,
    };
  }

  const change = result.percentageChange;
  const absolute = result.absoluteChange;
  if (change === null || change.kind === "non_computable_value") {
    return {
      label: "Comparison unavailable",
      accessibleLabel: change?.message ?? "No comparison percentage is available.",
      direction: "neutral",
      unavailable: true,
    };
  }

  const isMargin = result.metricId === "gross_margin";
  const detail =
    isMargin && absolute?.kind === "rate"
      ? formatPercentagePointDelta(absolute)
      : formatSignedRate(change);
  const direction =
    change.basisPoints > 0 ? "positive" : change.basisPoints < 0 ? "negative" : "neutral";
  return {
    label: detail,
    accessibleLabel: `${result.label} changed ${detail} versus ${
      result.comparisonPeriod ? formatDateInterval(result.comparisonPeriod) : "the prior period"
    }.`,
    direction,
    unavailable: false,
  };
}
