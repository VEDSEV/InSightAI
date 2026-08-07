import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  ORDER_LINE_CSV_COLUMNS,
  createAnalyticsEngine,
  createDateInterval,
  normalizeRawOrderLines,
  parseOrderLineCsv,
  validateDataset,
  validateOrderLines,
  type AnalyticsEngine,
  type AnalyticsResult,
  type BreakdownDimension,
  type ComparisonDefinition,
  type DateInterval,
  type MetricId,
  type MetricResult,
  type MetricValue,
  type RawOrderLine,
  type ValidationConfiguration,
  type ValidatedDataset,
} from "../src/analytics/index.ts";
import {
  BENCHMARK_BASE_ROW_COUNT,
  PRE_OPTIMIZATION_X8_MEDIANS_MS,
  X8_ANALYTICS_TARGETS_MS,
  assessX8PerformanceTarget,
  benchmarkFixtureId,
  benchmarkRowCount,
  parseBenchmarkArguments,
  type BenchmarkFixtureScale,
  type PerformanceTargetAssessment,
} from "./analytics/benchmark-support.ts";
import { loadPhase2Fixture, type LoadedPhase2Fixture } from "./analytics/phase2-reconciliation.ts";

const CORE_METRIC_IDS = Object.freeze([
  "total_revenue",
  "total_cost",
  "gross_profit",
  "gross_margin",
  "distinct_orders",
  "order_lines",
  "total_quantity",
  "average_order_value",
  "unique_customers",
  "one_time_customers_within_selection",
  "repeat_customers_within_selection",
  "repeat_customer_rate_within_selection",
  "one_time_customers_full_dataset",
  "repeat_customers_full_dataset",
  "repeat_customer_rate_full_dataset",
  "total_discounts",
  "total_marketing_spend",
  "marketing_contribution",
  "marketing_roi",
] as const satisfies readonly MetricId[]);

const BREAKDOWN_DIMENSIONS = Object.freeze([
  "product",
  "category",
  "region",
  "channel",
  "customer_segment",
  "campaign",
] as const satisfies readonly BreakdownDimension[]);

type BenchmarkProtocol = {
  readonly warmupIterations: number;
  readonly measuredIterations: number;
};

type BenchmarkPhaseResult = {
  readonly phase: string;
  readonly unit: "milliseconds";
  readonly warmupIterations: number;
  readonly measuredIterations: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly minimumMs: number;
  readonly maximumMs: number;
  readonly blackhole: string;
  readonly targetAssessment: RecordedTargetAssessment | null;
  readonly processMemory: PhaseMemoryContext;
};

type ProcessMemorySnapshot = {
  readonly rssBytes: number;
  readonly heapTotalBytes: number;
  readonly heapUsedBytes: number;
  readonly externalBytes: number;
  readonly arrayBuffersBytes: number;
};

type PhaseMemoryContext = {
  readonly beforeWarmup: ProcessMemorySnapshot;
  readonly afterMeasurements: ProcessMemorySnapshot;
  readonly rssDeltaBytes: number;
  readonly heapUsedDeltaBytes: number;
  readonly interpretation: string;
};

type FixtureMemoryContext = {
  readonly beforeConstruction: ProcessMemorySnapshot;
  readonly afterConstruction: ProcessMemorySnapshot;
  readonly afterBenchmarkAndDigest: ProcessMemorySnapshot;
  readonly constructionRssDeltaBytes: number;
  readonly constructionHeapUsedDeltaBytes: number;
  readonly totalRssDeltaBytes: number;
  readonly totalHeapUsedDeltaBytes: number;
  readonly interpretation: string;
};

type RecordedTargetAssessment = PerformanceTargetAssessment & {
  readonly authoritative: boolean;
  readonly status: "pass" | "fail" | "not_evaluated_quick_mode";
};

type BenchmarkFixture = {
  readonly id: string;
  readonly scale: BenchmarkFixtureScale;
  readonly rowCount: number;
  readonly csvText: string;
  readonly rawRows: readonly RawOrderLine[];
  readonly metadata: LoadedPhase2Fixture["metadata"];
  readonly validation: ValidationConfiguration;
  readonly dataset: ValidatedDataset;
  readonly identifierStrategy: string;
  readonly distributionStrategy: string;
  readonly source: string;
};

type PackageManifest = {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly packageManager?: unknown;
};

let volatileBlackhole = "";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function analyticsValue<T>(result: AnalyticsResult<T>, operation: string): T {
  if (result.status === "error") {
    throw new Error(
      `${operation} failed: ${result.errors.map((error) => error.message).join(" ")}`,
    );
  }
  return result.value;
}

function requiredInterval(start: string, end: string): DateInterval {
  const result = createDateInterval(start, end);
  if (result.status === "error") {
    throw new Error(result.errors.map((error) => error.message).join(" "));
  }
  return result.value;
}

function metricValueToken(value: MetricValue): string {
  switch (value.kind) {
    case "money":
      return `money:${value.cents}`;
    case "rational_money":
      return `rational-money:${value.numeratorCents}/${value.denominator}`;
    case "count":
      return `count:${value.value}`;
    case "quantity":
      return `quantity:${value.value}`;
    case "rate":
      return `rate:${value.ratio.numerator}/${value.ratio.denominator}:${value.basisPoints}`;
  }
}

function optionalMetricValueToken(value: MetricValue | null): string {
  return value === null ? "null" : metricValueToken(value);
}

function metricResultToken(result: MetricResult): string {
  if (result.status !== "ok") {
    return `${result.metricId ?? "none"}:${result.status}:${result.reason}`;
  }
  const percentageChange = result.percentageChange;
  const percentageToken =
    percentageChange === null
      ? "null"
      : percentageChange.kind === "non_computable_value"
        ? `${percentageChange.status}:${percentageChange.reason}`
        : metricValueToken(percentageChange);
  return [
    result.metricId,
    metricValueToken(result.value),
    optionalMetricValueToken(result.numerator),
    optionalMetricValueToken(result.denominator),
    optionalMetricValueToken(result.previousValue),
    optionalMetricValueToken(result.absoluteChange),
    percentageToken,
    result.evidence.evidenceId,
  ].join(":");
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function serializeRawRows(rows: readonly RawOrderLine[]): string {
  const lines = [ORDER_LINE_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(ORDER_LINE_CSV_COLUMNS.map((column) => csvCell(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function parseFixtureRows(csvText: string, expectedRowCount: number): readonly RawOrderLine[] {
  const parsed = analyticsValue(parseOrderLineCsv(csvText), "Benchmark fixture CSV parsing");
  invariant(
    parsed.length === expectedRowCount,
    `Benchmark fixture expected ${expectedRowCount} rows, received ${parsed.length}.`,
  );
  return parsed;
}

function scaledRawRows(
  baseRows: readonly RawOrderLine[],
  scale: Exclude<BenchmarkFixtureScale, 1>,
): readonly RawOrderLine[] {
  const rows: RawOrderLine[] = [];
  for (let replica = 1; replica <= scale; replica += 1) {
    for (const row of baseRows) {
      rows.push(
        Object.freeze({
          ...row,
          sourceRowNumber: rows.length + 2,
          order_line_id: `${row.order_line_id}-B${replica}`,
          order_id: `${row.order_id}-B${replica}`,
          customer_id: `${row.customer_id}-B${replica}`,
        }),
      );
    }
  }
  return Object.freeze(rows);
}

function scaledValidationConfiguration(
  validation: ValidationConfiguration,
  scale: Exclude<BenchmarkFixtureScale, 1>,
): ValidationConfiguration {
  const replicaAlternatives = Array.from({ length: scale }, (_, index) => String(index + 1))
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .join("|");
  const suffix = `(?:${replicaAlternatives})`;
  return Object.freeze({
    ...validation,
    idPatterns: Object.freeze({
      orderLineId: new RegExp(`^LINE-\\d{7}-B${suffix}$`),
      orderId: new RegExp(`^ORD-\\d{6}-B${suffix}$`),
      customerId: new RegExp(`^CUST-\\d{4}-B${suffix}$`),
      productId: validation.idPatterns.productId,
    }),
  });
}

function validateFixture(
  rawRows: readonly RawOrderLine[],
  metadata: LoadedPhase2Fixture["metadata"],
  validation: ValidationConfiguration,
): ValidatedDataset {
  const normalized = normalizeRawOrderLines(rawRows);
  const canonical = analyticsValue(
    validateOrderLines(normalized, validation),
    "Benchmark fixture row validation",
  );
  const result = validateDataset(canonical, metadata, validation);
  if (result.status !== "valid") {
    throw new Error(
      `Benchmark fixture dataset validation failed: ${result.errors
        .map((error) => error.message)
        .join(" ")}`,
    );
  }
  return result.dataset;
}

function assertIdentifierScaling(
  base: LoadedPhase2Fixture,
  scaled: ValidatedDataset,
  scale: Exclude<BenchmarkFixtureScale, 1>,
): void {
  const expectedRowCount = benchmarkRowCount(scale);
  const orderLineIds = new Set(scaled.rows.map((row) => row.orderLineId));
  const orderIds = new Set(scaled.rows.map((row) => row.orderId));
  const customerIds = new Set(scaled.rows.map((row) => row.customerId));
  invariant(
    orderLineIds.size === expectedRowCount,
    `The x${scale} fixture order-line IDs are not unique.`,
  );
  invariant(
    orderIds.size === base.control.distinctOrderCount * scale,
    `The x${scale} fixture order IDs did not preserve the expected cardinality.`,
  );
  invariant(
    customerIds.size === base.control.distinctCustomerCount * scale,
    `The x${scale} fixture customer IDs did not preserve the expected cardinality.`,
  );
}

function buildFixture(
  loaded: LoadedPhase2Fixture,
  baseRawRows: readonly RawOrderLine[],
  scale: BenchmarkFixtureScale,
): BenchmarkFixture {
  invariant(
    loaded.dataset.rows.length === BENCHMARK_BASE_ROW_COUNT,
    `The approved Phase 2 fixture must contain exactly ${BENCHMARK_BASE_ROW_COUNT} rows.`,
  );
  if (scale === 1) {
    return Object.freeze({
      id: benchmarkFixtureId(scale),
      scale,
      rowCount: BENCHMARK_BASE_ROW_COUNT,
      csvText: loaded.csvText,
      rawRows: baseRawRows,
      metadata: loaded.metadata,
      validation: loaded.validation,
      dataset: loaded.dataset,
      identifierStrategy: "Approved Phase 2 identifiers are unchanged.",
      distributionStrategy:
        "Approved Phase 2 dates, values, categories, missingness, and customer/order distributions are unchanged.",
      source: "Approved Phase 2 deterministic CSV",
    });
  }

  const expectedRowCount = benchmarkRowCount(scale);
  const scaledRows = scaledRawRows(baseRawRows, scale);
  invariant(
    scaledRows.length === expectedRowCount,
    `The x${scale} fixture must contain ${expectedRowCount.toLocaleString("en-US")} rows.`,
  );
  const validation = scaledValidationConfiguration(loaded.validation, scale);
  const metadata = Object.freeze({
    ...loaded.metadata,
    datasetVersion: `${loaded.metadata.datasetVersion}-benchmark-x${scale}`,
    transformationVersion: `${loaded.metadata.transformationVersion}-benchmark-x${scale}`,
  });
  const dataset = validateFixture(scaledRows, metadata, validation);
  assertIdentifierScaling(loaded, dataset, scale);

  return Object.freeze({
    id: benchmarkFixtureId(scale),
    scale,
    rowCount: expectedRowCount,
    csvText: serializeRawRows(scaledRows),
    rawRows: scaledRows,
    metadata,
    validation,
    dataset,
    identifierStrategy: `Each replica suffixes order-line, order, and customer IDs with -B1 through -B${scale}; product IDs intentionally retain shared dimension identity.`,
    distributionStrategy:
      "Dates, monetary values, categorical shares, optional-field missingness, and within-replica customer/order distributions are preserved; row volume increases without adding new business behavior or high-cardinality products and dimensions.",
    source: `Approved Phase 2 deterministic CSV replicated ${scale} times`,
  });
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  invariant(upper !== undefined, "A measured benchmark must contain at least one sample.");
  if (sorted.length % 2 === 1) {
    return upper;
  }
  const lower = sorted[middle - 1];
  invariant(lower !== undefined, "A measured benchmark must contain a lower median sample.");
  return (lower + upper) / 2;
}

function nearestRankPercentile(sorted: readonly number[], percentile: number): number {
  invariant(percentile > 0 && percentile <= 1, "Percentile must be in the interval (0, 1].");
  const index = Math.ceil(percentile * sorted.length) - 1;
  const value = sorted[index];
  invariant(value !== undefined, "A measured benchmark must contain a percentile sample.");
  return value;
}

function blackholeDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function processMemorySnapshot(): ProcessMemorySnapshot {
  const usage = process.memoryUsage();
  return Object.freeze({
    rssBytes: usage.rss,
    heapTotalBytes: usage.heapTotal,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  });
}

function phaseMemoryContext(
  beforeWarmup: ProcessMemorySnapshot,
  afterMeasurements: ProcessMemorySnapshot,
): PhaseMemoryContext {
  return Object.freeze({
    beforeWarmup,
    afterMeasurements,
    rssDeltaBytes: afterMeasurements.rssBytes - beforeWarmup.rssBytes,
    heapUsedDeltaBytes: afterMeasurements.heapUsedBytes - beforeWarmup.heapUsedBytes,
    interpretation:
      "Point-in-time process snapshots around the complete warm-up and measurement loop; deltas are not peak-memory measurements and are affected by garbage collection.",
  });
}

function progress(message: string): void {
  process.stderr.write(`[analytics-benchmark] ${message}\n`);
}

function benchmarkOperation(
  phase: string,
  protocol: BenchmarkProtocol,
  operation: () => string,
  fixtureScale: BenchmarkFixtureScale,
  authoritativeTargets: boolean,
): BenchmarkPhaseResult {
  invariant(protocol.warmupIterations >= 0, "Warm-up iterations must not be negative.");
  invariant(protocol.measuredIterations > 0, "At least one measured iteration is required.");

  const memoryBeforeWarmup = processMemorySnapshot();
  let expectedBlackhole: string | null = null;
  for (let iteration = 0; iteration < protocol.warmupIterations; iteration += 1) {
    const blackhole = operation();
    if (expectedBlackhole === null) {
      expectedBlackhole = blackhole;
    } else {
      invariant(
        blackhole === expectedBlackhole,
        `${phase} produced a non-deterministic warm-up result.`,
      );
    }
    volatileBlackhole = `${phase}:${blackhole}`;
  }

  const samples: number[] = [];
  for (let iteration = 0; iteration < protocol.measuredIterations; iteration += 1) {
    const startedAt = performance.now();
    const blackhole = operation();
    const elapsed = performance.now() - startedAt;
    invariant(blackhole.length > 0, `${phase} produced an empty measured blackhole.`);
    if (expectedBlackhole === null) {
      expectedBlackhole = blackhole;
    } else {
      invariant(
        blackhole === expectedBlackhole,
        `${phase} produced a non-deterministic measured result.`,
      );
    }
    volatileBlackhole = `${phase}:${blackhole}`;
    samples.push(elapsed);
  }

  invariant(expectedBlackhole !== null, `${phase} did not produce a blackhole value.`);
  const sorted = [...samples].sort((left, right) => left - right);
  const medianMs = roundMilliseconds(median(sorted));
  const target = assessX8PerformanceTarget(fixtureScale, phase, medianMs);
  const targetAssessment =
    target === null
      ? null
      : Object.freeze({
          ...target,
          authoritative: authoritativeTargets,
          status: authoritativeTargets
            ? target.passed
              ? ("pass" as const)
              : ("fail" as const)
            : ("not_evaluated_quick_mode" as const),
        });
  const memoryAfterMeasurements = processMemorySnapshot();
  return Object.freeze({
    phase,
    unit: "milliseconds",
    warmupIterations: protocol.warmupIterations,
    measuredIterations: protocol.measuredIterations,
    medianMs,
    p95Ms: roundMilliseconds(nearestRankPercentile(sorted, 0.95)),
    minimumMs: roundMilliseconds(sorted[0] ?? 0),
    maximumMs: roundMilliseconds(sorted.at(-1) ?? 0),
    blackhole: blackholeDigest(expectedBlackhole),
    targetAssessment,
    processMemory: phaseMemoryContext(memoryBeforeWarmup, memoryAfterMeasurements),
  });
}

function parsingOperation(fixture: BenchmarkFixture): () => string {
  return () => {
    const rows = analyticsValue(
      parseOrderLineCsv(fixture.csvText),
      `${fixture.id} timed CSV parsing`,
    );
    const first = rows[0];
    const last = rows.at(-1);
    invariant(first && last, `${fixture.id} parsing produced an empty fixture.`);
    return `${rows.length}:${first.order_line_id}:${last.order_line_id}`;
  };
}

function validationOperation(fixture: BenchmarkFixture): () => string {
  return () => {
    const normalized = normalizeRawOrderLines(fixture.rawRows);
    const canonical = analyticsValue(
      validateOrderLines(normalized, fixture.validation),
      `${fixture.id} timed row validation`,
    );
    const validation = validateDataset(canonical, fixture.metadata, fixture.validation);
    if (validation.status !== "valid") {
      throw new Error(`${fixture.id} timed dataset validation failed.`);
    }
    const first = validation.dataset.rows[0];
    const last = validation.dataset.rows.at(-1);
    invariant(first && last, `${fixture.id} validation produced an empty dataset.`);
    return [
      normalized.length,
      canonical.length,
      validation.dataset.dataQuality.acceptedRowCount,
      first.orderLineId,
      last.orderLineId,
    ].join(":");
  };
}

function metricOperation(engine: AnalyticsEngine, period: DateInterval): () => string {
  return () => {
    const metrics = engine.metrics({ period });
    return CORE_METRIC_IDS.map((metricId) => metricResultToken(metrics[metricId])).join("|");
  };
}

function breakdownOperation(engine: AnalyticsEngine, period: DateInterval): () => string {
  return () =>
    BREAKDOWN_DIMENSIONS.map((dimension) => {
      const result = analyticsValue(
        engine.breakdown({ dimension, filter: { period } }),
        `${dimension} breakdown`,
      );
      invariant(result.status === "ok", `${dimension} breakdown is not computable.`);
      const revenue = result.entries.reduce((total, entry) => total + entry.revenue, 0);
      const cost = result.entries.reduce((total, entry) => total + entry.cost, 0);
      const first = result.entries[0]?.key ?? "none";
      const last = result.entries.at(-1)?.key ?? "none";
      return [
        dimension,
        result.entries.length,
        revenue,
        cost,
        first,
        last,
        result.evidence.evidenceId,
      ].join(":");
    }).join("|");
}

function comparisonQueries(): readonly {
  readonly definition: ComparisonDefinition;
  readonly period: DateInterval;
}[] {
  return Object.freeze([
    Object.freeze({
      definition: Object.freeze({ kind: "previous_equal_length" }) as ComparisonDefinition,
      period: requiredInterval("2025-10-01", "2025-12-31"),
    }),
    Object.freeze({
      definition: Object.freeze({ kind: "previous_calendar_month" }) as ComparisonDefinition,
      period: requiredInterval("2025-12-01", "2025-12-31"),
    }),
    Object.freeze({
      definition: Object.freeze({ kind: "previous_calendar_quarter" }) as ComparisonDefinition,
      period: requiredInterval("2025-10-01", "2025-12-31"),
    }),
    Object.freeze({
      definition: Object.freeze({ kind: "previous_year" }) as ComparisonDefinition,
      period: requiredInterval("2025-01-01", "2025-12-31"),
    }),
  ]);
}

function comparisonOperation(engine: AnalyticsEngine): () => string {
  const queries = comparisonQueries();

  return () =>
    queries
      .map(({ definition, period }) => {
        const result = analyticsValue(
          engine.comparison({
            metricId: "total_revenue",
            filter: { period },
            comparison: definition,
          }),
          `${definition.kind} comparison`,
        );
        invariant(result.status === "ok", `${definition.kind} comparison is not computable.`);
        invariant(
          result.previousValue !== null,
          `${definition.kind} comparison lacks prior value.`,
        );
        invariant(
          result.absoluteChange !== null,
          `${definition.kind} comparison lacks absolute change.`,
        );
        invariant(
          result.percentageChange !== null,
          `${definition.kind} comparison lacks percentage change.`,
        );
        const percentage =
          result.percentageChange.kind === "non_computable_value"
            ? `${result.percentageChange.status}:${result.percentageChange.reason}`
            : metricValueToken(result.percentageChange);
        return [
          definition.kind,
          metricValueToken(result.value),
          metricValueToken(result.previousValue),
          metricValueToken(result.absoluteChange),
          percentage,
          result.comparisonPeriod?.start ?? "none",
          result.comparisonPeriod?.end ?? "none",
          result.evidence.evidenceId,
        ].join(":");
      })
      .join("|");
}

function anomalyOperation(engine: AnalyticsEngine, period: DateInterval): () => string {
  return () =>
    (["daily", "weekly"] as const)
      .map((frequency) => {
        const result = analyticsValue(
          engine.anomalies({ filter: { period }, configuration: { frequency } }),
          `${frequency} anomaly analysis`,
        );
        invariant(result.status === "ok", `${frequency} anomaly analysis is not computable.`);
        const findings = result.findings
          .map(
            (finding) =>
              `${finding.direction}:${finding.bucket.period.start}:${finding.bucket.period.end}:${finding.findingId}`,
          )
          .join(",");
        return [
          frequency,
          result.bucketCount,
          result.evaluatedBucketCount,
          result.findings.length,
          findings,
          result.evidence.evidenceId,
        ].join(":");
      })
      .join("|");
}

function freshEngineBatch(
  fixture: BenchmarkFixture,
  operation: (engine: AnalyticsEngine) => string,
): () => string {
  return () => operation(createAnalyticsEngine(fixture.dataset));
}

function metricBatchOperation(fixture: BenchmarkFixture, period: DateInterval): () => string {
  return freshEngineBatch(fixture, (engine) => metricOperation(engine, period)());
}

function breakdownBatchOperation(fixture: BenchmarkFixture, period: DateInterval): () => string {
  return freshEngineBatch(fixture, (engine) => breakdownOperation(engine, period)());
}

function comparisonBatchOperation(fixture: BenchmarkFixture): () => string {
  return freshEngineBatch(fixture, (engine) => comparisonOperation(engine)());
}

function anomalyBatchOperation(fixture: BenchmarkFixture, period: DateInterval): () => string {
  return freshEngineBatch(fixture, (engine) => anomalyOperation(engine, period)());
}

function comprehensivePublicOutputDigest(
  fixture: BenchmarkFixture,
  period: DateInterval,
): Readonly<Record<string, unknown>> {
  const engine = createAnalyticsEngine(fixture.dataset);
  const metrics = engine.metrics({ period });
  const breakdowns = Object.fromEntries(
    BREAKDOWN_DIMENSIONS.map((dimension) => [
      dimension,
      engine.breakdown({ dimension, filter: { period } }),
    ]),
  );
  const comparisons = Object.fromEntries(
    comparisonQueries().map(({ definition, period: currentPeriod }) => [
      definition.kind,
      engine.comparison({
        metricId: "total_revenue",
        filter: { period: currentPeriod },
        comparison: definition,
      }),
    ]),
  );
  const anomalies = Object.fromEntries(
    (["daily", "weekly"] as const).map((frequency) => [
      frequency,
      engine.anomalies({ filter: { period }, configuration: { frequency } }),
    ]),
  );
  const serialized = JSON.stringify({ metrics, breakdowns, comparisons, anomalies });
  invariant(serialized.length > 0, "The comprehensive public-output serialization is empty.");

  return Object.freeze({
    algorithm: "SHA-256",
    digest: blackholeDigest(serialized),
    serialization: "JSON.stringify over complete public result envelopes in declared query order",
    timed: false,
    includesEvidenceReferences: true,
    serializedUtf16CodeUnits: serialized.length,
    coverage: Object.freeze({
      coreKpis: CORE_METRIC_IDS.length,
      breakdownDimensions: BREAKDOWN_DIMENSIONS,
      comparisonModes: Object.freeze(comparisonQueries().map(({ definition }) => definition.kind)),
      anomalyFrequencies: Object.freeze(["daily", "weekly"]),
    }),
  });
}

function fixtureMemoryContext(
  beforeConstruction: ProcessMemorySnapshot,
  afterConstruction: ProcessMemorySnapshot,
  afterBenchmarkAndDigest: ProcessMemorySnapshot,
): FixtureMemoryContext {
  return Object.freeze({
    beforeConstruction,
    afterConstruction,
    afterBenchmarkAndDigest,
    constructionRssDeltaBytes: afterConstruction.rssBytes - beforeConstruction.rssBytes,
    constructionHeapUsedDeltaBytes:
      afterConstruction.heapUsedBytes - beforeConstruction.heapUsedBytes,
    totalRssDeltaBytes: afterBenchmarkAndDigest.rssBytes - beforeConstruction.rssBytes,
    totalHeapUsedDeltaBytes:
      afterBenchmarkAndDigest.heapUsedBytes - beforeConstruction.heapUsedBytes,
    interpretation:
      "Point-in-time process snapshots include the retained fixture and runtime allocations; deltas are not peak-memory measurements and garbage collection is not forced.",
  });
}

function benchmarkFixture(
  fixture: BenchmarkFixture,
  protocol: BenchmarkProtocol,
  quick: boolean,
  beforeConstruction: ProcessMemorySnapshot,
  afterConstruction: ProcessMemorySnapshot,
): Readonly<Record<string, unknown>> {
  const period = fixture.dataset.metadata.dateRange;
  const runPhase = (phase: string, operation: () => string) => {
    progress(
      `${fixture.id}: ${phase} (${protocol.warmupIterations} warm-up, ${protocol.measuredIterations} measured)`,
    );
    return benchmarkOperation(phase, protocol, operation, fixture.scale, !quick);
  };
  const phases = [
    runPhase("csv_parsing", parsingOperation(fixture)),
    runPhase("normalization_row_and_dataset_validation", validationOperation(fixture)),
    runPhase("all_core_kpis", metricBatchOperation(fixture, period)),
    runPhase("all_six_breakdowns", breakdownBatchOperation(fixture, period)),
    runPhase("all_four_comparison_modes", comparisonBatchOperation(fixture)),
    runPhase("daily_and_weekly_anomalies", anomalyBatchOperation(fixture, period)),
  ];
  progress(`${fixture.id}: constructing untimed comprehensive public-output digest`);
  const publicOutputDigest = comprehensivePublicOutputDigest(fixture, period);
  const targetAssessments = phases.flatMap((phase) =>
    phase.targetAssessment === null ? [] : [phase.targetAssessment],
  );
  const targetSummary =
    fixture.scale !== 8
      ? null
      : Object.freeze({
          authoritative: !quick,
          status: quick
            ? ("not_evaluated_quick_mode" as const)
            : targetAssessments.every((assessment) => assessment.passed)
              ? ("pass" as const)
              : ("fail" as const),
          assessedPhaseCount: targetAssessments.length,
          passedPhaseCount: targetAssessments.filter((assessment) => assessment.passed).length,
          requiredPhaseCount: Object.keys(X8_ANALYTICS_TARGETS_MS).length,
        });
  const afterBenchmarkAndDigest = processMemorySnapshot();
  return Object.freeze({
    id: fixture.id,
    source: fixture.source,
    scale: fixture.scale,
    rowCount: fixture.rowCount,
    identifierStrategy: fixture.identifierStrategy,
    distributionStrategy: fixture.distributionStrategy,
    cacheMethodology: Object.freeze({
      engineLifecycle:
        "Every warm-up and measured analytics phase iteration creates a fresh engine inside the timed batch.",
      withinBatchSharing:
        "Calls belonging to one KPI, breakdown, comparison, or anomaly batch share that iteration's engine and its bounded immutable analysis contexts.",
      crossIterationReuse: false,
      finalResultCacheHitsTimed: false,
      parsingAndValidation:
        "Parsing and validation remain independent operations and do not construct an analytics engine.",
    }),
    phases: Object.freeze(phases),
    performanceTargetSummary: targetSummary,
    comprehensivePublicOutput: publicOutputDigest,
    processMemory: fixtureMemoryContext(
      beforeConstruction,
      afterConstruction,
      afterBenchmarkAndDigest,
    ),
  });
}

function commandOutput(repositoryRoot: string, args: readonly string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function stringProperty(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function runtimePnpmVersion(): string | null {
  const userAgent = process.env.npm_config_user_agent;
  if (!userAgent) {
    return null;
  }
  return /(?:^|\s)pnpm\/([^\s]+)/.exec(userAgent)?.[1] ?? null;
}

async function main(): Promise<void> {
  const options = parseBenchmarkArguments(process.argv.slice(2));
  const quick = options.quick;
  const protocol: BenchmarkProtocol = quick
    ? Object.freeze({ warmupIterations: 0, measuredIterations: 1 })
    : Object.freeze({ warmupIterations: 2, measuredIterations: 7 });

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = path.resolve(scriptDirectory, "..");
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  ) as PackageManifest;
  const loaded = await loadPhase2Fixture(repositoryRoot);
  const baseRawRows = parseFixtureRows(loaded.csvText, BENCHMARK_BASE_ROW_COUNT);

  const benchmarkResults: Readonly<Record<string, unknown>>[] = [];
  const memoryBeforeSelectedFixtures = processMemorySnapshot();
  for (const scale of options.fixtureScales) {
    const memoryBeforeConstruction = processMemorySnapshot();
    const fixture = buildFixture(loaded, baseRawRows, scale);
    const memoryAfterConstruction = processMemorySnapshot();
    progress(`${fixture.id}: starting ${fixture.rowCount.toLocaleString("en-US")} rows`);
    benchmarkResults.push(
      benchmarkFixture(fixture, protocol, quick, memoryBeforeConstruction, memoryAfterConstruction),
    );
    progress(`${fixture.id}: complete`);
  }
  const memoryAfterSelectedFixtures = processMemorySnapshot();

  const cpus = os.cpus();
  const declaredPackageManager = stringProperty(packageJson.packageManager);
  const report = Object.freeze({
    benchmarkVersion: "phase3-analytics-benchmark-v2",
    generatedAt: new Date().toISOString(),
    mode: quick ? "quick" : "full",
    selectedFixtureScales: options.fixtureScales,
    scope: Object.freeze({
      coreKpiCount: CORE_METRIC_IDS.length,
      breakdownDimensions: BREAKDOWN_DIMENSIONS,
      comparisonModes: Object.freeze(comparisonQueries().map(({ definition }) => definition.kind)),
      anomalyFrequencies: Object.freeze(["daily", "weekly"]),
      fixtureRowCounts: Object.freeze(
        Object.fromEntries(
          options.fixtureScales.map((scale) => [
            benchmarkFixtureId(scale),
            benchmarkRowCount(scale),
          ]),
        ),
      ),
    }),
    protocol: Object.freeze({
      warmupIterations: protocol.warmupIterations,
      measuredIterations: protocol.measuredIterations,
      execution: "serial",
      processModel: "single_process",
      cacheState:
        "fresh engine per warm-up and measured analytics batch; bounded immutable contexts may be shared only by calls within that batch",
      clock: "node:perf_hooks performance.now()",
      median: "middle sample, or arithmetic mean of the two middle samples for an even count",
      p95: "nearest-rank (ceil(0.95 * sample count))",
      iterationRationale: quick
        ? "Smoke mode executes each phase once without warm-up."
        : "Two warm-ups and seven serial measurements bound an otherwise lengthy full-suite run while retaining multiple measured samples.",
      timedWork:
        "Each phase includes the named public analytics calls plus deterministic result-token construction. Analytics phases also include fresh engine construction for that batch.",
      excludedWork: Object.freeze([
        "filesystem I/O",
        "Phase 2 fixture loading",
        "x8 and x16 fixture construction and CSV serialization",
        "untimed comprehensive public-output and evidence digest construction",
        "environment and source-control metadata collection",
        "post-timing deterministic blackhole assertions",
      ]),
      resultConsumption: Object.freeze({
        timed:
          "The original compact result-token blackholes are retained exactly for before/after comparability.",
        untimed:
          "A SHA-256 digest covers complete public result envelopes and evidence references for every measured analytics query.",
      }),
    }),
    performanceTargets: Object.freeze({
      appliesToFixture: benchmarkFixtureId(8),
      appliesToMode: "full",
      comparison: "measured median must be strictly less than the target",
      maximumMedianMilliseconds: X8_ANALYTICS_TARGETS_MS,
      preOptimizationMedianMilliseconds: PRE_OPTIMIZATION_X8_MEDIANS_MS,
      baselineGeneratedAt: "2026-08-03T23:01:28.611Z",
      baselineDescription:
        "Original Phase 3 x8 benchmark on this workstation before the performance revision.",
    }),
    environment: Object.freeze({
      node: process.version,
      v8: process.versions.v8,
      os: Object.freeze({
        type: os.type(),
        platform: os.platform(),
        release: os.release(),
      }),
      arch: Object.freeze({ process: process.arch, os: os.arch() }),
      cpu: Object.freeze({
        model: cpus[0]?.model ?? "unavailable",
        logicalCores: cpus.length,
      }),
      ram: Object.freeze({ totalBytes: os.totalmem() }),
      pnpm: Object.freeze({
        declared: declaredPackageManager,
        declaredVersion: declaredPackageManager?.startsWith("pnpm@")
          ? declaredPackageManager.slice("pnpm@".length)
          : null,
        runtimeVersion: runtimePnpmVersion(),
      }),
    }),
    package: Object.freeze({
      name: stringProperty(packageJson.name),
      version: stringProperty(packageJson.version),
    }),
    sourceControl: Object.freeze({
      branch: commandOutput(repositoryRoot, ["branch", "--show-current"]),
      commit: commandOutput(repositoryRoot, ["rev-parse", "HEAD"]),
      baseCommit: commandOutput(repositoryRoot, ["merge-base", "HEAD", "master"]),
    }),
    datasets: Object.freeze(benchmarkResults),
    processMemory: Object.freeze({
      beforeSelectedFixtures: memoryBeforeSelectedFixtures,
      afterSelectedFixtures: memoryAfterSelectedFixtures,
      rssDeltaBytes: memoryAfterSelectedFixtures.rssBytes - memoryBeforeSelectedFixtures.rssBytes,
      heapUsedDeltaBytes:
        memoryAfterSelectedFixtures.heapUsedBytes - memoryBeforeSelectedFixtures.heapUsedBytes,
      interpretation:
        "Point-in-time process snapshots are context for this serial run, not peak-memory or leak measurements; garbage collection is not forced.",
    }),
    limitations: Object.freeze([
      "Results describe this workstation, Node runtime, process, and run only; they are not universal production-performance claims.",
      "The suite is a serial, single-process microbenchmark and does not include file I/O, concurrency, network work, or UI rendering.",
      "JIT compilation, garbage collection, operating-system scheduling, thermal state, and other local load can affect timings.",
      "The x8 and x16 fixtures preserve Phase 2 dates and distributions while changing unique transaction and customer IDs; they increase row volume, not behavioral or dimension-cardinality complexity.",
      "The bounded full protocol uses seven measured samples; nearest-rank p95 therefore selects the maximum sample and should be treated as a local tail indicator, not a stable population estimate.",
      "The four x8 median targets are project acceptance targets for this recorded environment, not external or universal production benchmarks.",
      "Memory values are point-in-time process snapshots and deltas rather than forced-GC retained-size or peak-resident-set measurements.",
    ]),
    blackholeGuard: blackholeDigest(volatileBlackhole),
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
