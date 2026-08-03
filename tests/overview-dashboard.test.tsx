import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { OverviewDashboard } from "@/features/dashboard/overview-dashboard";

describe("Overview dashboard shell", () => {
  it("renders the shell and clearly labels all business content as demonstration data", () => {
    render(
      <AppShell>
        <OverviewDashboard />
      </AppShell>,
    );

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getByLabelText("Demonstration data notice")).toHaveTextContent(
      "Not connected to business data",
    );
    expect(screen.getByText("How is revenue changing over time?")).toBeInTheDocument();
    expect(screen.getByText("Which products merit a closer look?")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Linen Throw Set" })).toBeInTheDocument();
  });

  it("presents preview filters as disabled rather than pretending they work", () => {
    render(<OverviewDashboard />);

    expect(screen.getByLabelText("Global date range")).toBeDisabled();
    expect(screen.getByLabelText("Category")).toBeDisabled();
    expect(screen.getByLabelText("Region")).toBeDisabled();
    expect(screen.getByLabelText("Channel")).toBeDisabled();
  });
});
