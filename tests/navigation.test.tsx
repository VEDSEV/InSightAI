import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Sidebar } from "@/components/layout/sidebar";

describe("application navigation", () => {
  it("marks Overview as current and identifies future sections as unavailable", () => {
    render(<Sidebar />);

    const primaryNavigation = screen.getByRole("navigation", { name: "Primary" });
    expect(primaryNavigation).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Sales").closest("[aria-disabled='true']")).toBeInTheDocument();
    expect(screen.getAllByText("Soon")).toHaveLength(6);
  });

  it("opens, closes with Escape, and returns focus in the mobile menu", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation />);

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close navigation" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("marks menu motion as removable for reduced-motion users", () => {
    render(<MobileNavigation />);

    const panel = document.getElementById("mobile-navigation-panel");
    expect(panel).toHaveClass("motion-reduce:transition-none");
  });
});
