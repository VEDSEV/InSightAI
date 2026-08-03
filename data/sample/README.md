# Phase 2 synthetic order-line dataset

This directory contains the reproducible Phase 2 dataset. Every record is synthetic. No row
represents a real person, customer, order, product, campaign, or business.

## Grain and coverage

- **Grain:** one row per order line. Count orders with `COUNT(DISTINCT order_id)`, never row count.
- **Period:** 2024-01-01 through 2025-12-31, inclusive.
- **Calendar semantics:** calendar dates interpreted in `America/Chicago`; the CSV contains no
  time-of-day values.
- **Currency:** USD only; monetary fields use two decimal places.
- **Size:** 6,909 order lines, 4,310 distinct orders, and 1,200 opaque customer IDs.

## Files

| File                          | Purpose                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `insightai-orders.csv`        | Generated canonical order-line records.                                           |
| `generator-config.json`       | Fixed seed, versions, date range, customer mix, and order-shape configuration.    |
| `control-totals.json`         | Machine-readable reconciliation totals calculated during generation.              |
| `distribution-profile.json`   | Machine-readable distributions, shares, and optional-field missingness.           |
| `scenario-manifest.json`      | Machine-readable scenario definitions, observed direction, and evidence line IDs. |
| `insightai-orders.csv.sha256` | SHA-256 checksum for the exact CSV bytes.                                         |
| `DATA_DICTIONARY.md`          | Column definitions, ranges, derivations, examples, and cautions.                  |
| `SCENARIOS.md`                | Human-readable design and interpretation of the ten analytical scenarios.         |
| `CONTROL_TOTALS.md`           | Review-friendly control-total summary and independent-verification method.        |
| `DISTRIBUTION_PROFILE.md`     | Generated human-readable distribution and missingness profile.                    |
| `PROVENANCE.md`               | Synthetic-data provenance, privacy statement, versioning, and limitations.        |

## Generate and verify

Run from the repository root with the Node version recorded in `.nvmrc`:

```powershell
pnpm generate:sample-data
pnpm verify:sample-data
```

Generation uses integer cents internally and emits records in stable chronological order. The same
configuration and seed produce the same CSV bytes and SHA-256 checksum. The verification command has
its own CSV parser and aggregate implementation; it does not call the generator's control-total
function.

The repeat-customer outcome is generated, not targeted: each synthetic customer receives one order,
then a seeded Bernoulli draw uses that customer's configured segment propensity (`Loyal` 0.86,
`Occasional` 0.54, `New` 0.18). Customers whose draw succeeds receive a second order and may receive
additional orders through a segment-weighted deterministic draw. A repeat customer is any
`customer_id` with at least two distinct `order_id` values over the full dataset period; segment is
a propensity label, not an observed-frequency label.

`customer_segment` and `campaign` are explicitly optional. Deterministic configured missingness
creates a small set of blank values; every required analytical field remains complete. Future
ingestion should preserve these blanks as null/not reported, keep the row in totals, and group them
as an explicit `Unknown` or `Unattributed` member only when a dimension breakdown requires it. A
blank campaign does not mean zero marketing spend, and a blank customer segment does not change the
repeat-customer calculation.

The generated dataset remains separate from the Phase 1 UI preview. It is not imported by the
dashboard and does not become an authoritative analytics source until Phase 3 implements and tests
the deterministic analytics contract.
