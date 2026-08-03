import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KpiCard } from "@/features/dashboard/kpi-card";
import { previewWorkspace } from "@/features/dashboard/preview-data";

describe("KPI card", () => {
  it("exposes the comparison direction and context in text", () => {
    const grossMargin = previewWorkspace.kpis.find((kpi) => kpi.id === "gross-margin");
    expect(grossMargin).toBeDefined();
    if (!grossMargin) return;

    render(<KpiCard {...grossMargin} />);

    expect(screen.getByText("Gross margin")).toBeInTheDocument();
    expect(screen.getByText("34.0%")).toBeInTheDocument();
    expect(screen.getByLabelText(grossMargin.comparisonAccessibleLabel)).toHaveTextContent(
      "−1.4 pp",
    );
    expect(screen.getByText("vs. previous 90 days")).toBeInTheDocument();
  });

  it("provides a keyboard-focusable explanation control", () => {
    const revenue = previewWorkspace.kpis[0];
    render(<KpiCard {...revenue} />);

    expect(screen.getByRole("button", { name: "Explain Revenue" })).toHaveAttribute(
      "aria-describedby",
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(revenue.explanation);
  });
});
