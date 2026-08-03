// @vitest-environment node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { verifySampleDataset } from "../scripts/verify-sample-data.ts";

describe("generated dataset artifacts", () => {
  it("passes the independent artifact verifier", async () => {
    await expect(verifySampleDataset()).resolves.toMatchObject({
      valid: true,
      rowCount: 6_909,
      orderCount: 4_310,
      customerCount: 1_200,
    });
  });

  it("keeps the checksum file synchronized with the generated CSV", async () => {
    const [csv, checksumFile] = await Promise.all([
      readFile(new URL("../data/sample/insightai-orders.csv", import.meta.url), "utf8"),
      readFile(new URL("../data/sample/insightai-orders.csv.sha256", import.meta.url), "utf8"),
    ]);
    const expected = checksumFile.trim().split(/\s+/)[0];

    expect(createHash("sha256").update(csv).digest("hex")).toBe(expected);
  });
});
