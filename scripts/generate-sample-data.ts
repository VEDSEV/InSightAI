import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadGeneratorConfig } from "./sample-data/config.ts";
import { calculateControlTotals } from "./sample-data/controls.ts";
import { serializeDataset } from "./sample-data/csv.ts";
import { generateDataset } from "./sample-data/generator.ts";
import {
  calculateDistributionProfile,
  renderDistributionProfileMarkdown,
} from "./sample-data/profile.ts";
import { buildScenarioManifest } from "./sample-data/scenario-manifest.ts";
import { validateGeneratedDataset } from "./sample-data/validation.ts";

const DEFAULT_OUTPUT_URL = new URL("../data/sample/", import.meta.url);

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function generateSampleArtifacts(outputUrl: URL = DEFAULT_OUTPUT_URL): Promise<{
  readonly rowCount: number;
  readonly orderCount: number;
  readonly customerCount: number;
  readonly checksum: string;
}> {
  const config = await loadGeneratorConfig();
  const rows = generateDataset(config);
  const csv = serializeDataset(rows);
  const checksum = createHash("sha256").update(csv, "utf8").digest("hex");
  const controls = calculateControlTotals(rows, config, checksum);
  const profile = calculateDistributionProfile(rows, config, checksum);
  const manifest = buildScenarioManifest(rows, config, controls);

  validateGeneratedDataset(rows, config, manifest);
  await mkdir(outputUrl, { recursive: true });
  await Promise.all([
    writeFile(new URL("insightai-orders.csv", outputUrl), csv, "utf8"),
    writeFile(new URL("control-totals.json", outputUrl), json(controls), "utf8"),
    writeFile(new URL("scenario-manifest.json", outputUrl), json(manifest), "utf8"),
    writeFile(new URL("distribution-profile.json", outputUrl), json(profile), "utf8"),
    writeFile(
      new URL("DISTRIBUTION_PROFILE.md", outputUrl),
      renderDistributionProfileMarkdown(profile),
      "utf8",
    ),
    writeFile(
      new URL("insightai-orders.csv.sha256", outputUrl),
      `${checksum}  insightai-orders.csv\n`,
      "utf8",
    ),
  ]);

  return {
    rowCount: controls.rowCount,
    orderCount: controls.distinctOrderCount,
    customerCount: controls.distinctCustomerCount,
    checksum,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generateSampleArtifacts();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
