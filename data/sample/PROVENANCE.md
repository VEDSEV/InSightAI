# Synthetic dataset provenance

## Declaration

`insightai-orders.csv` is entirely synthetic. It contains no real customers, people, addresses,
emails, phone numbers, companies, products, campaigns, transactions, or proprietary data. Synthetic
customer IDs are opaque labels generated only for repeat-order analysis.

## Generation record

- Dataset version: `insightai-synthetic-orders-v1`
- Generator version: `1.1.0`
- Source revision: `phase2-generator-v1.1`
- Fixed seed: `20260803`
- Release date: 2026-08-03
- Period: 2024-01-01 through 2025-12-31
- Currency: USD
- Timezone: `America/Chicago`
- Source inputs: repository-owned configuration, fictional product catalog, synthetic customer
  rules, and documented scenario multipliers only
- External or real-world source records: none

A runtime generation timestamp is intentionally omitted because it would make otherwise identical
artifact sets differ. The dataset version, generator version, source revision, fixed seed, and CSV
checksum provide the reproducible generation record.

## Method

The generator uses named deterministic pseudo-random streams for orders, customer profiles, and
customer assignment. Each customer is guaranteed one order, while a seeded Bernoulli draw using the
configured segment repeat propensity determines whether the customer receives a second order;
eligible customers may receive additional segment-weighted orders. No repeat-customer count is
targeted or hard-coded. Separate seeded rules make a small number of `customer_segment` values blank
at customer level and `campaign` values blank at order level.

It creates daily order shells, assigns order-level region/channel/campaign values, chooses unique
catalog products for each order, reconciles revenue and cost in integer cents, allocates an order's
marketing spend to exactly one line, and then assigns synthetic customers. Normal bounded variation
is combined with explicit scenario rules so trends are detectable without being perfectly smooth.

Generated records are validated before serialization. A separate verification script reparses the
CSV and independently recomputes identifiers, arithmetic, control totals, marketing allocation,
optional-field missingness, the distribution profile, scenario evidence, and checksum.

## Privacy and intended use

The data is safe for local demonstrations, deterministic analytics development, tests, screenshots,
and portfolio explanation. It is not evidence about any actual business and must never be described
as observed customer behavior or authoritative commercial performance.

## Limitations

The dataset excludes returns, refunds, cancellations, tax, shipping, platform fees, inventory,
multi-currency conversion, timestamps, customer demographics, and causal marketing attribution.
`customer_segment` is a generator propensity label, not a modeled persona or guarantee of observed
frequency. Optional blanks represent missing reporting context only. Marketing spend is an
analytical row allocation and not an ad-platform ledger. The profile describes this fixed fixture and
does not assert external industry benchmarks.
