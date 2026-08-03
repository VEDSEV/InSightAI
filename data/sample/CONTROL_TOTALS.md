# Phase 2 control totals

Control totals for `insightai-synthetic-orders-v1` are recorded in machine-readable form in
`control-totals.json`. Monetary amounts are USD.

| Control                               |                         Value |
| ------------------------------------- | ----------------------------: |
| Order lines                           |                         6,909 |
| Distinct orders                       |                         4,310 |
| Multi-line orders                     |                         1,939 |
| Distinct customers                    |                         1,200 |
| Date range                            | 2024-01-01 through 2025-12-31 |
| Total quantity                        |                         9,044 |
| Total revenue                         |                   $778,231.10 |
| Total cost                            |                   $460,417.00 |
| Total gross profit                    |                   $317,814.10 |
| Overall gross margin                  |                      40.8380% |
| Total marketing spend                 |                    $73,402.21 |
| Total discount                        |                    $25,222.90 |
| Negative-margin rows                  |                            52 |
| Aggregate negative-margin products    |                             1 |
| Products with any negative-margin row |                             2 |
| One-time customers                    |                           683 |
| Repeat customers                      |                           517 |
| Repeat-customer rate                  |                      43.0833% |
| Blank `customer_segment` rows         |                           298 |
| Customers with blank segment          |                            47 |
| Blank `campaign` rows                 |                           209 |
| Orders with blank campaign            |                           117 |

Repeat customer means an opaque `customer_id` has at least two distinct `order_id` values across the
full 2024-01-01 through 2025-12-31 period. It is not historical retention outside this dataset.
The count is the result of seeded per-customer propensity draws, not a configured target.

## Revenue reconciliation

| Category  |         Revenue | Region    |         Revenue | Channel       |         Revenue |
| --------- | --------------: | --------- | --------------: | ------------- | --------------: |
| Gifting   |      $25,932.18 | Central   |     $184,718.26 | Marketplace   |     $202,380.52 |
| Home      |     $290,171.66 | East      |     $193,222.10 | Retail Pop-up |      $96,154.48 |
| Kitchen   |     $232,535.10 | South     |     $117,000.82 | Web           |     $479,696.10 |
| Outdoor   |      $64,676.94 | West      |     $283,289.92 |               |                 |
| Wellness  |      $95,686.86 |           |                 |               |                 |
| Workspace |      $69,228.36 |           |                 |               |                 |
| **Total** | **$778,231.10** | **Total** | **$778,231.10** | **Total**     | **$778,231.10** |

## Independent verification

The generation path calculates controls from typed in-memory rows. `pnpm verify:sample-data` follows
a separate path: it parses the serialized CSV independently, performs cents-based reconciliation,
and compares each computed control to `control-totals.json`. It also independently calculates and
compares the full `distribution-profile.json`, including required-field completeness, optional-field
missingness, shares, percentiles, and one-time/repeat counts. Tests assert selected headline values,
distribution guardrails, and directional scenario thresholds independently of the generator's
output function.

CSV SHA-256:

```text
66f237491182dd1e8ae2c786543e98b3157f27658e7e5c11bfa8cec07de9c5e8
```
