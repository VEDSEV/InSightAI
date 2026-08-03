# InsightAI Deterministic Analytics Specification

**Status:** specification only; implementation begins in Phase 3  
**Purpose:** define authoritative business facts before they appear in UI or AI context

## Governing rule

Every authoritative metric, comparison, breakdown, anomaly, and rule-based finding must be produced
by deterministic, versioned code from validated canonical data. A language model may later explain
these outputs but must never calculate, overwrite, repair, or silently infer them.

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
- Parse decimals without binary floating-point surprises in the eventual implementation. Currency
  may be stored as integer minor units or a decimal library representation; do not round every row
  before aggregation.
- Reject NaN, infinity, blank required values, impossible dates, non-integer quantities, and values
  outside declared constraints.
- Preserve blank optional `customer_segment` and `campaign` values as null. Whole-dataset metrics
  retain those rows. Dimension breakdowns may map null to an explicit `Unknown` or `Unattributed`
  member, but must not silently drop rows or infer a value. Missing campaign context does not change
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
- zero or more selected products, categories, regions, and sales channels;
- comparison mode, initially `previous_period`;
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

Use the same dimension filters for both periods. Calendar-aligned month/quarter/year comparison may
be added later as an explicit mode, not substituted silently. If the dataset lacks the full previous
period, comparisons return `insufficient_data` unless a deliberately selected partial-comparison mode
is later specified.

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

### Total revenue

```text
total_revenue = Σ row.revenue for row in R
```

Unit: dataset currency. Empty filtered set: `0`, with the UI separately showing that no rows match.

### Total profit

In the initial product, “profit” means **gross profit before marketing, tax, shipping, overhead, and
other operating expenses**:

```text
row_gross_profit = row.revenue - row.cost
total_profit = Σ row_gross_profit for row in R
```

UI labels should prefer “Gross profit” even though the metric identifier remains `total_profit` for
the requested initial set. This is not accounting net profit.

### Profit margin

```text
profit_margin = total_profit / total_revenue
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

### Repeat-customer rate

First count distinct selected orders per customer. A repeat customer has at least two distinct order
IDs within the selected period and filter context.

```text
repeat_customers = count(customer where distinct_selected_orders(customer) >= 2)
repeat_customer_rate = repeat_customers / unique_customers
```

If unique customers is zero, return `null` / `not_applicable`. This is an in-period repeat rate, not a
historical retention metric. Product filtering can change it by changing which orders are visible;
the UI must expose that filter context.

### Revenue growth

Calculate `total_revenue` for the current and full previous period under identical dimension filters,
then apply the growth formula above.

### Profit growth

Calculate `total_profit` for the current and full previous period under identical dimension filters,
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

Concentration is an exposure, not inherently a problem. Findings must use neutral language.

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
low_margin_threshold = min(10%, overall_profit_margin - 10 percentage points)

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

At minimum, compare total revenue, total profit, profit margin, total orders, average order value,
unique customers, and marketing ROI when each is computable.

Rate metrics use percentage-point difference as the primary change:

```text
margin_change_pp = (current_margin - previous_margin) × 100
```

They may also include relative change as secondary metadata when the previous rate is nonzero. UI
labels must distinguish `%` from percentage points (`pp`).

### Basic anomaly detection

Anomalies are detected on a complete daily revenue and gross-profit series for the selected context.
Missing dates within dataset coverage are filled with zero; dates outside coverage are not invented.
Require at least 14 daily observations.

For value `x_t` in a rolling trailing baseline of up to 28 prior days (minimum 7):

```text
median = median(baseline)
MAD = median(abs(x_i - median))
robust_z = 0.6745 * (x_t - median) / MAD
```

A point is a candidate when `abs(robust_z) >= 3.5` and its absolute change from the median is at least
20% of `max(abs(median), materiality_floor)`. If `MAD = 0`, use a deterministic fallback: candidate
only when the value differs from the median and the same 20% materiality rule is met. The floor starts
at the greater of 0.5% of period revenue per day or 50 currency units and must be currency-tuned.

Known incomplete current days must be excluded. Calendar/seasonal context is not inferred in the
basic method, so the result must be labeled “unusual versus recent daily baseline,” never “unexpected”
or causal. Later seasonal detection requires a new versioned method and sufficient history.

## Result contract

Every metric result must carry:

- stable metric ID and analytics-specification version;
- raw machine value (`number`, decimal representation, or `null`) and unit;
- status: `ok`, `not_applicable`, `insufficient_data`, or `invalid_input`;
- current period, comparison period if used, timezone, and currency;
- normalized active filters;
- accepted row count and distinct-order support;
- dataset and transformation version;
- warnings and assumptions relevant to interpretation.

Every finding/anomaly additionally carries:

- stable evidence ID and rule/method version;
- rule inputs, configured thresholds, observed values, and support counts;
- affected dimension identifiers;
- severity or priority derived deterministically;
- factual sentence template that avoids causal language.

Formatted strings are presentation outputs. They must not be parsed back into calculations.

## Rounding and display

- Keep internal precision through aggregation.
- Round currency for display using the currency's standard minor units, but expose full calculation
  precision to tests where the chosen numeric representation permits.
- Display percentages with one decimal place by default and provide accessible exact detail where
  decision-relevant.
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
- time-of-day, fiscal calendars, same-weekday comparison, and seasonality;
- statistical confidence, forecasts, experiments, and causal inference.

These limitations must be visible where they materially affect interpretation. They may not be filled
in by AI.
