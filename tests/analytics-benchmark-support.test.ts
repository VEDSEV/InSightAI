// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BENCHMARK_BASE_ROW_COUNT,
  BENCHMARK_FIXTURE_SCALES,
  PRE_OPTIMIZATION_X8_MEDIANS_MS,
  X8_ANALYTICS_TARGETS_MS,
  assessX8PerformanceTarget,
  benchmarkFixtureId,
  benchmarkRowCount,
  parseBenchmarkArguments,
} from "../scripts/analytics/benchmark-support.ts";

type RecordedBenchmark = {
  readonly benchmarkVersion: string;
  readonly mode: string;
  readonly protocol: {
    readonly warmupIterations: number;
    readonly measuredIterations: number;
    readonly cacheState: string;
  };
  readonly datasets: readonly {
    readonly scale: number;
    readonly rowCount: number;
    readonly phases: readonly {
      readonly phase: string;
      readonly blackhole: string;
      readonly targetAssessment: { readonly passed: boolean; readonly status: string } | null;
    }[];
    readonly performanceTargetSummary: { readonly status: string } | null;
    readonly comprehensivePublicOutput: {
      readonly digest: string;
      readonly includesEvidenceReferences: boolean;
    };
  }[];
};

type RecordedProfile = {
  readonly outputEquivalence: {
    readonly phase2Approved: {
      readonly rowCount: number;
      readonly allMatched: boolean;
      readonly blackholes: Readonly<Record<string, string>>;
    };
    readonly phase2ApprovedX8: {
      readonly rowCount: number;
      readonly allMatched: boolean;
      readonly blackholes: Readonly<Record<string, string>>;
    };
  };
};

const RECORDED_BENCHMARK = JSON.parse(
  readFileSync(new URL("../benchmarks/phase3-analytics.json", import.meta.url), "utf8"),
) as RecordedBenchmark;
const RECORDED_PROFILE = JSON.parse(
  readFileSync(new URL("../benchmarks/phase3-analytics-profile.json", import.meta.url), "utf8"),
) as RecordedProfile;

describe("analytics benchmark fixture contract", () => {
  it("defines the approved, 55k, and 100k-plus fixture sizes", () => {
    expect(BENCHMARK_BASE_ROW_COUNT).toBe(6_909);
    expect(BENCHMARK_FIXTURE_SCALES).toEqual([1, 8, 16]);
    expect(BENCHMARK_FIXTURE_SCALES.map(benchmarkRowCount)).toEqual([6_909, 55_272, 110_544]);
    expect(BENCHMARK_FIXTURE_SCALES.map(benchmarkFixtureId)).toEqual([
      "phase2-approved",
      "phase2-approved-x8",
      "phase2-approved-x16",
    ]);
    expect(benchmarkRowCount(16)).toBeGreaterThan(100_000);
  });

  it("selects one fixture for iteration without changing the full default protocol scope", () => {
    expect(parseBenchmarkArguments([])).toEqual({
      quick: false,
      fixtureScales: [1, 8, 16],
    });
    expect(parseBenchmarkArguments(["--fixture=x8"])).toEqual({
      quick: false,
      fixtureScales: [8],
    });
    expect(parseBenchmarkArguments(["--fixture=x16", "--quick"])).toEqual({
      quick: true,
      fixtureScales: [16],
    });
    expect(parseBenchmarkArguments(["--quick", "--fixture=base"])).toEqual({
      quick: true,
      fixtureScales: [1],
    });
  });

  it("rejects unsupported scales and ambiguous command-line selections", () => {
    expect(() => benchmarkRowCount(0)).toThrow(/Unsupported benchmark fixture scale/);
    expect(() => benchmarkRowCount(15)).toThrow(/Unsupported benchmark fixture scale/);
    expect(() => parseBenchmarkArguments(["--fixture=x4"])).toThrow(
      /Unknown benchmark fixture selector/,
    );
    expect(() => parseBenchmarkArguments(["--fixture=x8", "--fixture=x16"])).toThrow(/only once/);
    expect(() => parseBenchmarkArguments(["--quick", "--quick"])).toThrow(/only once/);
    expect(() => parseBenchmarkArguments(["--unknown"])).toThrow(/Unknown benchmark argument/);
  });
});

describe("x8 performance target contract", () => {
  it("records the four requested strict median targets and original baseline", () => {
    expect(X8_ANALYTICS_TARGETS_MS).toEqual({
      all_core_kpis: 1_500,
      all_six_breakdowns: 2_000,
      all_four_comparison_modes: 4_000,
      daily_and_weekly_anomalies: 1_500,
    });
    expect(PRE_OPTIMIZATION_X8_MEDIANS_MS).toEqual({
      all_core_kpis: 16_770.8671,
      all_six_breakdowns: 11_509.907,
      all_four_comparison_modes: 30_548.7244,
      daily_and_weekly_anomalies: 4_400.9679,
    });
  });

  it("evaluates targets only for the x8 analytical phases", () => {
    expect(assessX8PerformanceTarget(1, "all_core_kpis", 100)).toBeNull();
    expect(assessX8PerformanceTarget(16, "all_core_kpis", 100)).toBeNull();
    expect(assessX8PerformanceTarget(8, "csv_parsing", 100)).toBeNull();

    expect(assessX8PerformanceTarget(8, "all_core_kpis", 1_499.999)).toMatchObject({
      maximumMedianMs: 1_500,
      measuredMedianMs: 1_499.999,
      passed: true,
      baselineMedianMs: 16_770.8671,
    });
    expect(assessX8PerformanceTarget(8, "all_core_kpis", 1_500)).toMatchObject({
      passed: false,
    });
    expect(() => assessX8PerformanceTarget(8, "all_core_kpis", Number.NaN)).toThrow(
      /positive finite/,
    );
  });
});

describe("recorded benchmark artifact", () => {
  it("is the reproducible full v2 report for all three required fixture sizes", () => {
    expect(RECORDED_BENCHMARK).toMatchObject({
      benchmarkVersion: "phase3-analytics-benchmark-v2",
      mode: "full",
      protocol: {
        warmupIterations: 2,
        measuredIterations: 7,
        cacheState:
          "fresh engine per warm-up and measured analytics batch; bounded immutable contexts may be shared only by calls within that batch",
      },
    });
    expect(RECORDED_BENCHMARK.datasets.map(({ rowCount }) => rowCount)).toEqual([
      6_909, 55_272, 110_544,
    ]);
    expect(RECORDED_BENCHMARK.datasets.every((dataset) => dataset.phases.length === 6)).toBe(true);
    expect(
      RECORDED_BENCHMARK.datasets.every(
        (dataset) =>
          dataset.comprehensivePublicOutput.includesEvidenceReferences &&
          dataset.comprehensivePublicOutput.digest.startsWith("sha256:"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        new URL("../benchmarks/phase3-analytics-before-optimization.json", import.meta.url),
      ),
    ).toBe(true);
  });

  it("records authoritative passing assessments for every requested x8 target", () => {
    const x8 = RECORDED_BENCHMARK.datasets.find(({ scale }) => scale === 8);
    expect(x8?.performanceTargetSummary).toEqual(expect.objectContaining({ status: "pass" }));
    const assessments = x8?.phases.flatMap(({ targetAssessment }) =>
      targetAssessment === null ? [] : [targetAssessment],
    );
    expect(assessments).toHaveLength(4);
    expect(assessments?.every(({ passed, status }) => passed && status === "pass")).toBe(true);
  });

  it("records unchanged pre/post result-token blackholes for the base and x8 fixtures", () => {
    const equivalenceFixtures = [
      RECORDED_PROFILE.outputEquivalence.phase2Approved,
      RECORDED_PROFILE.outputEquivalence.phase2ApprovedX8,
    ];

    for (const expected of equivalenceFixtures) {
      const optimized = RECORDED_BENCHMARK.datasets.find(
        ({ rowCount }) => rowCount === expected.rowCount,
      );
      const optimizedBlackholes = Object.fromEntries(
        optimized?.phases.map(({ phase, blackhole }) => [phase, blackhole]) ?? [],
      );
      expect(expected.allMatched).toBe(true);
      expect(optimizedBlackholes).toEqual(expected.blackholes);
    }
  });
});
