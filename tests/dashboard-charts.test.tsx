import { describe, expect, it } from "vitest";

import { shouldDisableChartAnimation } from "@/features/dashboard/dashboard-charts";

describe("dashboard chart motion", () => {
  it("disables chart animation when the user prefers reduced motion", () => {
    expect(shouldDisableChartAnimation(true)).toBe(true);
    expect(shouldDisableChartAnimation(false)).toBe(false);
  });
});
