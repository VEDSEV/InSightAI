import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardMetric } from "@/features/dashboard/analytics-adapter";
import { KpiCard } from "@/features/dashboard/kpi-card";

const metric = {
  id: "gross_margin",
  result: {
    resultType: "metric",
    status: "ok",
    metricId: "gross_margin",
    label: "Gross margin",
    value: {
      kind: "rate",
      ratio: { numerator: 408_380, denominator: 1_000_000 },
      basisPoints: 4_084,
    },
    unit: "percent",
    currency: null,
    precision: { kind: "basis_points", decimalPlaces: 2 },
    numerator: null,
    denominator: null,
    previousValue: null,
    absoluteChange: null,
    percentageChange: null,
    engineVersion: "3.0.0",
    currentPeriod: { start: "2024-01-01", end: "2025-12-31", boundary: "inclusive" },
    comparisonPeriod: null,
    filterContext: {},
    assumptions: [],
    dataQuality: {},
    evidence: {},
  },
  comparison: null,
  evidence: {},
} as unknown as DashboardMetric;

describe("KPI card", () => {
  it("exposes a non-computable comparison in text and preserves an evidence action", () => {
    render(<KpiCard metric={metric} explanation="Test explanation" onInspectEvidence={vi.fn()} />);

    expect(screen.getByText("Gross margin")).toBeInTheDocument();
    expect(screen.getByText("40.84%")).toBeInTheDocument();
    expect(screen.getByLabelText("No complete comparison period is available.")).toHaveTextContent(
      "Comparison unavailable",
    );
    expect(
      screen.getByRole("button", { name: "Inspect evidence for Gross margin" }),
    ).toBeInTheDocument();
  });

  it("provides a keyboard-focusable explanation control", () => {
    render(<KpiCard metric={metric} explanation="Test explanation" onInspectEvidence={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Explain Gross margin" })).toHaveAttribute(
      "aria-describedby",
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("Test explanation");
  });
});
