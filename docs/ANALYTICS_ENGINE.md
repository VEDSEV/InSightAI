# Phase 3 deterministic analytics engine

**Status:** Phase 3 implementation reference
**Engine version:** `3.0.0`
**Analytics specification version:** `3.0.0`
**Scope:** framework-independent analytics only; no dashboard integration

This document describes the implemented Phase 3 engine. The governing business definitions remain
in [ANALYTICS_SPEC.md](ANALYTICS_SPEC.md); the repository boundaries are in
[ARCHITECTURE.md](ARCHITECTURE.md). When this reference and an implementation detail disagree, the
public types and tests must be reconciled before a consumer relies on the result. Phase 2 source
definitions are not reinterpreted here.

## Public entry point and factory

Code outside `src/analytics` imports analytics only through the public barrel:

```ts
import {
  createAnalyticsEngine,
  createDateInterval,
  ingestCanonicalCsv,
  type DatasetMetadata,
  type ValidationConfiguration,
} from "@/analytics";
```

`ingestCanonicalCsv` returns either a fully validated immutable dataset or an explicit invalid
result. A successful dataset can be closed over by the supported facade:

```ts
const ingestion = ingestCanonicalCsv({
  text: csvText,
  metadata,
  validationConfig,
});

if (ingestion.status !== "valid") {
  // Surface ingestion.errors; do not calculate from rejected rows.
  throw new Error("Dataset validation failed");
}

const engine = createAnalyticsEngine(ingestion.dataset);
const period = createDateInterval("2025-01-01", "2025-12-31");

if (period.status === "ok") {
  const metrics = engine.metrics({ period: period.value });
  const categoryBreakdown = engine.breakdown({
    dimension: "category",
    filter: { period: period.value },
  });
}
```

The frozen `AnalyticsEngine` exposes:

- `metrics(filter)`;
- `comparison(query)`;
- `breakdown(query)`;
- `concentration(query)`;
- `marginDiagnostics(query)`;
- `trendContributions(query)`;
- `anomalies(query)`.

The public entry point also exports the lower-level deterministic functions for tests, scripts, and
specialized adapters. Application consumers should prefer the factory so one dataset and one
configuration govern every result. No consumer should import a file beneath `src/analytics`
directly.

## Module ownership

| Module                | Responsibility                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `index.ts`            | Supported public exports.                                                                                       |
| `engine.ts`           | Immutable dataset-bound analytics facade.                                                                       |
| `types.ts`            | Canonical rows, metadata, filters, result envelopes, errors, evidence, and configuration contracts.             |
| `configuration.ts`    | Engine/spec versions, metric labels, missing key, evidence cap, margin defaults, and anomaly defaults.          |
| `money.ts`            | Decimal-to-cents parsing, checked cents arithmetic, exact rationals, and basis-point serialization.             |
| `dates.ts`            | Civil-date validation, inclusive intervals, calendar arithmetic, ISO weeks, and comparison-period resolution.   |
| `parsing.ts`          | CSV syntax and exact canonical-header parsing into raw strings.                                                 |
| `normalization.ts`    | Documented trimming and optional-blank-to-null normalization.                                                   |
| `validation.ts`       | Row and dataset validation plus the all-or-nothing ingestion boundary.                                          |
| `filters.ts`          | Normalized immutable filters, missing-value selection, and customer-type filtering.                             |
| `aggregation.ts`      | Shared checked totals and deterministic dimension grouping.                                                     |
| `analysis-context.ts` | Engine-owned bounded contexts for shared filtering, aggregation, grouping, date indexing, and evidence support. |
| `metrics.ts`          | The authoritative core KPI pass and typed metric envelopes.                                                     |
| `comparisons.ts`      | Current/prior metric calculation and absolute/relative change.                                                  |
| `breakdowns.ts`       | Six requested dimensional breakdowns and optional comparisons.                                                  |
| `concentration.ts`    | Ranked revenue exposure, top-k shares, and exact HHI.                                                           |
| `margins.ts`          | Product-margin distributions and configurable margin diagnostics.                                               |
| `trends.ts`           | Revenue series, change contributions, rankings, and consecutive declines.                                       |
| `anomalies.ts`        | Deterministic daily/weekly robust revenue anomalies.                                                            |
| `evidence.ts`         | Stable evidence fingerprints, bounded samples, and support metadata.                                            |
| `errors.ts`           | Structured analytics error construction and error/warning partitioning.                                         |

None of these modules imports React, Next.js, chart code, the Phase 2 generator, a database, or an AI
service.

### Internal analysis-context lifecycle

The public factory creates one private analysis runtime for its immutable dataset and configuration.
An exact canonical key covers the complete normalized filter context, including date boundaries,
timezone, all dimension selections, and customer-type scope. The runtime retains at most eight
immutable contexts in an exact LRU. A context shares one selected row set, base aggregate, prepared
bounded-evidence support, and lazy grouping/date indexes among calls on that engine.

Dataset vocabulary and full-history repeat status are prepared once per runtime. All six requested
breakdown dimensions are grouped together on first use, comparison periods reuse current/prior
contexts, and daily/weekly anomaly calls reuse one date index. Contexts carry a private
runtime-identity token, so a context cannot be consumed by another runtime even when metadata looks
the same.

There is no process-global or unbounded cache and no final-result cache. A new engine creates a new
runtime; eviction releases the runtime's reference to derived state; and the runtime becomes
collectable with its engine. Standalone public functions preserve their signatures and use an
ephemeral runtime.

## Decimal, money, rate, and rounding rules

### Authoritative money

`MoneyCents` is a branded, checked safe integer. Canonical monetary strings must be plain decimal
values with no exponent or thousands separator and at most two fractional digits. The parser accepts
an optional sign, but canonical source validation requires non-negative unit price, unit cost,
discount, revenue, cost, and marketing spend. Derived gross profit, changes, contribution, and ROI
numerators may be negative.

Examples:

```text
"18"    -> 1800 cents
"18.0"  -> 1800 cents
"18.00" -> 1800 cents
"18.001", "1e2", NaN, and infinity -> validation error
```

Addition, subtraction, and multiplication check the safe-integer boundary. Large intermediate
products and cross-products use `bigint` where necessary, then return to the public safe-integer
contract only after a range check. An overflow is explicit; it is never allowed to wrap or silently
lose cents.

### Exact rates

Margins, shares, repeat rates, changes, and ROI retain a reduced `{ numerator, denominator }`
rational. Average order value retains `numeratorCents / denominatorOrders` as rational money.
Calculations, comparisons, thresholds, and sorting use these unrounded components.

The serialization boundary converts a rational to integer basis points, where `10_000` basis points
equals `100%`. Ties round half away from zero. Currency display rounds to the dataset minor unit, but
display strings never feed another formula. A statistically interpolated value may remain a rational
fraction of one cent even though every source amount was whole cents.

No decimal dependency is used because the initial single-currency, two-decimal contract is fully
represented by checked cents and exact rationals.

## Runtime validation and metadata

The boundary is deliberately staged:

1. **CSV parsing:** validates quoting, row width, the exact 18-column canonical header, duplicate
   headers, missing columns, and unexpected columns. All field values remain strings.
2. **Normalization:** trims documented string fields and maps blank `customer_segment` and `campaign`
   cells to `null`. It does not calculate business metrics.
3. **Row validation:** validates required/optional fields, configured identifier policies,
   configured categorical vocabularies, civil `YYYY-MM-DD` dates, positive safe-integer quantity,
   decimal money, non-negative canonical amounts, and exact line arithmetic.
4. **Dataset validation:** requires a non-empty row set, one declared currency and timezone, declared
   coverage equal to observed minimum/maximum dates, unique `order_line_id`, consistent order-level
   dimensions across sibling lines, stable product-name/category mappings, and the declared marketing
   allocation semantics.
5. **Calculation:** accepts a `ValidatedDataset`; invalid rows are never silently cast into the
   calculation path.

Row arithmetic is:

```text
revenue_cents = quantity × unit_price_cents − discount_amount_cents
cost_cents    = quantity × unit_cost_cents
```

The dataset metadata supplied independently of the CSV contains:

- dataset, transformation, and analytics-specification versions;
- one ISO 4217 currency code;
- one IANA timezone;
- the inclusive dataset date interval;
- revenue and cost semantics;
- marketing-spend semantics: `line_level`, `single_line_order_allocation`, or `unavailable`.

Validation configuration supplies the allowed vocabulary and identifier patterns. The general
engine does not hard-code Phase 2 product IDs or dimension members. Phase 2-specific ID patterns and
vocabulary live only in its fixture adapter and reconciliation script.

The ingestion boundary is all-or-nothing in Phase 3. A source with one invalid row does not return a
partially accepted `ValidatedDataset`.

## Result and non-computable contracts

Public metrics do not return bare numbers. A computable result carries its metric ID, label, typed
value, unit, currency, precision, period, comparison period when applicable, normalized filters,
assumptions, data-quality state, evidence, engine version, numerator/denominator when applicable, and
change fields.

Non-computable results distinguish empty or invalid source data, invalid filters, zero denominators,
insufficient history, unavailable dimensions, insufficient segments, and unsupported marketing
allocation. A valid non-empty dataset whose filter matches no rows returns zero for additive sums and
counts, but returns a typed zero-denominator result for AOV, margins, repeat rates, and ROI.

## Core metrics

Let `R` be the canonical rows after the complete filter context. All monetary results below are
integer cents unless the result explicitly says rational.

| Metric ID                               | Authoritative definition                                                                | Zero/empty behavior                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `total_revenue`                         | `Σ row.revenue_cents`                                                                   | Additive zero.                                                                           |
| `total_cost`                            | `Σ row.cost_cents`                                                                      | Additive zero.                                                                           |
| `gross_profit`                          | `total_revenue − total_cost`                                                            | Additive zero; may be negative.                                                          |
| `gross_margin`                          | `gross_profit / total_revenue`                                                          | Non-computable when revenue is zero; row margins are never averaged.                     |
| `distinct_orders`                       | Count distinct selected `order_id`.                                                     | Count zero.                                                                              |
| `order_lines`                           | Count selected canonical rows.                                                          | Count zero.                                                                              |
| `total_quantity`                        | `Σ row.quantity`.                                                                       | Additive zero.                                                                           |
| `average_order_value`                   | `total_revenue / distinct_orders`, retained as rational cents/order.                    | Non-computable when order count is zero.                                                 |
| `unique_customers`                      | Count distinct selected `customer_id`.                                                  | Count zero.                                                                              |
| `one_time_customers_within_selection`   | Selected customers with exactly one distinct selected order.                            | Count zero.                                                                              |
| `repeat_customers_within_selection`     | Selected customers with at least two distinct selected orders.                          | Count zero.                                                                              |
| `repeat_customer_rate_within_selection` | Within-selection repeat customers / selected unique customers.                          | Non-computable when customer count is zero.                                              |
| `one_time_customers_full_dataset`       | Selected customers classified with exactly one distinct order across all loaded rows.   | Count zero.                                                                              |
| `repeat_customers_full_dataset`         | Selected customers classified with at least two distinct orders across all loaded rows. | Count zero.                                                                              |
| `repeat_customer_rate_full_dataset`     | Full-dataset-status repeat customers / selected unique customers.                       | Non-computable when customer count is zero.                                              |
| `total_discounts`                       | `Σ row.discount_amount_cents`.                                                          | Additive zero.                                                                           |
| `total_marketing_spend`                 | `Σ row.marketing_spend_cents`.                                                          | Additive zero when semantics are available; unavailable semantics return non-computable. |
| `marketing_contribution`                | `gross_profit − total_marketing_spend`.                                                 | Additive zero when semantics are available; may be negative.                             |
| `marketing_roi`                         | `marketing_contribution / total_marketing_spend`.                                       | Non-computable when spend is zero or spend semantics are unavailable.                    |

“Gross profit” excludes marketing, tax, shipping, platform fees, labor, overhead, refunds, and other
operating costs. Marketing contribution/ROI is a descriptive contribution-after-allocated-spend
measure, not ROAS and not causal incrementality.

Phase 2 allocates one order-level spend amount to one order line. Product/category filters can select
or exclude that allocation line, so marketing results under those filters carry an explicit warning
and must not be interpreted as product/category attribution.

## Filters and optional values

One immutable filter context controls all operations:

- inclusive date interval and dataset timezone;
- product ID;
- category;
- region;
- sales channel;
- customer segment;
- campaign;
- derived customer type with either repeat scope.

Different dimensions are ANDed; selected values within one dimension are ORed. An omitted or empty
selection means no restriction. Unknown values, blank selections, dates outside dataset coverage, a
timezone mismatch, and a reversed date interval are invalid filters.

Canonical optional values remain `null`. Filter and breakdown APIs expose the reserved key
`__missing__`; that key can be selected explicitly. Dataset validation rejects a reported dimension
value that collides with the configured missing key. Presentation layers may display a contextual
label such as “Unknown” or “Unattributed,” but that display text is not an engine key.

For a `within_selection` customer-type filter, classification is derived after date and all six
ordinary dimension filters and before applying the type selection. For a `full_dataset` customer-type
filter, classification uses every validated row, then intersects that status with the ordinary
filtered cohort.

Filtering creates a new frozen row array and does not mutate the dataset, row objects, input arrays,
or caller-owned filter state.

## Period comparisons

All modes retain the same non-date filters in both periods and require complete comparison coverage.
Public date intervals are inclusive civil dates.

| Mode                        | Resolution                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `previous_equal_length`     | For `N = inclusiveDayCount(current)`, prior is `[current.start − N, current.start − 1]`.                         |
| `previous_calendar_month`   | Current must be exactly one complete aligned calendar month; prior is the complete preceding calendar month.     |
| `previous_calendar_quarter` | Current must be exactly one complete aligned calendar quarter; prior is the complete preceding calendar quarter. |
| `previous_year`             | Shift both current boundaries back one calendar year; clamp February 29 to February 28 when required.            |

An unaligned month/quarter request returns `invalid_filter`. A valid period without full prior
coverage returns `insufficient_history`; the engine does not substitute a partial comparison.

For current `C` and prior `P`:

```text
absolute_change   = C − P
percentage_change = (C − P) / abs(P)
```

- `P = 0` and `C = 0`: percentage change is exact zero.
- `P = 0` and `C ≠ 0`: percentage change is non-computable, not infinity.
- A missing/incomplete prior period is insufficient history, not zero.
- For a rate, absolute change is the exact rate difference and represents percentage-point change;
  a relative change may still be returned separately when its prior denominator is nonzero.

## Dimensional breakdowns

Breakdowns support `product`, `category`, `region`, `channel`, `customer_segment`, and `campaign`.
Each entry contains:

- revenue, cost, gross profit, and gross margin;
- distinct orders;
- quantity;
- distinct customers;
- revenue share and signed profit share;
- an optional prior-period revenue comparison;
- bounded evidence.

The missing optional member uses `__missing__`. Revenue, cost, profit, and quantity reconcile across
an exhaustive partition. Distinct order and customer counts are not additive because one order or
customer can appear in more than one product/category segment. Profit share is
`segment_gross_profit / total_gross_profit`; with a nonzero signed denominator it may be negative or
greater than 100%, and with a zero denominator it is non-computable.

When comparison is requested, the union of current and prior segment keys is returned; a segment
present only in the prior period has zero current values. Default sorting is unrounded revenue
descending, then code-point key ascending. Callers may select revenue, cost, gross profit, orders,
quantity, or customers and ascending/descending direction.

## Concentration

Revenue concentration supports `product`, `category`, `region`, `channel`, and `customer`. It requires
positive selected revenue and returns ranked segments plus:

```text
top_k_share = revenue of first k ranked segments / total selected revenue
HHI         = Σ segment_revenue² / total_revenue²
```

Top-one is present for every computable non-empty result. Top-three and top-five return
`insufficient_segments` when fewer than three or five segments exist; they do not silently become a
top-all share. HHI retains a reduced exact rational as decimal strings and a half-up positive
basis-point serialization. The engine does not attach universal risk labels or unsupported industry
thresholds to these descriptive values.

## Margin diagnostics

The engine distinguishes:

- negative-margin source rows (`revenue_cents − cost_cents < 0`);
- products with any negative row;
- aggregate negative products with positive revenue and configured order support;
- zero-revenue/positive-cost products, whose margin is undefined;
- high-revenue, low-margin products;
- discounted promotional-loss candidates.

Default margin configuration is:

| Rule input                                                   |                                Default |
| ------------------------------------------------------------ | -------------------------------------: |
| Aggregate-negative minimum distinct orders                   |                                      2 |
| High-revenue minimum distinct orders                         |                                      3 |
| Minimum eligible products                                    |                                      4 |
| Revenue percentile                                           | 75th percentile (`7,500` basis points) |
| Maximum low-margin threshold                                 |             10% (`1,000` basis points) |
| Gap below overall margin                                     |                   10 percentage points |
| Minimum discounted negative rows for a promotional candidate |                                      1 |

The revenue threshold uses linear interpolation at `(n − 1) × p`. The low-margin threshold is the
smaller of the configured 10% maximum and overall gross margin minus 10 percentage points. Products
must meet both thresholds.

A promotional-loss candidate must remain profitable in aggregate, contain at least one positive row,
and contain the configured number of discounted negative rows where adding the explicit discount
back would restore non-negative row profit. This is a descriptive discount-associated candidate.
Only a caller-supplied promotion date window—optionally scoped to product IDs—changes its
classification to `confirmed_by_configured_window`. Production rules contain no Phase 2 product IDs
or promotion dates.

## Trends and revenue-change contribution

Trend analysis uses one of the four comparison definitions and one of the six breakdown dimensions.
For every segment in the union of current and prior keys:

```text
segment_delta                 = current_segment_revenue − prior_segment_revenue
contribution_to_total_change  = segment_delta / total_revenue_delta
Σ segment_delta               = total_revenue_delta
```

If total revenue change is zero, contribution shares are non-computable even though segment deltas
remain available. Results rank the largest positive and negative contributors separately with stable
key tie-breaking. This arithmetic decomposition is descriptive and does not imply that a segment
caused the business change.

Daily, ISO-weekly, and calendar-month series are supported. Missing dates inside selected coverage
are explicit zero-revenue buckets. A consecutive decline is an adjacent bucket transition whose
revenue is strictly lower than the preceding bucket. Results report the longest and latest run as a
transition count plus the ordered bucket keys participating in the run.

## Daily and weekly anomaly method

Anomaly detection operates on selected net revenue. Daily mode creates one bucket for every selected
calendar date; weekly mode uses Monday-through-Sunday ISO weeks. Missing buckets inside validated
coverage contain zero. Partial edge weeks are excluded by default and may be included explicitly;
only complete prior weekly buckets enter a weekly baseline.

Default configuration is:

| Setting                           |                                        Default |
| --------------------------------- | ---------------------------------------------: |
| Frequency                         |                                          Daily |
| Minimum series buckets            |                                             14 |
| Minimum baseline buckets          |                                              7 |
| Maximum trailing baseline buckets |                                             28 |
| Robust-z threshold                |                                          3.500 |
| Relative materiality              |                     20% (`2,000` basis points) |
| Absolute materiality floor        | $50.00 (`5,000` cents in the dataset currency) |
| Include partial weeks             |                                             No |

For candidate bucket revenue `x` and the trailing baseline:

```text
median   = median(baseline revenue)
MAD      = median(abs(baseline revenue − median))
robust_z = 0.6745 × (x − median) / MAD
```

A nonzero-MAD candidate requires `abs(robust_z) >= threshold` and an absolute deviation at least the
configured relative materiality multiplied by `max(abs(median), absolute_floor)`. When MAD is zero, a
different value that passes materiality uses the explicit zero-MAD fallback; robust z is null rather
than infinite.

Daily mode continues to use the immediate trailing MAD baseline. When enough prior matching weekdays
exist, it also requires the candidate to pass the same materiality test against the matching-weekday
median. The finding evidence exposes both the primary baseline and this weekday guard. This reduces
ordinary weekday-cadence false positives without pretending to model holidays or full seasonality.

Insufficient series/baseline history returns `insufficient_history`, which is distinct from a
completed run with no findings. Findings say “unusually high/low versus the robust recent baseline.”
They are not forecasts, causal explanations, or claims that a business event was unexpected.

The approved Phase 2 spike on `2024-11-29` and drop on `2025-08-12` are both detected under the
documented default robust configuration.

## Bounded evidence

Every metric, breakdown, diagnostic, and anomaly carries an `EvidenceReference`. It includes:

- dataset, engine, and rule versions;
- a deterministic evidence ID;
- total matching-row and distinct-order counts;
- affected date intervals and segment keys;
- numerator and denominator summaries when applicable;
- metric dependencies;
- sorted unique sample order-line and order IDs;
- sample limit and truncation state.

The default sample limit is 12. The fingerprint considers the complete deterministic source-ID set
and calculation context, while the public samples remain bounded. FNV-1a is used for a stable local
fingerprint, not as a security or authentication primitive. Evidence references do not copy thousands
of raw rows or IDs into every result.

Evidence preparation sorts and fingerprints a selected row set once per immutable analysis context
and reuses that support only when the evidence source is exactly that row set. Segment and date-bucket
support is prepared with the corresponding immutable group. The optimized two-word unsigned FNV-1a
implementation preserves the original 64-bit hexadecimal fingerprints, including UTF-16 behavior;
the fingerprint input and public evidence contract did not change.

## Phase 2 reconciliation

`pnpm reconcile:analytics` loads and validates the approved serialized CSV through the public
analytics boundary, recomputes the controls, and compares them independently with fixed approved
expectations. The current reconciliation passed **26 of 26 checks**.

CSV SHA-256:

```text
66f237491182dd1e8ae2c786543e98b3157f27658e7e5c11bfa8cec07de9c5e8
```

### Headline controls

| Control                                |                                                 Exact result |
| -------------------------------------- | -----------------------------------------------------------: |
| Order lines                            |                                                        6,909 |
| Distinct orders                        |                                                        4,310 |
| Distinct customers                     |                                                        1,200 |
| Total quantity                         |                                                        9,044 |
| Revenue                                |                               77,823,110 cents ($778,231.10) |
| Cost                                   |                               46,041,700 cents ($460,417.00) |
| Gross profit                           |                               31,781,410 cents ($317,814.10) |
| Gross margin                           | Exact `31,781,410 / 77,823,110`; documented display 40.8380% |
| Marketing spend                        |                                 7,340,221 cents ($73,402.21) |
| Discounts                              |                                 2,522,290 cents ($25,222.90) |
| Repeat customers, full-dataset scope   |                                                          517 |
| One-time customers, full-dataset scope |                                                          683 |

### Revenue partitions

| Category  |  Revenue cents | Region    |  Revenue cents | Channel       |  Revenue cents |
| --------- | -------------: | --------- | -------------: | ------------- | -------------: |
| Gifting   |      2,593,218 | Central   |     18,471,826 | Marketplace   |     20,238,052 |
| Home      |     29,017,166 | East      |     19,322,210 | Retail Pop-up |      9,615,448 |
| Kitchen   |     23,253,510 | South     |     11,700,082 | Web           |     47,969,610 |
| Outdoor   |      6,467,694 | West      |     28,328,992 |               |                |
| Wellness  |      9,568,686 |           |                |               |                |
| Workspace |      6,922,836 |           |                |               |                |
| **Total** | **77,823,110** | **Total** | **77,823,110** | **Total**     | **77,823,110** |

The 26 checks comprise one checksum, eleven headline metrics, one exact gross-margin cross-product,
six category revenues, four region revenues, and three channel revenues. The approved source controls
remain documented in [the Phase 2 control totals](../data/sample/CONTROL_TOTALS.md).

## Test families

Phase 3 tests are behavioral and invariant-focused rather than output snapshots:

- `analytics-money.test.ts`: parsing, negative values, overflow, rational reduction, and rounding;
- `analytics-validation.test.ts`: CSV, normalization, row/dataset rejection, nullable dimensions, and
  allocation semantics;
- `analytics-metrics-golden.test.ts`: hand-auditable KPI totals, two repeat scopes, filters,
  non-computable states, immutability, and repeated aggregation;
- `analytics-breakdowns-comparisons.test.ts`: calendar boundaries, leap years, zero-prior behavior,
  six breakdowns, sorting, concentration, reconciliation, and invariants;
- `analytics-diagnostics-trends.test.ts`: margin cases, configurable thresholds, promotional windows,
  contributions, ranking, and consecutive decline;
- `analytics-anomalies.test.ts`: stable/spike/drop, zero MAD, materiality boundary, history, weekday
  guard, daily/weekly partial buckets, Phase 2 scenarios, and evidence;
- `analytics-architecture-boundary.test.ts`: public-entry-only imports, framework independence,
  dashboard isolation, and absence of dashboard metric arithmetic;
- existing Phase 2 generator, artifact, profile, quality, and scenario suites remain intact.

The golden CSV and hand-authored expected controls live in `tests/fixtures/analytics`. Expected values
are not generated by the functions under test.

## Benchmark status

`pnpm benchmark:analytics` covers the 6,909-line Phase 2 fixture plus deterministic x8 and x16
fixtures of 55,272 and 110,544 lines. It measures parsing/validation, all core KPIs, all six
breakdowns, all four comparison modes, and daily/weekly anomalies separately. Full mode uses two
warm-ups and seven measured serial iterations. Every measured analytics iteration creates a fresh
engine inside the timed batch, while calls in that batch may share only its bounded contexts.

On the recorded workstation, all four 55,272-row acceptance medians passed: KPIs `667.4686 ms`,
breakdowns `1,445.7036 ms`, comparisons `556.8967 ms`, and anomalies `852.2076 ms`. The prior
medians were `16,770.8671 ms`, `11,509.9070 ms`, `30,548.7244 ms`, and `4,400.9679 ms`.
Complete public outputs, including evidence, receive untimed SHA-256 equivalence digests.

The exact protocol, before/after table, 110,544-row results, profile, runtime context, and limitations
are in [the benchmark report](ANALYTICS_BENCHMARKS.md). These are workstation-specific local
microbenchmarks, not universal production-performance guarantees.

## Dashboard integration boundary

Phase 4 consumes this module only through `src/analytics/index.ts`. The dashboard fetches the
approved synthetic CSV, validates it with `ingestCanonicalCsv`, creates one immutable
dataset-bound engine, and uses its typed metric, comparison, breakdown, evidence, and
`performanceTrend` envelopes. The dashboard adapter may select, label, and format these outputs but
does not calculate a KPI, share, margin, comparison, or time-series bucket itself.

`performanceTrend` is a public, framework-independent addition for Phase 4. It returns inclusive
daily, weekly, or monthly buckets with integer-cent revenue and gross profit, row/order support, the
canonical filter context, and bounded evidence. Empty matched rows return the existing typed
non-computable result rather than fabricated chart points.

The architecture-boundary test parses repository imports and dashboard expressions to enforce:

- dashboard imports use only the public analytics entry point, never analytics internals, Phase 2
  data imports, or generator tooling;
- no React, Next.js, presentation, or generator import inside analytics;
- code outside analytics may access it only through `src/analytics/index.ts`;
- dashboard code does not independently reduce or calculate business metrics.

The architecture check also prevents dashboard arithmetic over business metrics and confirms the
retired Phase 1 preview implementation is absent.

## Assumptions and known limitations

- The initial contract is one order line per product, positive quantity, one currency, and one IANA
  timezone per dataset.
- Dates are calendar dates without time-of-day. Fiscal calendars and timestamp-level analysis are not
  implemented.
- Revenue is net of the explicit line discount. Tax, shipping revenue, refunds, returns,
  cancellations, and chargebacks are not modeled.
- Cost is line cost of goods. Gross profit is not accounting net income and excludes fees, shipping
  cost, labor, overhead, and other operating expenses.
- Full-dataset repeat status is limited to history present in the loaded dataset. It is not lifetime
  customer retention.
- Optional segment/campaign nulls remain analytically present under `__missing__`; the engine does not
  infer missing labels.
- Marketing spend must have declared semantics. The Phase 2 single-line allocation preserves
  order/channel totals but is not product attribution or causal incrementality.
- Profit shares with a signed total may be negative or greater than 100%; zero-total shares are
  non-computable.
- Promotion confirmation depends on caller-supplied windows. Discount-associated candidates are not
  proof that a campaign caused a loss.
- Trend contributions are arithmetic decomposition, not causal attribution.
- The runtime retains up to eight filter contexts per engine. This is a bounded latency/memory
  tradeoff, not a cross-request or global cache.
- The 110,544-row benchmark raises further allocation and evidence work in breakdown/anomaly paths;
  the scaled fixture increases rows but not real-world dimension cardinality.
- The anomaly method handles recent level and weekday cadence but does not model holidays, fiscal
  seasonality, structural breaks, confidence intervals, or forecasts.
- All processing is in-memory TypeScript and bounded by the JavaScript safe-integer and available
  memory contracts. Benchmark evidence is required before defining operational dataset ceilings.
- There is no upload/mapping workflow, persistence, authentication, database, AI explanation/chat,
  forecasting, causal inference, deployment, or dashboard integration in Phase 3.
