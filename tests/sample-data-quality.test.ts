// @vitest-environment node

import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

import { independentlyCalculateControls, parseDatasetCsv } from "../scripts/verify-sample-data.ts";

const CSV_URL = new URL("../data/sample/insightai-orders.csv", import.meta.url);

let csv = "";
let rows: ReturnType<typeof parseDatasetCsv> = [];

beforeAll(async () => {
  csv = await readFile(CSV_URL, "utf8");
  rows = parseDatasetCsv(csv);
});

describe("generated order-line data quality", () => {
  it("uses unique line IDs while retaining valid repeated order IDs", () => {
    const lineIds = new Set(rows.map((row) => row.order_line_id));
    const orderIds = new Set(rows.map((row) => row.order_id));

    expect(lineIds.size).toBe(rows.length);
    expect(orderIds.size).toBeLessThan(rows.length);
    expect(
      [...orderIds].some((orderId) => rows.filter((row) => row.order_id === orderId).length > 1),
    ).toBe(true);
  });

  it("reconciles arithmetic and rejects invalid quantities or dates", () => {
    for (const row of rows) {
      const quantity = Number(row.quantity);
      const unitPrice = Number(row.unit_price);
      const unitCost = Number(row.unit_cost);
      const discount = Number(row.discount_amount);

      expect(quantity).toBeGreaterThan(0);
      expect(Number.isInteger(quantity)).toBe(true);
      expect(Number(row.revenue)).toBeCloseTo(quantity * unitPrice - discount, 2);
      expect(Number(row.cost)).toBeCloseTo(quantity * unitCost, 2);
      expect(row.order_date >= "2024-01-01").toBe(true);
      expect(row.order_date <= "2025-12-31").toBe(true);
    }
  });

  it("keeps categories, regions, and channels inside documented vocabularies", () => {
    expect([...new Set(rows.map((row) => row.category))].sort()).toEqual([
      "Gifting",
      "Home",
      "Kitchen",
      "Outdoor",
      "Wellness",
      "Workspace",
    ]);
    expect([...new Set(rows.map((row) => row.region))].sort()).toEqual([
      "Central",
      "East",
      "South",
      "West",
    ]);
    expect([...new Set(rows.map((row) => row.sales_channel))].sort()).toEqual([
      "Marketplace",
      "Retail Pop-up",
      "Web",
    ]);
  });

  it("keeps every required analytical field complete while allowing controlled optional blanks", () => {
    const requiredFields = [
      "order_line_id",
      "order_id",
      "order_date",
      "customer_id",
      "product_id",
      "product_name",
      "category",
      "region",
      "sales_channel",
      "quantity",
      "unit_price",
      "unit_cost",
      "discount_amount",
      "revenue",
      "cost",
      "marketing_spend",
    ] as const;

    expect(rows.every((row) => requiredFields.every((field) => row[field] !== ""))).toBe(true);
    expect(rows.filter((row) => row.customer_segment === "")).toHaveLength(298);
    expect(rows.filter((row) => row.campaign === "")).toHaveLength(209);
  });

  it("contains no direct customer data or direct-contact patterns", () => {
    expect(csv).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(csv).not.toMatch(/\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/);
    expect(rows.every((row) => /^CUST-\d{4}$/.test(row.customer_id))).toBe(true);
  });

  it("allocates positive marketing spend to at most one line per order", () => {
    const positiveSpendLines = new Map<string, number>();
    for (const row of rows) {
      if (Number(row.marketing_spend) > 0) {
        positiveSpendLines.set(row.order_id, (positiveSpendLines.get(row.order_id) ?? 0) + 1);
      }
    }

    expect([...positiveSpendLines.values()].every((count) => count === 1)).toBe(true);
  });

  it("preserves the documented repeat-customer definition", () => {
    const customerOrders = new Map<string, Set<string>>();
    for (const row of rows) {
      const orders = customerOrders.get(row.customer_id) ?? new Set<string>();
      orders.add(row.order_id);
      customerOrders.set(row.customer_id, orders);
    }

    const returning = [...customerOrders].filter(([, orders]) => orders.size >= 2);
    expect(returning).toHaveLength(517);
    expect(returning.length / customerOrders.size).toBeCloseTo(0.430833, 6);
    expect(returning.length * 2).not.toBe(customerOrders.size);
    expect(customerOrders.size - returning.length).toBe(683);
  });

  it("recomputes the expected headline controls independently", () => {
    const controls = independentlyCalculateControls(rows);

    expect(controls.rowCount).toBe(6_909);
    expect(controls.distinctOrderCount).toBe(4_310);
    expect(controls.distinctCustomerCount).toBe(1_200);
    expect(controls.totalRevenue).toBe(778_231.1);
    expect(controls.totalGrossProfit).toBe(317_814.1);
  });
});
