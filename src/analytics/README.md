# Analytics module

This directory owns InsightAI's authoritative business calculations as small, framework-independent
TypeScript modules. It must not depend on React, Next.js request objects, dashboard state, chart
props, databases, AI services, or the Phase 2 generator.

Phase 4 consumes the public entry point through a dedicated dashboard adapter. Presentation code may
format supported result envelopes but must neither import analytics internals nor reimplement a
business formula. `performanceTrend` is the public source for the dashboard's revenue/gross-profit
time series.

## Supported public API

Future application, adapter, and UI code imports supported analytics functions and public types from
`src/analytics/index.ts`. Files below this directory are implementation details unless re-exported by
that entry point. This keeps parsing, formulas, configuration, and evidence structures independently
testable while preserving one versioned contract for consumers.

Public operations return discriminated result envelopes, not bare numbers. A computable result
includes its metric or method ID, label, unit, value, precision, period, filters, assumptions,
data-quality state, engine version, evidence reference, and applicable numerator, denominator,
previous value, and changes. Empty source data, invalid filters, invalid source data, zero
denominators, unavailable dimensions, and insufficient history use explicit non-computable variants.

## Validation boundary

The canonical path has five stages:

1. CSV parsing preserves raw field strings and reports structural parse errors.
2. Normalization trims documented fields, maps blank optional dimensions to null, and parses civil
   dates and decimal strings without applying business formulas.
3. Row validation checks required and optional fields, identifiers, categorical values, positive
   integer quantity, money constraints, and the exact revenue/cost reconciliation rules.
4. Dataset validation checks unique `order_line_id` values, declared and observed date coverage,
   currency and timezone metadata, and cross-row/order assumptions.
5. Analytics accepts validated canonical datasets only; rejected records never silently enter a
   calculation.

The Phase 2 fixture supplies USD, `America/Chicago`, and inclusive 2024-01-01 through 2025-12-31
metadata explicitly. The general engine does not infer currency/timezone or hard-code Phase 2 ID
patterns, product IDs, categories, regions, channels, scenario dates, or expected outcomes.

## Decimal and rounding strategy

Canonical monetary strings are parsed into branded checked safe-integer cents. Fractional-cent inputs
are not silently accepted at the canonical boundary. Monetary sums and absolute changes remain cents,
with safe accumulation checks. Rates use safe-integer rational components—for example, gross margin
retains gross profit cents over revenue cents, while marketing ROI retains contribution cents over
spend cents. Comparisons and sorting use these unrounded components.

Currency, ratio, and percentage rounding occurs only during explicit serialization or presentation.
Percentage serialization derives integer basis points using half-away-from-zero rounding; rounded
output never feeds a later calculation. A derived interpolated value may be rational even though each
source monetary amount was whole cents.

## Filters, missing values, and repeat scope

One normalized immutable `FilterContext` controls date range, product, category, region, channel,
customer segment, campaign, and derived customer type. Dimensions are ANDed with one another and
selected values within a dimension are ORed. An omitted or empty selection means no restriction.
Canonical nulls for optional dimensions remain null; filter and breakdown APIs expose the stable
`__missing__` key so those rows can be selected without inventing a business label.

Repeat metrics state their classification scope:

- **Within selection:** a customer has at least two distinct visible orders after the current period
  and all filters are applied.
- **Across the full loaded dataset:** repeat status is calculated from all validated rows, then
  applied to customers represented by the current filtered cohort.

The corresponding one-time count is defined within the same scope. Customer-segment propensity labels
do not determine observed repeat status, and a missing segment does not remove the customer.

## Comparison semantics

Public date intervals use inclusive calendar dates in the declared dataset timezone. A previous
equal-length comparison containing `N` days ends on the day before the current start and contains the
same `N` calendar days. Previous-calendar-month and previous-calendar-quarter comparisons require a
complete aligned current month or quarter; a partial or unaligned selection returns `invalid_filter`
instead of being expanded or annualized. Previous-year comparison shifts boundaries by one calendar
year and clamps February 29 to February 28 when the prior year is not a leap year. No calendar mode
silently substitutes an equal-length window.

Both periods use the same non-date filters. Missing prior coverage is insufficient history, not zero.
Absolute and percentage changes are separate. Rate metrics use percentage-point change as their
primary absolute comparison; a zero prior denominator follows the explicit result-status rules.

## Breakdowns, diagnostics, and evidence

Breakdowns use exhaustive normalized segment keys and deterministic unrounded sorting. Missing
optional dimensions are retained. Revenue and cost totals reconcile with the equivalent overall
metrics; shares retain rational numerators and denominators and are non-computable at a zero total.

Concentration returns top-one, top-three, and—when enough segments exist—top-five revenue shares plus
the Herfindahl-Hirschman Index. Any descriptive bands are versioned project defaults, not universal
industry risk levels. Margin diagnostics distinguish negative rows, products with any negative row,
aggregate negative products, high-revenue/low-margin products, and evidence-supported promotional-loss
candidates without hard-coding fixture products.

Trend and contribution outputs are descriptive. Segment revenue-change contributions reconcile to the
overall change and do not imply causation. Daily or weekly anomaly analysis uses a configurable
trailing median/MAD baseline, minimum history, threshold, and both relative and absolute materiality.
Partial weekly buckets are excluded by default. The method does not model holiday seasonality, so it
describes unusual values relative to a local baseline rather than unexpected or causal events.
Insufficient history is different from a completed run that found no anomaly.

Evidence references preserve the calculation components, metric dependencies, affected buckets and
segments, total matching-row count, and at most 12 deterministically ordered sample source IDs by
default. They do not attach every matching raw identifier to each result.

The dataset-bound engine owns a private request-scoped analysis runtime. Exact normalized filter keys
address at most eight immutable LRU contexts; each context shares its selected rows, checked base
aggregate, and prepared bounded-evidence support. All six breakdown dimensions and the date index are
prepared lazily and reused within that engine. Dataset vocabulary and full-history repeat status are
indexed once. Runtime identity prevents cross-engine context use.

There is no global, unbounded, or final-result cache. New engines receive new runtimes, standalone
public functions use ephemeral runtimes, and eviction removes retained derived state. This lifecycle
prevents results from becoming stale across datasets, configurations, or filter contexts while
preserving the public API.

## Reconciliation and performance

Phase 3 acceptance requires exact cents-based reconciliation against the approved Phase 2 controls,
including row, order, customer, quantity, revenue, cost, gross profit, spend, discounts, repeat, and
category/region/channel totals. Rounded report percentages and shares are display checks, not inputs
to engine calculations.

The benchmark suite measures parsing/validation, KPIs, breakdowns, comparisons, and anomalies
separately on the 6,909-row Phase 2 fixture and deterministic 55,272- and 110,544-row fixtures. Each
measured analytics batch constructs a fresh engine and may share contexts only within that batch.
The optimized 55,272-row medians meet all four project targets; the exact before/after results,
runtime/hardware context, warm-up and iteration counts, output-equivalence digests, and limitations
are recorded in the benchmark report. No universal production-performance claim follows from a
local benchmark.

See `docs/ANALYTICS_SPEC.md` for formulas and edge behavior, `docs/ANALYTICS_ENGINE.md` for the public
contract and exact Phase 2 reconciliation, `docs/ANALYTICS_BENCHMARKS.md` for the completed local
performance characterization, `docs/ARCHITECTURE.md` for repository boundaries, and
`tests/README.md` for the verification groups.
