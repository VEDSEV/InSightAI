import { describe, expect, it } from "vitest";

import {
  basisPoints,
  dateInterval,
  isoDate,
  moneyCents,
  rational,
  type MetricResult,
} from "@/analytics";
import {
  formatComparison,
  formatCount,
  formatCurrencyCents,
  formatDateInterval,
  formatFounderDateRange,
  formatMetricValue,
  formatRate,
} from "@/features/dashboard/presentation-formatters";

describe("dashboard presentation formatters", () => {
  it("formats engine money, rate, count, and date values without changing the source values", () => {
    const rate = {
      kind: "rate" as const,
      ratio: rational(40_838, 100_000),
      basisPoints: basisPoints(4_084),
    };
    expect(formatCurrencyCents(77_823_110)).toBe("$778,231.10");
    expect(formatCount(6909)).toBe("6,909");
    expect(formatRate(rate)).toBe("40.84%");
    expect(formatMetricValue({ kind: "money", cents: moneyCents(31_781_410) })).toBe("$317,814.10");
    expect(formatDateInterval(dateInterval(isoDate("2024-01-01"), isoDate("2025-12-31")))).toBe(
      "Jan 1, 2024 – Dec 31, 2025",
    );
    expect(formatFounderDateRange("2024-01-01", "2025-12-31")).toBe("Jan 2024 – Dec 2025");
  });

  it("formats a percentage-point margin comparison distinctly from relative growth", () => {
    const result = {
      resultType: "metric",
      status: "ok",
      metricId: "gross_margin",
      label: "Gross margin",
      value: { kind: "rate", ratio: rational(4, 10), basisPoints: basisPoints(4_000) },
      unit: "percent",
      currency: null,
      precision: { kind: "basis_points", decimalPlaces: 2 },
      numerator: null,
      denominator: null,
      previousValue: null,
      absoluteChange: { kind: "rate", ratio: rational(-15, 1000), basisPoints: basisPoints(-150) },
      percentageChange: { kind: "rate", ratio: rational(-15, 415), basisPoints: basisPoints(-361) },
      engineVersion: "3.0.0",
      currentPeriod: dateInterval(isoDate("2025-01-01"), isoDate("2025-12-31")),
      comparisonPeriod: dateInterval(isoDate("2024-01-01"), isoDate("2024-12-31")),
      filterContext: {},
      assumptions: [],
      dataQuality: {},
      evidence: {},
    } as unknown as MetricResult;

    expect(formatComparison(result)).toMatchObject({
      label: "-1.5 pp",
      direction: "negative",
      unavailable: false,
    });
  });
});
