// @vitest-environment node

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadGeneratorConfig } from "../scripts/sample-data/config.ts";
import { calculateControlTotals } from "../scripts/sample-data/controls.ts";
import { serializeDataset } from "../scripts/sample-data/csv.ts";
import { generateDataset } from "../scripts/sample-data/generator.ts";
import { buildScenarioManifest } from "../scripts/sample-data/scenario-manifest.ts";
import { validateGeneratedDataset } from "../scripts/sample-data/validation.ts";

describe("synthetic dataset generator", () => {
  it("reproduces byte-identical CSV content from the fixed seed", async () => {
    const config = await loadGeneratorConfig();
    const first = serializeDataset(generateDataset(config));
    const second = serializeDataset(generateDataset(config));

    expect(second).toBe(first);
    expect(createHash("sha256").update(first).digest("hex")).toBe(
      "66f237491182dd1e8ae2c786543e98b3157f27658e7e5c11bfa8cec07de9c5e8",
    );
  });

  it("changes the generated records when the seed changes", async () => {
    const config = await loadGeneratorConfig();
    const baseline = serializeDataset(generateDataset(config));
    const alternate = serializeDataset(generateDataset({ ...config, seed: config.seed + 1 }));

    expect(alternate).not.toBe(baseline);
  });

  it("passes the generator's schema, grain, and scenario validation", async () => {
    const config = await loadGeneratorConfig();
    const rows = generateDataset(config);
    const csv = serializeDataset(rows);
    const checksum = createHash("sha256").update(csv).digest("hex");
    const controls = calculateControlTotals(rows, config, checksum);
    const manifest = buildScenarioManifest(rows, config, controls);

    expect(() => validateGeneratedDataset(rows, config, manifest)).not.toThrow();
    expect(rows).toHaveLength(6_909);
    expect(rows[0]?.order_date).toBe("2024-01-01");
    expect(rows.at(-1)?.order_date).toBe("2025-12-31");
  });
});
