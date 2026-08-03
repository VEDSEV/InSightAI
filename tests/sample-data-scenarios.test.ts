// @vitest-environment node

import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

import { parseDatasetCsv } from "../scripts/verify-sample-data.ts";

type Scenario = {
  id: string;
  expectedDirectionalResult: string;
  evidence: {
    orderLineIds: string[];
    observed: Record<string, number | string>;
  };
};

let scenarios = new Map<string, Scenario>();
let rows: ReturnType<typeof parseDatasetCsv> = [];

beforeAll(async () => {
  const [manifestText, csv] = await Promise.all([
    readFile(new URL("../data/sample/scenario-manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../data/sample/insightai-orders.csv", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText) as { scenarios: Scenario[] };
  scenarios = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));
  rows = parseDatasetCsv(csv);
});

function observed(id: string, key: string): number {
  const value = scenarios.get(id)?.evidence.observed[key];
  if (typeof value !== "number") {
    throw new Error(`Missing numeric observation ${id}.${key}`);
  }
  return value;
}

describe("documented analytical scenarios", () => {
  it("contains every required traceable scenario", () => {
    expect([...scenarios.keys()].sort()).toEqual(
      [
        "channel-variation",
        "concentration-risk",
        "controlled-anomalies",
        "declining-category",
        "high-revenue-low-margin",
        "marketing-spend-allocation",
        "negative-margin",
        "regional-variation",
        "repeat-customers",
        "seasonality",
      ].sort(),
    );
    expect(
      [...scenarios.values()].every(
        (scenario) =>
          scenario.expectedDirectionalResult.length > 0 &&
          scenario.evidence.orderLineIds.length > 0,
      ),
    ).toBe(true);
  });

  it("creates nonuniform holiday seasonality", () => {
    expect(observed("seasonality", "holidayToWinterDailyRevenueRatio")).toBeGreaterThan(1.4);
    expect(observed("seasonality", "giftingHolidayToWinterDailyRevenueRatio")).toBeGreaterThan(
      observed("seasonality", "holidayToWinterDailyRevenueRatio"),
    );
  });

  it("creates strong and declining regional patterns", () => {
    expect(observed("regional-variation", "westRevenue")).toBeGreaterThan(250_000);
    expect(observed("regional-variation", "southH2RevenueChange")).toBeLessThan(-0.2);
  });

  it("makes Marketplace less marketing-efficient than the other channels", () => {
    const marketplace = observed("channel-variation", "marketplaceMarketingRoi");
    expect(marketplace).toBeLessThan(observed("channel-variation", "webMarketingRoi"));
    expect(marketplace).toBeLessThan(observed("channel-variation", "retailMarketingRoi"));
  });

  it("keeps the three margin scenarios controlled, traceable, and analytically distinct", () => {
    const productRows = (productId: string) => rows.filter((row) => row.product_id === productId);
    const profit = (productId: string) =>
      productRows(productId).reduce((sum, row) => sum + Number(row.revenue) - Number(row.cost), 0);
    const discovery = productRows("PROD-GFT-001");
    const promotional = productRows("PROD-OUT-003");
    const cookware = productRows("PROD-KIT-001");
    const promotionalLossRows = promotional.filter((row) => Number(row.revenue) < Number(row.cost));

    expect(observed("negative-margin", "negativeMarginRowCount")).toBeGreaterThan(0);
    expect(observed("negative-margin", "negativeMarginRowCount")).toBeLessThan(150);
    expect(observed("negative-margin", "negativeMarginProductCount")).toBe(1);
    expect(discovery.length).toBeGreaterThan(0);
    expect(profit("PROD-GFT-001")).toBeLessThan(0);
    expect(profit("PROD-OUT-003")).toBeGreaterThan(0);
    expect(promotionalLossRows.length).toBeGreaterThan(0);
    expect(promotionalLossRows.length).toBeLessThan(20);
    expect(
      promotionalLossRows.every(
        (row) => row.order_date >= "2025-06-20" && row.order_date <= "2025-06-26",
      ),
    ).toBe(true);
    expect(promotional.some((row) => Number(row.revenue) > Number(row.cost))).toBe(true);
    expect(profit("PROD-KIT-001")).toBeGreaterThan(0);
    expect(cookware.every((row) => Number(row.revenue) > Number(row.cost))).toBe(true);
    expect(observed("high-revenue-low-margin", "negativeMarginRowCount")).toBe(0);
  });

  it("creates high-revenue low-margin and concentration cases", () => {
    expect(observed("high-revenue-low-margin", "productRevenue")).toBeGreaterThan(150_000);
    expect(observed("high-revenue-low-margin", "productMargin")).toBeLessThan(0.1);
    expect(observed("concentration-risk", "heroProductRevenueShare")).toBeGreaterThanOrEqual(0.3);
  });

  it("creates the defined category decline and daily anomalies", () => {
    expect(observed("declining-category", "workspaceH2RevenueChange")).toBeLessThanOrEqual(-0.2);
    expect(observed("controlled-anomalies", "spikeToTrailingMedianRatio")).toBeGreaterThan(2);
    expect(observed("controlled-anomalies", "dropToTrailingMedianRatio")).toBeLessThan(0.5);
  });
});
