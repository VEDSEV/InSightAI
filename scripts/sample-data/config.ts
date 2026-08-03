import { readFile } from "node:fs/promises";

import type { CustomerSegmentConfig, GeneratorConfig, WeightedInteger } from "./types.ts";

export const DEFAULT_CONFIG_URL = new URL(
  "../../data/sample/generator-config.json",
  import.meta.url,
);

function assertIsoDate(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must be an ISO calendar date.`);
  }
}

function assertWeightedIntegers(value: unknown, name: string): asserts value is WeightedInteger[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(
      (entry) =>
        typeof entry !== "object" ||
        entry === null ||
        !Number.isInteger((entry as WeightedInteger).value) ||
        (entry as WeightedInteger).value <= 0 ||
        typeof (entry as WeightedInteger).weight !== "number" ||
        (entry as WeightedInteger).weight <= 0,
    )
  ) {
    throw new Error(`${name} must contain positive integer values and weights.`);
  }
}

function assertRate(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || value < 0 || value > 1) {
    throw new Error(`${name} must be a number from zero through one.`);
  }
}

function assertCustomerSegmentConfig(
  value: unknown,
  name: string,
): asserts value is CustomerSegmentConfig {
  if (
    typeof value !== "object" ||
    value === null ||
    !Number.isInteger((value as CustomerSegmentConfig).count) ||
    (value as CustomerSegmentConfig).count <= 0 ||
    typeof (value as CustomerSegmentConfig).repeatWeight !== "number" ||
    (value as CustomerSegmentConfig).repeatWeight <= 0
  ) {
    throw new Error(`${name} contains an invalid customer population value.`);
  }
  assertRate((value as CustomerSegmentConfig).repeatProbability, `${name}.repeatProbability`);
}

export async function loadGeneratorConfig(
  configUrl: URL = DEFAULT_CONFIG_URL,
): Promise<GeneratorConfig> {
  const parsed: unknown = JSON.parse(await readFile(configUrl, "utf8"));

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Generator configuration must be a JSON object.");
  }

  const config = parsed as Partial<GeneratorConfig>;
  assertIsoDate(config.dateStart, "dateStart");
  assertIsoDate(config.dateEnd, "dateEnd");
  assertWeightedIntegers(config.lineCountWeights, "lineCountWeights");
  assertWeightedIntegers(config.quantityWeights, "quantityWeights");
  assertCustomerSegmentConfig(config.customerSegments?.loyal, "customerSegments.loyal");
  assertCustomerSegmentConfig(config.customerSegments?.occasional, "customerSegments.occasional");
  assertCustomerSegmentConfig(config.customerSegments?.new, "customerSegments.new");
  assertRate(
    config.optionalMissingness?.customerSegmentRate,
    "optionalMissingness.customerSegmentRate",
  );
  assertRate(
    config.optionalMissingness?.campaignOrderRate,
    "optionalMissingness.campaignOrderRate",
  );

  if (
    typeof config.datasetVersion !== "string" ||
    typeof config.generatorVersion !== "string" ||
    typeof config.sourceRevision !== "string" ||
    !Number.isInteger(config.seed) ||
    typeof config.baseOrdersPerDay !== "number" ||
    config.baseOrdersPerDay <= 0 ||
    config.currency !== "USD" ||
    config.timezone !== "America/Chicago" ||
    !config.customerSegments ||
    !config.optionalMissingness
  ) {
    throw new Error("Generator configuration contains an invalid required value.");
  }

  if (config.dateStart > config.dateEnd) {
    throw new Error("dateStart must not be after dateEnd.");
  }

  return config as GeneratorConfig;
}
