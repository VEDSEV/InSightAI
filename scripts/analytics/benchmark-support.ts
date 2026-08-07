export const BENCHMARK_BASE_ROW_COUNT = 6_909;
export const BENCHMARK_FIXTURE_SCALES = Object.freeze([1, 8, 16] as const);

export type BenchmarkFixtureScale = (typeof BENCHMARK_FIXTURE_SCALES)[number];
export type BenchmarkFixtureSelector = "base" | "x1" | "x8" | "x16" | "all";

export type BenchmarkCliOptions = {
  readonly quick: boolean;
  readonly fixtureScales: readonly BenchmarkFixtureScale[];
};

export const X8_ANALYTICS_TARGETS_MS = Object.freeze({
  all_core_kpis: 1_500,
  all_six_breakdowns: 2_000,
  all_four_comparison_modes: 4_000,
  daily_and_weekly_anomalies: 1_500,
} as const);

export type TargetedAnalyticsPhase = keyof typeof X8_ANALYTICS_TARGETS_MS;

export const PRE_OPTIMIZATION_X8_MEDIANS_MS = Object.freeze({
  all_core_kpis: 16_770.8671,
  all_six_breakdowns: 11_509.907,
  all_four_comparison_modes: 30_548.7244,
  daily_and_weekly_anomalies: 4_400.9679,
} as const satisfies Readonly<Record<TargetedAnalyticsPhase, number>>);

export type PerformanceTargetAssessment = {
  readonly maximumMedianMs: number;
  readonly measuredMedianMs: number;
  readonly passed: boolean;
  readonly baselineMedianMs: number;
  readonly speedupFactor: number;
  readonly medianReductionPercent: number;
};

function isFixtureScale(value: number): value is BenchmarkFixtureScale {
  return BENCHMARK_FIXTURE_SCALES.some((scale) => scale === value);
}

function scaleForSelector(selector: BenchmarkFixtureSelector): readonly BenchmarkFixtureScale[] {
  switch (selector) {
    case "all":
      return BENCHMARK_FIXTURE_SCALES;
    case "base":
    case "x1":
      return Object.freeze([1]);
    case "x8":
      return Object.freeze([8]);
    case "x16":
      return Object.freeze([16]);
  }
}

export function parseBenchmarkArguments(args: readonly string[]): BenchmarkCliOptions {
  let quick = false;
  let selector: BenchmarkFixtureSelector = "all";
  let fixtureArgumentSeen = false;

  for (const argument of args) {
    if (argument === "--quick") {
      if (quick) {
        throw new Error("The --quick option may be supplied only once.");
      }
      quick = true;
      continue;
    }

    if (argument.startsWith("--fixture=")) {
      if (fixtureArgumentSeen) {
        throw new Error("The --fixture option may be supplied only once.");
      }
      const value = argument.slice("--fixture=".length);
      if (
        value !== "all" &&
        value !== "base" &&
        value !== "x1" &&
        value !== "x8" &&
        value !== "x16"
      ) {
        throw new Error(`Unknown benchmark fixture selector: ${value || "(blank)"}.`);
      }
      selector = value;
      fixtureArgumentSeen = true;
      continue;
    }

    throw new Error(
      `Unknown benchmark argument: ${argument}. Usage: benchmark-analytics.ts [--quick] [--fixture=all|base|x1|x8|x16]`,
    );
  }

  return Object.freeze({ quick, fixtureScales: scaleForSelector(selector) });
}

export function benchmarkRowCount(scale: number): number {
  if (!Number.isSafeInteger(scale) || scale <= 0 || !isFixtureScale(scale)) {
    throw new RangeError(`Unsupported benchmark fixture scale: ${scale}.`);
  }
  return BENCHMARK_BASE_ROW_COUNT * scale;
}

export function benchmarkFixtureId(scale: BenchmarkFixtureScale): string {
  return scale === 1 ? "phase2-approved" : `phase2-approved-x${scale}`;
}

export function isTargetedAnalyticsPhase(phase: string): phase is TargetedAnalyticsPhase {
  return Object.hasOwn(X8_ANALYTICS_TARGETS_MS, phase);
}

function round(value: number, decimalPlaces: number): number {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

export function assessX8PerformanceTarget(
  fixtureScale: BenchmarkFixtureScale,
  phase: string,
  measuredMedianMs: number,
): PerformanceTargetAssessment | null {
  if (fixtureScale !== 8 || !isTargetedAnalyticsPhase(phase)) {
    return null;
  }
  if (!Number.isFinite(measuredMedianMs) || measuredMedianMs <= 0) {
    throw new RangeError("A measured benchmark median must be a positive finite number.");
  }

  const maximumMedianMs = X8_ANALYTICS_TARGETS_MS[phase];
  const baselineMedianMs = PRE_OPTIMIZATION_X8_MEDIANS_MS[phase];
  return Object.freeze({
    maximumMedianMs,
    measuredMedianMs,
    passed: measuredMedianMs < maximumMedianMs,
    baselineMedianMs,
    speedupFactor: round(baselineMedianMs / measuredMedianMs, 4),
    medianReductionPercent: round(
      ((baselineMedianMs - measuredMedianMs) / baselineMedianMs) * 100,
      4,
    ),
  });
}
