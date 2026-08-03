# Phase 2 scenario guide

The generator deliberately creates ten discoverable analytical scenarios. Exact affected ranges,
dimension values, observed results, and representative `order_line_id` evidence live in
`scenario-manifest.json`; tests verify that every referenced line exists.

| Scenario                        | Purpose and affected scope                                                                                                          | Expected direction                                                                                                          | Generated evidence                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Category-sensitive seasonality  | November-December 2024 and 2025; strongest in Gifting, with separate Outdoor and Wellness patterns.                                 | Holiday average daily revenue exceeds January-February, and Gifting changes more strongly than the overall business.        | Holiday/winter daily revenue ratio `1.797399`; Gifting ratio `4.728514`.                         |
| Repeat customers                | Full period; fixed segment populations with seeded repeat propensities of 0.86, 0.54, and 0.18.                                     | Propensity draws create both one-time and repeat customers without an exact half split; segment does not guarantee outcome. | 517 repeat and 683 one-time customers; repeat rate `0.430833`.                                   |
| Regional variation              | West across the full period; South comparison between H2 2024 and H2 2025.                                                          | West is the strongest region; South declines materially.                                                                    | West revenue `$283,289.92`; South H2 change `-49.7377%`.                                         |
| Channel variation               | Web, Marketplace, and Retail Pop-up across the full period.                                                                         | Web carries the largest revenue share; Marketplace has the weakest contribution-after-spend ROI.                            | Marketing ROI: Web `8.271844`, Marketplace `0.681167`, Retail `6.286331`.                        |
| Controlled negative margins     | Discovery Gift Bundle over its 2024-03-01 to 2025-03-31 availability and Enamel Camp Mug Set promotion on 2025-06-20 to 2025-06-26. | The bundle loses money in aggregate; the normally profitable mug set has occasional losses only in the promotion.           | 52 negative rows total; 5 promotional mug rows; 2 products with any loss row; 1 aggregate loser. |
| High-revenue low-margin product | Essential Cookware Set across the full period.                                                                                      | Product remains in the upper revenue tier with a positive margin below 10% and no negative rows.                            | Revenue `$179,286.80`; gross margin `7.4812%`; 0 negative rows.                                  |
| Concentration risk              | Linen Throw Set and Home category across the full period.                                                                           | A realistic hero product crosses the specification's 30% watch threshold.                                                   | Hero revenue `$250,622.24`; revenue share `32.2041%`.                                            |
| Declining category              | Workspace, H2 2025 versus H2 2024.                                                                                                  | Workspace declines by at least 20%.                                                                                         | Revenue change `-40.8041%`.                                                                      |
| Controlled anomalies            | Revenue spike on 2024-11-29 and drop on 2025-08-12.                                                                                 | Spike is above and drop is below the trailing 28-day median.                                                                | Ratios to trailing median: `4.171522` and `0.078234`.                                            |
| Marketing-spend allocation      | All non-organic orders and campaign/channel patterns.                                                                               | No order has positive marketing spend on more than one line; Marketplace Boost is intentionally inefficient.                | 0 orders with duplicated positive spend; total spend `$73,402.21`.                               |

These directions are dataset-fixture expectations, not dashboard outputs. Phase 3 may use them to
test deterministic calculations, but the UI must not hard-code these values.

## Margin-case distinctions

1. `PROD-GFT-001` is negative in aggregate over its documented availability window (margin
   `-6.5341%`).
2. `PROD-OUT-003` is normally profitable across the full period (margin `17.5397%`) but contains five
   negative rows, all within the documented seven-day 25% promotion.
3. `PROD-KIT-001` remains high revenue and low margin (`7.4812%`) while every individual row and the
   full-period aggregate remain positive.

The manifest records representative line IDs and observations for each case. The combined 52
negative rows are less than one percent of the dataset and do not make the overall fixture
unprofitable.
