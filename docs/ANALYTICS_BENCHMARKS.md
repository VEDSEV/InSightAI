# Phase 3 analytics performance revision

**Status:** performance targets met; awaiting Phase 3 review
**Recorded:** 2026-08-07 02:44:31.590 UTC
**Branch:** `feat/phase-3-analytics-engine`
**Base commit:** `9ac9b36fd335daa1a2cf896fb3e54a5af6c9e53c`

This report records the measured bottlenecks, the bounded analysis-context design, and the full
before/after benchmark for the deterministic analytics engine. The optimization preserves public
result contracts, formulas, integer-cent arithmetic, deterministic ordering, anomaly behavior, and
evidence semantics.

The machine-readable optimized result is
[`benchmarks/phase3-analytics.json`](../benchmarks/phase3-analytics.json). The original timings and
protocol are preserved as the labeled baseline artifact in
[`benchmarks/phase3-analytics-before-optimization.json`](../benchmarks/phase3-analytics-before-optimization.json),
and the focused profiling measurements are in
[`benchmarks/phase3-analytics-profile.json`](../benchmarks/phase3-analytics-profile.json).

## Profiling results

Focused profiling on the 55,272-row x8 fixture measured these representative primitives:

| Operation                                                             |               Median |
| --------------------------------------------------------------------- | -------------------: |
| Normalize a filter context                                            |              25.0 ms |
| Apply one filter context                                              |              12.6 ms |
| Aggregate one selected row set                                        |              20.7 ms |
| Group all rows by six dimensions using the original independent calls | approximately 170 ms |
| Build one full-row evidence reference                                 |             1,136 ms |
| Original all-KPI public call                                          |            22,660 ms |

The original stable evidence fingerprint used a BigInt FNV-1a operation for every UTF-16 code unit.
Hashing a representative 994,897-code-unit evidence input took 93–118 ms. An exact two-word
unsigned-32-bit implementation produced the same `6740d511205ed475` fingerprint in 14.7 ms.

Repeated public operations amplified the expensive work:

| Batch                      | Evidence references | Source-row occurrences traversed for evidence |
| -------------------------- | ------------------: | --------------------------------------------: |
| 19 KPIs                    |                  19 |                                     1,050,168 |
| Six breakdowns             |                  48 |                                       663,264 |
| Four comparisons           |                 156 |                                     1,854,400 |
| Daily and weekly anomalies |                  22 |                                       217,744 |

One comparison previously performed six filter-context scans, four filtering scans, two complete
metric sets, two full-dataset repeat-status scans, and 39 evidence builds. The primary root cause was
therefore duplicated evidence hashing and sorting, followed by repeated filtering, repeat
classification, grouping, aggregation, and date indexing. Formula arithmetic itself was not the
bottleneck.

## Optimization design

Each `createAnalyticsEngine` instance now owns one internal analysis runtime:

- dataset vocabulary and full-history customer order counts are indexed once;
- an exact canonical key includes the date interval, boundary convention, timezone, every normalized
  dimension selection, and customer-type scope and values;
- at most eight immutable analysis contexts are retained in an exact LRU;
- a context contains its selected rows, shared base aggregate, and prepared bounded-evidence support;
- all six breakdown dimensions are grouped in one traversal on first breakdown use;
- daily rows, revenue, order sets, and evidence support are indexed once on first anomaly use;
- current and prior comparison periods reuse the same runtime while remaining separate exact
  contexts;
- contexts are bound to their owning runtime and cannot be used with another dataset/runtime;
- eviction removes the runtime's reference to derived state, and destroying the engine makes the
  whole cache eligible for collection.

There is no unbounded or process-global result cache. A fresh engine has a fresh runtime, so results
cannot become stale across datasets or engine configurations. Public standalone functions keep their
existing signatures and use an ephemeral runtime. Public result envelopes are still newly calculated;
the benchmark does not time final-result cache hits.

The evidence fingerprint input, bounded samples, counts, interval and segment support, dependencies,
and deterministic ordering did not change. Only the internal preparation and exact hash
implementation changed.

## Measurement protocol

Each fixture and operation group ran serially in one Node.js process. Two untimed warm-up iterations
preceded seven measured iterations. Every analytics iteration constructed a fresh engine inside the
timed batch; calls within that KPI, breakdown, comparison, or anomaly batch could share only that
engine's bounded contexts. No state crossed iterations.

Timing used `node:perf_hooks` `performance.now()`. Median is the middle of seven sorted samples.
Nearest-rank p95 is the seventh and largest sample, so it is only a local tail indicator. Timed work
includes the named public calls and the original deterministic result-token consumption. Filesystem
I/O, fixture construction, environment collection, and comprehensive output hashing were excluded.

The base fixture is the approved 6,909-row Phase 2 CSV. The x8 and x16 fixtures contain 55,272 and
110,544 rows. Replicas retain product IDs, dates, values, dimensions, optional missingness, and
within-replica distributions while suffixing order-line, order, and customer IDs to keep them unique.

## Before and after at 55,272 rows

All timings are milliseconds. Targets apply to the optimized full-run median and are strict
less-than comparisons.

| Analytics batch            | Before median | After median |  After p95 |  Speedup | Reduction |  Target | Result |
| -------------------------- | ------------: | -----------: | ---------: | -------: | --------: | ------: | ------ |
| 19 core KPIs               |   16,770.8671 |     667.4686 |   746.4122 | 25.1261x |  96.0201% | < 1,500 | Pass   |
| Six breakdowns             |   11,509.9070 |   1,445.7036 | 1,509.9448 |  7.9615x |  87.4395% | < 2,000 | Pass   |
| Four comparisons           |   30,548.7244 |     556.8967 |   583.5748 | 54.8553x |  98.1770% | < 4,000 | Pass   |
| Daily and weekly anomalies |    4,400.9679 |     852.2076 |   889.8207 |  5.1642x |  80.6359% | < 1,500 | Pass   |

The before figures are the approved blocking medians recorded by the original benchmark on the same
workstation. All four internal acceptance targets passed.

## Full optimized timing table

All values are milliseconds.

| Measured operation                                    | 6,909 median | 6,909 p95 | 55,272 median | 55,272 p95 | 110,544 median | 110,544 p95 |
| ----------------------------------------------------- | -----------: | --------: | ------------: | ---------: | -------------: | ----------: |
| CSV parsing                                           |      31.2741 |   68.5720 |      341.5596 |   385.5404 |       703.0017 |    844.4109 |
| Normalization, row validation, and dataset validation |      91.7239 |  106.3265 |      911.6034 |   949.0437 |     1,771.1592 |  1,862.1557 |
| All 19 core KPIs                                      |      71.5314 |   80.4271 |      667.4686 |   746.4122 |     1,469.7803 |  1,503.3772 |
| All six breakdowns                                    |     112.2034 |  121.2901 |    1,445.7036 | 1,509.9448 |     3,457.2290 |  3,557.7919 |
| All four comparison modes                             |      58.8465 |   64.6163 |      556.8967 |   583.5748 |     1,251.7454 |  1,277.3440 |
| Daily and weekly anomalies                            |     345.7607 |  399.6092 |      852.2076 |   889.8207 |     1,596.6225 |  1,694.8023 |

The 110,544-row results are descriptive; the Phase 3 acceptance targets were defined only for the
same approximately 55,000-row environment as the blocking benchmark.

## Correctness and evidence equivalence

The benchmark records a SHA-256 digest over complete public result envelopes, including evidence
references, for 19 KPIs, all six breakdowns, all four comparison modes, and both anomaly frequencies:

| Fixture      | Complete-output digest                                                    |
| ------------ | ------------------------------------------------------------------------- |
| 6,909 rows   | `sha256:31621aff9531314da609ebf9662131ed1db104b74d70f185696e247afd0274ba` |
| 55,272 rows  | `sha256:6d537d8db87c87e7367142b30398a5668a20ec18bea5decae49e14666c5f57cc` |
| 110,544 rows | `sha256:3c4acd73e551af4dda38ec10f7927152e5a22495854822b0f33a176ddd9425bd` |

The original timed result-token hashes are unchanged for both the 6,909-row and 55,272-row fixtures.
Golden and invariant tests also compare prepared evidence with direct row evidence, compare the
runtime engine path with standalone public APIs, lock representative legacy evidence IDs including
Unicode cases, and exercise cache reuse, LRU eviction, immutability, and cross-runtime rejection.

## Runtime context

| Context                  | Recorded value                                                  |
| ------------------------ | --------------------------------------------------------------- |
| Node.js                  | `v24.14.0`                                                      |
| V8                       | `13.6.233.17-node.41`                                           |
| Operating system         | `Windows_NT 10.0.26200`, x64                                    |
| Processor                | AMD Ryzen 7 7840HS                                              |
| Logical cores            | 16                                                              |
| Total RAM                | 16,312,553,472 bytes                                            |
| Declared package manager | pnpm `11.9.0`                                                   |
| Execution                | serial, warm process, fresh engine per measured analytics batch |

The process-wide RSS snapshot rose by 942,731,264 bytes and the heap-used snapshot by 355,842,680
bytes across all three serial fixtures and their comprehensive digests. Garbage collection was not
forced, so these point-in-time deltas are neither retained-cache size nor peak-memory measurements.

## Remaining bottlenecks and limitations

- Breakdowns remain the slowest optimized analytical batch because six partitions retain per-segment
  order/customer sets and complete bounded-evidence support.
- At 110,544 rows, breakdown median is 3.46 seconds and anomaly median is 1.60 seconds. Further work
  should profile allocation pressure and date-series evidence before changing algorithms.
- Parsing and validation remain deliberate independent passes. They are not hidden inside or cached
  by the engine.
- The x8/x16 fixtures increase row volume but not true product or dimension cardinality. A future
  high-cardinality fixture is needed before making grouping-capacity claims.
- This is a serial local microbenchmark, not an end-to-end dashboard, concurrency, network, database,
  cold-start, peak-memory, or production-service benchmark.
- JIT compilation, garbage collection, scheduling, thermal state, power policy, and unrelated load
  can affect local timings.
- Seven measured samples are sufficient for the requested bounded revision but not for a stable
  population-tail estimate or a universal performance claim.
