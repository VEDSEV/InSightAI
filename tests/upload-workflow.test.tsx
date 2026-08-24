import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UploadWorkflow } from "@/features/ingestion/upload-workflow";

const headers = [
  "Line ID",
  "Order",
  "Order Date",
  "Customer",
  "Segment",
  "SKU",
  "Product",
  "Department",
  "Region",
  "Channel",
  "Qty",
  "Price",
  "Unit COGS",
  "Discount",
  "Net Sales",
  "COGS",
  "Campaign",
  "Ad Spend",
  "Customer Name",
  "Discount Percent",
].join(",");

const validRows = [
  "00001,ORD-0001,2025-01-02,0007,,SKU-01,Widget,Home,West,Web,2,$10.00,$6.00,$1.00,$19.00,$12.00,,0,Synthetic Customer One,5",
  "00002,ORD-0002,2025-01-03,0008,New,SKU-02,Gizmo,Kitchen,East,Web,1,$25.00,$10.00,$0.00,$25.00,$10.00,Launch,3.50,Synthetic Customer Two,0",
].join("\n");

function uploadInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("CSV input was not rendered.");
  return input;
}

async function moveToReconciliation(user: ReturnType<typeof userEvent.setup>) {
  for (let index = 0; index < 4; index += 1)
    await user.click(screen.getByRole("button", { name: "Continue" }));
}

describe("UploadWorkflow readiness", () => {
  it("uses one ready state through reconciliation and dashboard handoff", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<UploadWorkflow onComplete={onComplete} onCancel={vi.fn()} />);

    expect(screen.getByText(/raw file and rows stay in this browser session/i)).toBeInTheDocument();
    expect(screen.getByText(/minimized summary—not your raw file or rows/i)).toBeInTheDocument();

    await user.upload(uploadInput(), new File([`${headers}\n${validRows}`], "orders.csv"));
    await moveToReconciliation(user);

    expect(screen.getByText(/passed the required checks and is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/Customer Name, Discount Percent/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    const openDashboard = screen.getByRole("button", { name: "Open uploaded dashboard" });
    expect(openDashboard).toBeEnabled();
    await user.click(openDashboard);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("stops an invalid upload at reconciliation with a clear return path", async () => {
    const user = userEvent.setup();
    render(<UploadWorkflow onComplete={vi.fn()} onCancel={vi.fn()} />);
    const invalidRows = validRows.replace(",Web,2,$10.00", ",Web,not-a-number,$10.00");

    await user.upload(uploadInput(), new File([`${headers}\n${invalidRows}`], "invalid.csv"));
    await moveToReconciliation(user);

    expect(screen.getByText("More information is needed before analysis")).toBeInTheDocument();
    expect(screen.queryByText("Ready to analyze")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to Transform" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Return to Transform" }));
    expect(
      screen.getByRole("heading", { name: "Configure explicit transformations" }),
    ).toBeInTheDocument();
  });
});
