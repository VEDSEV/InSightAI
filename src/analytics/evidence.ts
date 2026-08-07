import { DEFAULT_ANALYTICS_CONFIGURATION } from "./configuration.ts";
import { codePointCompare } from "./filters.ts";
import type {
  AnalyticsConfiguration,
  CanonicalOrderLine,
  DateInterval,
  EvidenceMeasureSummary,
  EvidenceReference,
  FilterContext,
  MetricId,
} from "./types.ts";

export type EvidenceInput = {
  readonly datasetVersion: string;
  readonly engineVersion: string;
  readonly operationId: string;
  readonly ruleVersion?: string | null;
  readonly rows: readonly CanonicalOrderLine[];
  readonly filterContext?: FilterContext;
  readonly affectedDateBuckets?: readonly DateInterval[];
  readonly segmentKeys?: readonly string[];
  readonly numerator?: EvidenceMeasureSummary | null;
  readonly denominator?: EvidenceMeasureSummary | null;
  readonly metricDependencies?: readonly MetricId[];
  readonly sampleLimit?: number;
  /** Internal prepared support. It is used only when it was built from the exact row-array object. */
  readonly rowSupport?: EvidenceRowSupport;
};

export type EvidenceRowSupport = {
  readonly sourceRows: readonly CanonicalOrderLine[];
  readonly allOrderLineIds: readonly string[];
  readonly allOrderIds: readonly string[];
};

type EvidenceConfiguration = Pick<AnalyticsConfiguration, "evidenceSampleLimit">;

function stableSerialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Evidence fingerprints require finite numbers.");
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "undefined") {
    return "undefined";
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError("Evidence fingerprints do not support cyclic values.");
    }
    seen.add(value);
    const serialized = `[${value.map((entry) => stableSerialize(entry, seen)).join(",")}]`;
    seen.delete(value);
    return serialized;
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new TypeError("Evidence fingerprints do not support cyclic values.");
    }
    seen.add(value);
    const record = value as Readonly<Record<string, unknown>>;
    const serialized = Object.keys(record)
      .sort(codePointCompare)
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key], seen)}`)
      .join(",");
    seen.delete(value);
    return `{${serialized}}`;
  }
  throw new TypeError(`Unsupported evidence fingerprint value: ${typeof value}.`);
}

function fnv1a64(value: string): string {
  // 64-bit FNV offset basis 0xcbf29ce484222325, stored as unsigned 32-bit words.
  let high = 0xcbf29ce4;
  let low = 0x84222325;
  const primeHigh = 0x00000100;
  const primeLow = 0x000001b3;
  const twoTo32 = 0x1_0000_0000;

  for (let index = 0; index < value.length; index += 1) {
    // The legacy implementation XORed the UTF-16 code unit into the low word.
    low = (low ^ value.charCodeAt(index)) >>> 0;

    // (high:low) * (primeHigh:primeLow) modulo 2^64. low * 435 is below 2^41,
    // so the product and carry remain exact JavaScript integers.
    const lowProduct = low * primeLow;
    const carry = Math.floor(lowProduct / twoTo32);
    const nextLow = lowProduct >>> 0;
    const nextHigh = (Math.imul(high, primeLow) + Math.imul(low, primeHigh) + carry) >>> 0;
    high = nextHigh;
    low = nextLow;
  }
  return `${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
}

export function stableFingerprint(value: unknown): string {
  return fnv1a64(stableSerialize(value, new WeakSet<object>()));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(codePointCompare));
}

/**
 * Prepares the complete, deterministically sorted evidence identity once for a frozen row set.
 * Samples remain bounded later, while the fingerprint continues to identify the complete set.
 */
export function prepareEvidenceRowSupport(rows: readonly CanonicalOrderLine[]): EvidenceRowSupport {
  return Object.freeze({
    sourceRows: rows,
    allOrderLineIds: uniqueSorted(rows.map((row) => row.orderLineId)),
    allOrderIds: uniqueSorted(rows.map((row) => row.orderId)),
  });
}

function sortedDateBuckets(values: readonly DateInterval[]): readonly DateInterval[] {
  const byKey = new Map<string, DateInterval>();
  for (const interval of values) {
    const key = `${interval.start}/${interval.end}`;
    byKey.set(key, Object.freeze({ ...interval }));
  }
  return Object.freeze(
    [...byKey.entries()]
      .sort(([left], [right]) => codePointCompare(left, right))
      .map(([, value]) => value),
  );
}

function measureSummary(
  value: EvidenceMeasureSummary | null | undefined,
): EvidenceMeasureSummary | null {
  return value === undefined || value === null ? null : Object.freeze({ ...value });
}

export function buildEvidenceReference(
  input: EvidenceInput,
  configuration: EvidenceConfiguration = DEFAULT_ANALYTICS_CONFIGURATION,
): EvidenceReference {
  const sampleLimit = input.sampleLimit ?? configuration.evidenceSampleLimit;
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 0) {
    throw new RangeError("Evidence sample limit must be a non-negative safe integer.");
  }

  const rowSupport =
    input.rowSupport?.sourceRows === input.rows
      ? input.rowSupport
      : prepareEvidenceRowSupport(input.rows);
  const { allOrderLineIds, allOrderIds } = rowSupport;
  const sampleOrderLineIds = Object.freeze(allOrderLineIds.slice(0, sampleLimit));
  const sampleOrderIds = Object.freeze(allOrderIds.slice(0, sampleLimit));
  const affectedDateBuckets = sortedDateBuckets(input.affectedDateBuckets ?? []);
  const segmentKeys = uniqueSorted(input.segmentKeys ?? []);
  const metricDependencies = Object.freeze(
    [...new Set(input.metricDependencies ?? [])].sort(codePointCompare),
  );
  const numerator = measureSummary(input.numerator);
  const denominator = measureSummary(input.denominator);
  const ruleVersion = input.ruleVersion ?? null;
  const fingerprint = stableFingerprint({
    datasetVersion: input.datasetVersion,
    engineVersion: input.engineVersion,
    operationId: input.operationId,
    ruleVersion,
    filterContext: input.filterContext ?? null,
    orderLineIds: allOrderLineIds,
    affectedDateBuckets,
    segmentKeys,
    numerator,
    denominator,
    metricDependencies,
  });

  return Object.freeze({
    evidenceId: `evidence:${input.operationId}:${fingerprint}`,
    datasetVersion: input.datasetVersion,
    engineVersion: input.engineVersion,
    ruleVersion,
    matchingRowCount: input.rows.length,
    distinctOrderCount: allOrderIds.length,
    affectedDateBuckets,
    segmentKeys,
    numerator,
    denominator,
    metricDependencies,
    sampleOrderLineIds,
    sampleOrderIds,
    sampleLimit,
    truncated: allOrderLineIds.length > sampleLimit || allOrderIds.length > sampleLimit,
  });
}
