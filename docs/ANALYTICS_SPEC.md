# InsightAI Deterministic Analytics Specification

**Status:** Phase 3 implementation contract; resolved against the approved Phase 2 fixture
**Purpose:** define authoritative business facts before they appear in UI or AI context

## Governing rule

Every authoritative metric, comparison, breakdown, anomaly, and rule-based finding must be produced
by deterministic, versioned code from validated canonical data. A language model may later explain
these outputs but must never calculate, overwrite, repair, or silently infer them.

## Phase 3 resolved definitions

The following decisions resolve earlier specification ambiguity without changing Phase 2 source
fields, control totals, scenarios, or checksum:

- Authoritative monetary inputs are parsed lexically from decimal strings into integer cents; the
  primitive parser accepts zero, one, or two fractional digits and zero-pads when needed. Inputs
  with more than two fractional digits are rejected rather than rounded. The approved Phase 2 CSV
  serializes exactly two fractional digits. Derived money may be signed, while Phase 2 source money
  remains non-negative.
- Money aggregation uses checked safe integers. Rates retain exact integer numerator and denominator
  values; basis points are a serialization boundary using round-half-away-from-zero. Rounded rates
  never feed later calculations or sorting.
- Canonical metric IDs use `gross_profit` and `gross_margin`. The earlier `total_profit` and
  `profit_margin` wording referred to the same gross-profit-before-marketing concepts and is retired
  before implementation.
- A loaded dataset with zero accepted rows is invalid source data and produces a typed
  non-computable result. A valid non-empty dataset whose filter matches no rows returns zero for
  additive sums/counts and `not_applicable` for ratios.
- Repeat behavior has explicit scopes: `*_within_selection` uses distinct visible orders in the
  selected period/filter context; `*_full_dataset` classifies each customer from all rows in the
  loaded validated dataset, then counts classified customers represented in the selection. Phase 2
  controls use the full-dataset definition.
- Missing optional dimensions use the analytical key `__missing__`. It represents null source
  context, not an inferred segment, organic campaign, or zero spend.
- Generic canonical validation uses dataset-supplied categorical vocabularies and opaque ID rules.
  Phase 2's exact ID formats and dimension values remain fixture-specific reconciliation checks.
- Calendar-month and calendar-quarter comparisons require a complete aligned current period.
  Partial aligned periods return a typed non-computable result. Previous-year comparison shifts the
  inclusive interval back one calendar year, normalizing February 29 to February 28 when necessary.

## Canonical dataset

### Grain

One row represents one order line for one product. `order_line_id` is unique, while `order_id` may
repeat for multi-product orders. `revenue`, `cost`, `discount_amount`, and `marketing_spend` are row
totals, not unit values. `quantity` describes the number of product units on that line.

This grain prevents product analysis from relying on arbitrary allocation after ingestion. An upload
that is truly one row per order can still map to the contract when each order has only one product;
mixed-grain input must be rejected or explicitly transformed.

### Initial fields

| Field              | Type after validation | Required | Meaning and initial constraint                                                                                  |
| ------------------ | --------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `order_line_id`    | string                | Yes      | Non-empty stable line identifier; unique at canonical grain                                                     |
| `order_id`         | string                | Yes      | Non-empty opaque order identifier; distinct count defines orders                                                |
| `order_date`       | date                  | Yes      | Calendar date interpreted in the dataset timezone; no time-of-day in MVP                                        |
| `customer_id`      | string                | Yes      | Non-empty opaque identifier; no direct personal information                                                     |
| `customer_segment` | string or null        | No       | Optional segment context; null means not reported and must not remove the row from whole-dataset metrics        |
| `product_id`       | string                | Yes      | Stable normalized product identifier                                                                            |
| `product_name`     | string                | Yes      | Normalized display name associated with `product_id`; non-empty                                                 |
| `category`         | string                | Yes      | Normalized product category; use explicit `Uncategorized` only through a documented mapping                     |
| `region`           | string                | Yes      | Normalized business region; semantic definition supplied by dataset owner                                       |
| `sales_channel`    | string                | Yes      | Normalized channel such as web, marketplace, or retail                                                          |
| `quantity`         | integer               | Yes      | Positive in the initial schema; returns/refunds are not yet modeled                                             |
| `unit_price`       | finite decimal        | Yes      | Non-negative catalog/unit selling value before line discount                                                    |
| `unit_cost`        | finite decimal        | Yes      | Non-negative cost of goods per unit                                                                             |
| `discount_amount`  | finite decimal        | Yes      | Explicit non-negative total line discount; cannot exceed `quantity × unit_price`                                |
| `revenue`          | finite decimal        | Yes      | `quantity × unit_price − discount_amount`, before excluded tax/shipping rules; non-negative                     |
| `cost`             | finite decimal        | Yes      | `quantity × unit_cost`; non-negative                                                                            |
| `campaign`         | string or null        | No       | Optional acquisition/retention context; null means unattributed/not reported and does not imply zero spend      |
| `marketing_spend`  | finite decimal        | Yes      | Spend uniquely allocated to this row; non-negative and never repeated across sibling lines or other allocations |

### Dataset-level metadata

The calculation context must also provide:

- `dataset_version`: immutable identifier for the canonical row set;
- `currency`: one ISO 4217 currency code for the entire initial dataset;
- `timezone`: IANA timezone used to interpret date boundaries;
- `date_min` and `date_max` after validation;
- input, accepted, rejected, and warning row counts;
- mapping/transformation version and analytics specification version;
- confirmation of cost, revenue, and marketing-spend semantics.

The Phase 2 fixture additionally records generator version, source revision, fixed seed, scenario
manifest, independent control totals, distribution profile, and CSV SHA-256. These are
dataset-development metadata, not row fields or production analytics outputs.

Mixed currencies are unsupported in the initial contract. They must not be summed without an
explicit, dated exchange-rate policy in a future specification.

## Cleaning and validation assumptions

- Trim surrounding whitespace and normalize internal whitespace for identifiers/dimensions only
  through documented transformations; preserve original values for audit.
- Match headers through explicit user-approved mapping, not fuzzy guessing that silently commits.
- Parse dates with an explicit accepted format and reject ambiguous values such as `01/02/03` unless
  the user confirms a locale.
- Parse decimal money lexically and store it as checked integer cents. Never derive authoritative
  cents through binary floating-point multiplication and never round source rows into validity.
- Reject NaN, infinity, blank required values, impossible dates, non-integer quantities, and values
  outside declared constraints.
- Preserve blank optional `customer_segment` and `campaign` values as null. Whole-dataset metrics
  retain those rows. Dimension breakdowns may map null to an explicit `Unknown` or `Unattributed`
  `__missing__` member, but must not silently drop rows or infer a value. Missing campaign context does not change
  `marketing_spend`; missing segment context does not change distinct-order repeat classification.
- Dimension normalization may merge case/whitespace variants after showing the proposed result.
- Duplicate detection uses `order_line_id`. A repeated `order_id` alone is not a duplicate because
  the grain is an order line.
- The initial contract supports only an explicit line-level `discount_amount` that reconciles to
  revenue. It does not silently model returns, refunds, cancellations, tax, shipping, fees, or
  inventory. Data requiring those semantics must be rejected or marked unsupported until the schema
  evolves.

### Phase 2 marketing allocation

The synthetic fixture calculates one order-level marketing amount from order revenue and the
configured campaign rate, then writes the full amount to the order's first line while every sibling
line receives zero. This makes the order allocation exact and auditable without adding a second
marketing table. It preserves channel-level totals but should not be interpreted as product-level
attribution. Future external datasets may use another documented allocation method, but every unit of
spend must still be represented exactly once before marketing ROI is available.

## Filter context

All outputs for a view use one immutable filter context:

- reporting period `[start_date, end_date]`, inclusive at calendar-date grain;
- timezone;
- zero or more selected products, categories, regions, sales channels, customer segments, campaigns,
  and derived customer types;
- comparison mode: previous equal-length period, previous calendar month, previous calendar quarter,
  or previous year;
- dataset version and currency.

Dimension filters are ANDed across dimensions and ORed within one dimension. For example, region in
`[North, West]` AND channel in `[Web]`. No selection means all values in that dimension.

Unless a metric explicitly says otherwise, apply all filters before calculating its numerator and
denominator. A breakdown by one dimension retains all other filters and groups the filtered rows by
that dimension.

## Period comparison

For a selected inclusive period containing `N` calendar days, the default comparison period is the
immediately preceding `N` days:

```text
current:  [start_date, end_date]
previous: [start_date - N days, start_date - 1 day]
```

Use the same non-date filters for both periods. Supported definitions are:

- `previous_equal_length`: the immediately preceding `N` calendar days;
- `previous_calendar_month`: the complete month immediately before a current interval that is one
  complete calendar month;
- `previous_calendar_quarter`: the complete quarter immediately before a current interval that is
  one complete calendar quarter;
- `previous_year`: the same inclusive calendar interval one year earlier, with February 29 mapped to
  February 28.

If the dataset lacks complete coverage for the required previous interval, comparisons return
`insufficient_data`. Partial previous periods are never annualized, prorated, or silently accepted.

### Growth formula

For current value `C` and previous value `P`:

```text
growth = (C - P) / abs(P)
```

- `P > 0`: return the decimal rate and display as a percentage.
- `P = 0` and `C = 0`: return `0` with status `ok`.
- `P = 0` and `C != 0`: return `null` with status `not_applicable`; UI may state “new from zero.”
- Missing/incomplete previous period: return `null` with status `insufficient_data`.

Using `abs(P)` keeps direction interpretable if future schemas allow negative comparison values.

## Core metric definitions

Let `R` be the filtered canonical rows. Monetary sums retain calculation precision and are rounded
only for display according to the dataset currency.

Phase 3 public metric IDs are `total_revenue`, `total_cost`, `gross_profit`, `gross_margin`,
`distinct_orders`, `order_lines`, `total_quantity`, `average_order_value`, `unique_customers`,
`one_time_customers_within_selection`, `repeat_customers_within_selection`,
`repeat_customer_rate_within_selection`, `one_time_customers_full_dataset`,
`repeat_customers_full_dataset`, `repeat_customer_rate_full_dataset`, `total_discounts`,
`total_marketing_spend`, `marketing_contribution`, and `marketing_roi`. Additive definitions are sums
or distinct counts at canonical order-line grain. Marketing contribution is revenue minus cost minus
allocated spend.

### Total revenue

```text
total_revenue = Σ row.revenue for row in R
```

Unit: dataset currency. Empty filtered set: `0`, with the UI separately showing that no rows match.

### Gross profit

In the initial product, “profit” means **gross profit before marketing, tax, shipping, overhead, and
other operating expenses**:

```text
row_gross_profit = row.revenue - row.cost
gross_profit = Σ row_gross_profit for row in R
```

The canonical metric ID is `gross_profit`. This is not accounting net profit.

### Gross margin

```text
gross_margin = gross_profit / total_revenue
```

Unit: decimal displayed as percentage. If total revenue is zero, return `null` / `not_applicable`.
Do not average row margins.

### Total orders

```text
total_orders = count(distinct row.order_id for row in R)
```

If product/category filters select only some lines of a multi-line order, that order counts once in
the selected analytical slice. This is a slice-level order count, not necessarily the whole-order
population from the unfiltered dataset.

### Average order value

```text
average_order_value = total_revenue / total_orders
```

If total orders is zero, return `null` / `not_applicable`. Revenue is aggregated across all selected
lines before division.

### Unique customers

```text
unique_customers = count(distinct row.customer_id for row in R)
```

Blank customer IDs are rejected at validation and never collapsed into one synthetic customer.

### Repeat-customer metrics

For within-selection metrics, first count distinct selected orders per customer. A repeat customer
has at least two distinct order IDs within the selected period and filter context.

```text
repeat_customers = count(customer where distinct_selected_orders(customer) >= 2)
repeat_customer_rate = repeat_customers / unique_customers
```

If unique customers is zero, return `null` / `not_applicable`. Product filtering can change this
result by changing which orders are visible; the result must expose that filter context.

Full-dataset variants classify every customer from all validated rows before applying the selected
period. They are named `repeat_customers_full_dataset`, `one_time_customers_full_dataset`, and
`repeat_customer_rate_full_dataset`. They describe loaded-history frequency, not retention outside
the loaded dataset. Phase 2 reconciliation uses these variants.

### Revenue growth

Calculate `total_revenue` for the current and full previous period under identical dimension filters,
then apply the growth formula above.

### Profit growth

Calculate `gross_profit` for the current and full previous period under identical dimension filters,
then apply the growth formula above.

### Marketing ROI

Marketing ROI measures contribution after allocated marketing spend, not causal incrementality:

```text
total_marketing_spend = Σ row.marketing_spend for row in R
marketing_contribution = total_revenue - Σ row.cost - total_marketing_spend
marketing_roi = marketing_contribution / total_marketing_spend
```

If spend is zero, return `null` / `not_applicable`. A result of `0.25` means 25% contribution relative
to allocated spend under these limited cost assumptions. Do not label this as ROAS, and do not claim
that marketing caused the associated revenue. If spend has been repeated at order-line grain or its
allocation is unknown, mark this metric unavailable rather than double count it.

## Breakdown definitions

Phase 3 supports product, category, region, channel, customer-segment, and campaign breakdowns. Each
segment exposes revenue, cost, gross profit, gross margin, distinct orders, quantity, and distinct
customers where meaningful, plus exact revenue/profit share ratios and optional comparison change.
The `__missing__` key is used consistently for null optional dimensions. Additive money and quantity
must reconcile to the filtered total. Distinct orders and customers are non-additive when an order or
customer spans segments and therefore are not required to sum.

Sorting uses the unrounded requested measure, followed by a locale-independent code-point comparison
of the stable segment key. Comparison breakdowns use the union of current and prior keys.

All breakdowns group filtered rows, calculate the named sum per normalized dimension value, and sort
descending by the primary value with normalized name ascending as a stable tie-breaker.

### Revenue by product

```text
for each product_id: Σ row.revenue
```

### Profit by product

```text
for each product_id: Σ (row.revenue - row.cost)
```

Include revenue and profit margin alongside profit in the result so the UI can provide context.

### Revenue by category

```text
for each category: Σ row.revenue
```

### Profit by category

```text
for each category: Σ (row.revenue - row.cost)
```

### Revenue by region

```text
for each region: Σ row.revenue
```

### Revenue by channel

```text
for each sales_channel: Σ row.revenue
```

Breakdown values should reconcile to the total for rows with a valid exhaustive dimension. A contract
test must assert this invariant.

## Derived diagnostic definitions

Thresholds below are initial specification defaults. They must live in versioned configuration,
appear in evidence, and be tuned only with evaluation—not hidden UI constants.

### Revenue concentration

Calculate both maximum-product share and top-five-product share:

```text
product_share(product) = product_revenue / total_revenue
max_product_share = max(product_share)
top_5_product_share = sum(revenue of five highest-revenue products) / total_revenue
```

If total revenue is zero, both values are not applicable. Initial rule levels:

- `watch`: max product share >= 30% or top-five share >= 70%;
- `high`: max product share >= 50% or top-five share >= 85%.

Phase 3 calculates top-one, top-three, and—when at least five segments exist—top-five revenue share,
plus the Herfindahl-Hirschman Index from exact segment revenue shares. It supports product, category,
region, channel, and customer dimensions. Concentration is an exposure, not inherently a problem.
Any configured descriptive bands are labeled project defaults, not universal industry thresholds,
and findings use neutral language.

### Negative-margin products

Aggregate product revenue, cost, and profit in the selected period:

```text
product_profit = product_revenue - product_cost
product_margin = product_profit / product_revenue
```

A product qualifies when `product_profit < 0`, product revenue is greater than zero, and it has at
least 2 distinct selected orders. Products with zero revenue and positive cost are returned separately
as data/business exceptions because margin is undefined. Rank by most negative profit, then revenue.

### High-revenue, low-margin products

For products with at least 3 distinct selected orders and positive revenue:

```text
revenue_threshold = 75th percentile of eligible product revenue (inclusive method)
low_margin_threshold = min(10%, overall_gross_margin - 10 percentage points)

qualifies when:
  product_revenue >= revenue_threshold
  AND product_margin < low_margin_threshold
```

The rule is not evaluated with fewer than 4 eligible products or when overall margin is not
computable. The evidence includes both thresholds, product values, order support, and dataset version.

### Declining categories or regions

For each category/region present in either current or full previous period, calculate revenue growth
with identical non-time filters. A segment qualifies when:

- previous-period revenue is at least the configured materiality floor;
- current-period revenue decline is at least 10%;
- both periods have at least 3 distinct selected orders for that segment.

The initial materiality floor is the greater of 1% of previous total revenue or 100 units of dataset
currency. Currency-specific tuning is required before external-data release. A segment absent in the
current period but material previously is a 100% decline. A segment new from zero is not “declining.”

### Period-over-period comparisons

At minimum, compare total revenue, gross profit, gross margin, total orders, average order value,
unique customers, and marketing ROI when each is computable.

Rate metrics use percentage-point difference as the primary change:

```text
margin_change_pp = (current_margin - previous_margin) × 100
```

They may also include relative change as secondary metadata when the previous rate is nonzero. UI
labels must distinguish `%` from percentage points (`pp`).

### Basic anomaly detection

Anomalies are detected on a complete daily or weekly revenue series for the selected context. Missing
buckets within dataset coverage are filled with zero; buckets outside coverage are not invented.
Daily mode uses prior matching weekdays when sufficient history exists to reduce routine weekday and
holiday-season false positives; weekly mode uses prior complete weeks. Frequency, lookback, minimum
history, robust-z threshold, and materiality are configuration recorded in every result.

For value `x_t` in its configured robust trailing baseline:

```text
median = median(baseline)
MAD = median(abs(x_i - median))
robust_z = 0.6745 * (x_t - median) / MAD
```

A point is a candidate when `abs(robust_z) >= 3.5` and its absolute change from the median is at least
20% of `max(abs(median), materiality_floor)`. If `MAD = 0`, use a deterministic fallback: candidate
only when the value differs from the median and the same materiality rule is met. The project-default
floor is 50 currency units and is configurable. It is not scaled from full-period revenue because
that can suppress legitimate low-day drops in longer selected periods.

Known incomplete current buckets must be excluded. The result is labeled “unusual versus robust
recent baseline,” never “unexpected” or causal. The weekday-matched baseline is a limited seasonal
guard, not a forecast or full seasonal model.

## Result contract

Every metric result must carry:

- stable metric ID and analytics-specification version;
- a discriminated machine value (money cents, count, integer quantity, rational money, or exact rate
  numerator and denominator) and unit;
- status: `ok`, `not_applicable`, `insufficient_data`, `invalid_filter`, or `invalid_source`;
- current period, comparison period if used, timezone, and currency;
- normalized active filters;
- accepted row count and distinct-order support;
- dataset and transformation version;
- warnings and assumptions relevant to interpretation.

Non-computable results use a separate discriminated result shape with a stable reason code and no
placeholder numerical value. Empty source data, invalid filters, zero denominators, insufficient
history, unavailable dimensions, and invalid source data remain distinct.

Every finding/anomaly additionally carries:

- stable evidence ID and rule/method version;
- rule inputs, configured thresholds, observed values, and support counts;
- affected dimension identifiers;
- severity or priority derived deterministically;
- factual sentence template that avoids causal language.

Formatted strings are presentation outputs. They must not be parsed back into calculations.

## Evidence contract

Evidence is a bounded locator, not a copy of the dataset. It records the dataset and engine versions,
matching-row and distinct-order counts, affected date buckets and segment keys, numerator and
denominator summaries, metric dependencies, and a deterministic sorted sample of source line and
order IDs. Sample caps are configuration values; every reference reports its cap, total matching
count, and whether it was truncated. Thousands of raw identifiers are never attached to a result.

Marketing spend is uniquely allocated to one source line per Phase 2 order. Whole-dataset, region,
channel, and campaign totals are valid under that allocation. Product/category-filtered contribution
and ROI cannot be interpreted as product attribution; those results carry an
`unsupported_allocation` data-quality warning or a typed non-computable result.

Promotional-loss diagnostics are data-driven and never name Phase 2 product IDs. A candidate is an
aggregate-profitable product with both positive- and negative-margin rows where discounted negative
rows would have been non-negative before discount. It is called a confirmed promotional case only
when configured promotion-window metadata supports that label; otherwise it remains a candidate.

## Rounding and display

- Keep integer-cent and rational precision through aggregation.
- Round currency for display using the currency's standard minor units, but expose full calculation
  precision to tests where the chosen numeric representation permits.
- Serialize percentages to integer basis points using round-half-away-from-zero. Display precision is
  result metadata and presentation code may choose fewer digits without changing the rational value.
- Use locale-aware formatting in the UI; locale formatting must not affect stored values.
- Do not transform a small nonzero result into a displayed zero without an indicator such as `<0.1%`.
- Sorting uses unrounded values.

## Null, zero, and empty behavior

- `0` is a valid measured result when the formula has a defined denominator or is a sum/count.
- `null` means the metric cannot be computed; it must include a non-`ok` status and reason.
- An empty filter result returns zero for additive sums/counts and not-applicable for ratios.
- Missing comparison coverage is insufficient data, not zero growth.
- UI empty states must distinguish no matching rows, invalid dataset, and unavailable metric.

## Evidence and reconciliation tests

Phase 3 must include at least:

- a hand-auditable golden fixture with independent expected totals;
- multi-line orders to prove distinct-order behavior;
- duplicate customer/order lines to prove repeat-customer logic;
- zero revenue, zero spend, negative profit, and empty filters;
- current/previous boundary dates and incomplete comparison history;
- breakdown totals that reconcile to filtered totals;
- high-revenue/low-margin percentile threshold boundaries;
- anomaly series with stable, spiking, dropping, missing, and zero-MAD cases;
- randomized invariants such as total revenue equaling the sum of exhaustive product groups;
- checks that display rounding never feeds subsequent calculations.

## Known limitations requiring future schema versions

- returns, refunds, cancellations, tax, shipping revenue/cost, fees, and overhead;
- discount types, coupon funding, stacked discounts, and allocations not expressed as one line total;
- quantity of zero or negative adjustment records;
- multiple currencies and exchange rates;
- customer history outside the selected dataset;
- marketing spend at campaign/day/channel grain and formal attribution;
- time-of-day, fiscal calendars, holiday calendars, and full seasonality modeling beyond the limited
  matching-weekday baseline;
- statistical confidence, forecasts, experiments, and causal inference.

These limitations must be visible where they materially affect interpretation. They may not be filled
in by AI.
