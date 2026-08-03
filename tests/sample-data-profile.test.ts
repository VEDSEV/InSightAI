// @vitest-environment node

import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

type Distribution = {
  count: number;
  minimum: number;
  maximum: number;
  mean: number;
  median: number;
  percentiles: Record<string, number>;
};

type Profile = {
  orderLinesPerOrder: Distribution;
  quantityPerLine: Distribution & { frequency: Record<string, number> };
  ordersPerCustomer: Distribution;
  orderRevenue: Distribution;
  discounts: { rowsWithDiscount: number; rowRate: number; totalDiscount: number };
  marketingSpend: {
    rowsWithSpend: number;
    rowRate: number;
    ordersWithSpend: number;
    orderRate: number;
    totalSpend: number;
  };
  revenueShares: Record<string, Record<string, number>>;
  optionalFieldMissingness: {
    customerSegment: { blankRows: number; rowRate: number; blankCustomers: number };
    campaign: { blankRows: number; rowRate: number; blankOrders: number };
  };
  customerFrequency: {
    oneTimeCustomerCount: number;
    repeatCustomerCount: number;
    repeatCustomerRate: number;
  };
};

let profile: Profile;

beforeAll(async () => {
  profile = JSON.parse(
    await readFile(new URL("../data/sample/distribution-profile.json", import.meta.url), "utf8"),
  ) as Profile;
});

function expectShareTotal(values: Record<string, number>): void {
  expect(Object.values(values).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);
}

describe("dataset distribution profile guardrails", () => {
  it("keeps order-line and quantity outcomes within configured generator support", () => {
    expect(profile.orderLinesPerOrder.minimum).toBe(1);
    expect(profile.orderLinesPerOrder.maximum).toBe(4);
    expect(profile.orderLinesPerOrder.mean).toBeGreaterThanOrEqual(1);
    expect(profile.orderLinesPerOrder.mean).toBeLessThanOrEqual(4);
    expect(profile.quantityPerLine.minimum).toBe(1);
    expect(profile.quantityPerLine.maximum).toBe(3);
    expect(Object.values(profile.quantityPerLine.frequency).reduce((a, b) => a + b, 0)).toBe(
      profile.quantityPerLine.count,
    );
    expect(Object.values(profile.quantityPerLine.frequency).every((count) => count > 0)).toBe(true);
  });

  it("retains useful customer and order-revenue variation", () => {
    expect(profile.customerFrequency.oneTimeCustomerCount).toBeGreaterThan(0);
    expect(profile.customerFrequency.repeatCustomerCount).toBeGreaterThan(0);
    expect(
      profile.customerFrequency.oneTimeCustomerCount +
        profile.customerFrequency.repeatCustomerCount,
    ).toBe(profile.ordersPerCustomer.count);
    expect(profile.customerFrequency.repeatCustomerRate).not.toBe(0.5);
    expect(profile.ordersPerCustomer.maximum).toBeGreaterThan(profile.ordersPerCustomer.median);
    expect(profile.orderRevenue.minimum).toBeGreaterThan(0);
    expect(profile.orderRevenue.percentiles.p95).toBeGreaterThan(profile.orderRevenue.median);
    expect(profile.orderRevenue.maximum).toBeGreaterThanOrEqual(
      profile.orderRevenue.percentiles.p99,
    );
  });

  it("profiles discount and marketing allocation without degenerate all-or-none outcomes", () => {
    expect(profile.discounts.rowsWithDiscount).toBeGreaterThan(0);
    expect(profile.discounts.rowRate).toBeGreaterThan(0);
    expect(profile.discounts.rowRate).toBeLessThan(1);
    expect(profile.discounts.totalDiscount).toBeGreaterThan(0);
    expect(profile.marketingSpend.rowsWithSpend).toBe(profile.marketingSpend.ordersWithSpend);
    expect(profile.marketingSpend.orderRate).toBeGreaterThan(0);
    expect(profile.marketingSpend.orderRate).toBeLessThan(1);
    expect(profile.marketingSpend.totalSpend).toBeGreaterThan(0);
  });

  it("keeps revenue-share profiles complete and normalized", () => {
    expectShareTotal(profile.revenueShares.product);
    expectShareTotal(profile.revenueShares.category);
    expectShareTotal(profile.revenueShares.region);
    expectShareTotal(profile.revenueShares.channel);
  });

  it("keeps optional missingness present but controlled", () => {
    expect(profile.optionalFieldMissingness.customerSegment.blankRows).toBeGreaterThan(0);
    expect(profile.optionalFieldMissingness.customerSegment.blankCustomers).toBeGreaterThan(0);
    expect(profile.optionalFieldMissingness.customerSegment.rowRate).toBeLessThan(0.1);
    expect(profile.optionalFieldMissingness.campaign.blankRows).toBeGreaterThan(0);
    expect(profile.optionalFieldMissingness.campaign.blankOrders).toBeGreaterThan(0);
    expect(profile.optionalFieldMissingness.campaign.rowRate).toBeLessThan(0.1);
  });
});
