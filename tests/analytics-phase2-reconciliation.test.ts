// @vitest-environment node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { reconcilePhase2Fixture } from "../scripts/analytics/phase2-reconciliation.ts";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const EXPECTED_CHECKS = Object.freeze({
  checksum: "66f237491182dd1e8ae2c786543e98b3157f27658e7e5c11bfa8cec07de9c5e8",
  "row count": 6_909,
  "order count": 4_310,
  "customer count": 1_200,
  quantity: 9_044,
  "revenue cents": 77_823_110,
  "cost cents": 46_041_700,
  "gross profit cents": 31_781_410,
  "marketing spend cents": 7_340_221,
  "discount cents": 2_522_290,
  "repeat customers": 517,
  "one-time customers": 683,
  "gross margin exact cross-product": 1,
  "category revenue: Gifting": 2_593_218,
  "category revenue: Home": 29_017_166,
  "category revenue: Kitchen": 23_253_510,
  "category revenue: Outdoor": 6_467_694,
  "category revenue: Wellness": 9_568_686,
  "category revenue: Workspace": 6_922_836,
  "region revenue: Central": 18_471_826,
  "region revenue: East": 19_322_210,
  "region revenue: South": 11_700_082,
  "region revenue: West": 28_328_992,
  "channel revenue: Marketplace": 20_238_052,
  "channel revenue: Retail Pop-up": 9_615_448,
  "channel revenue: Web": 47_969_610,
} satisfies Readonly<Record<string, number | string>>);

describe("approved Phase 2 analytics reconciliation", () => {
  it("passes all 26 independently recorded checksum, count, cent, and dimension checks", async () => {
    const report = await reconcilePhase2Fixture(REPOSITORY_ROOT);

    expect(Object.keys(EXPECTED_CHECKS)).toHaveLength(26);
    expect(report).toMatchObject({
      status: "passed",
      datasetVersion: "insightai-synthetic-orders-v1",
      checkCount: 26,
      passedCheckCount: 26,
      checksum: EXPECTED_CHECKS.checksum,
    });
    expect(report.checks).toHaveLength(26);
    expect(new Set(report.checks.map((check) => check.name)).size).toBe(26);
    expect(report.checks.map((check) => check.name)).toEqual(Object.keys(EXPECTED_CHECKS));

    for (const check of report.checks) {
      const expected = EXPECTED_CHECKS[check.name as keyof typeof EXPECTED_CHECKS];
      expect(expected, `unexpected reconciliation check: ${check.name}`).toBeDefined();
      expect(check, check.name).toEqual({
        name: check.name,
        expected,
        actual: expected,
        passed: true,
      });
    }
  });
});
