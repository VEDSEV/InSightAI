# Distribution profile

This report is generated from the canonical Phase 2 CSV. The machine-readable companion is `distribution-profile.json`.

- Dataset version: `insightai-synthetic-orders-v1`
- Generator version: `1.1.0`
- Seed: `20260803`
- CSV SHA-256: `66f237491182dd1e8ae2c786543e98b3157f27658e7e5c11bfa8cec07de9c5e8`

## Distribution summary

| Measure | Minimum | Maximum | Mean | Median | P25 | P75 | P90 | P95 | P99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Order lines per order | 1 | 4 | 1.603016 | 1 | 1 | 2 | 3 | 3 | 4 |
| Quantity per line | 1 | 3 | 1.309017 | 1 | 1 | 2 | 2 | 2 | 3 |
| Orders per customer | 1 | 23 | 3.591667 | 1 | 1 | 5 | 10 | 12 | 15 |
| Order revenue (USD) | 30.6 | 992 | 180.56406 | 147 | 85.36 | 235.5 | 360.244 | 434.129 | 652.256 |

Percentiles use linear interpolation between adjacent sorted observations at index (n - 1) * p.

## Quantity frequency

| Quantity | Rows | Share |
| ---: | ---: | ---: |
| 1 | 5,118 | 74.08% |
| 2 | 1,447 | 20.94% |
| 3 | 344 | 4.98% |

## Customer frequency

- One-time customers: 683
- Repeat customers: 517 (43.08%)
- Definition: Customer has at least two distinct order_id values across the full dataset period.

## Discounts and marketing spend

| Measure | Rows | Orders | Rate | Total |
| --- | ---: | ---: | ---: | ---: |
| Positive discount | 5,031 | not applicable | 72.82% of rows | $25,222.90 |
| Positive marketing spend | 3,117 | 3,117 | 72.32% of orders | $73,402.21 |

## Optional-field missingness

| Optional field | Blank rows | Row rate | Affected entity | Entity rate |
| --- | ---: | ---: | ---: | ---: |
| customer_segment | 298 | 4.31% | 47 customers | 3.92% |
| campaign | 209 | 3.02% | 117 orders | 2.71% |

Blank optional values mean "not reported / unattributed," not zero. Required analytical fields remain complete.

## Net-revenue shares

Shares use full-period net revenue after discounts.

### Product

| Product ID | Share |
| --- | ---: |
| PROD-HOM-001 | 32.20% |
| PROD-KIT-001 | 23.04% |
| PROD-WEL-001 | 6.07% |
| PROD-WOR-001 | 4.38% |
| PROD-OUT-001 | 3.93% |
| PROD-KIT-002 | 3.63% |
| PROD-WEL-003 | 3.58% |
| PROD-KIT-003 | 3.22% |
| PROD-GFT-002 | 3.00% |
| PROD-HOM-002 | 2.95% |
| PROD-WOR-003 | 2.71% |
| PROD-WEL-002 | 2.64% |
| PROD-OUT-002 | 2.50% |
| PROD-HOM-003 | 2.13% |
| PROD-OUT-003 | 1.88% |
| PROD-WOR-002 | 1.81% |
| PROD-GFT-001 | 0.33% |

### Category

| Category | Share |
| --- | ---: |
| Home | 37.29% |
| Kitchen | 29.88% |
| Wellness | 12.30% |
| Workspace | 8.90% |
| Outdoor | 8.31% |
| Gifting | 3.33% |

### Region

| Region | Share |
| --- | ---: |
| West | 36.40% |
| East | 24.83% |
| Central | 23.74% |
| South | 15.03% |

### Channel

| Channel | Share |
| --- | ---: |
| Web | 61.64% |
| Marketplace | 26.01% |
| Retail Pop-up | 12.36% |
