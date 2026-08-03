import type {
  DatasetControlTotals,
  GeneratorConfig,
  OrderLine,
  ScenarioManifest,
  ScenarioManifestEntry,
} from "./types.ts";

type ProductStats = {
  revenueCents: number;
  costCents: number;
  lineIds: string[];
};

function cents(value: number): number {
  return Math.round(value * 100);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function revenueFor(rows: readonly OrderLine[], predicate: (row: OrderLine) => boolean): number {
  return rows.reduce((sum, row) => sum + (predicate(row) ? cents(row.revenue) : 0), 0) / 100;
}

function averageDailyRevenue(
  rows: readonly OrderLine[],
  predicate: (row: OrderLine) => boolean,
): number {
  const dailyRevenue = new Map<string, number>();
  for (const row of rows) {
    if (predicate(row)) {
      dailyRevenue.set(
        row.order_date,
        (dailyRevenue.get(row.order_date) ?? 0) + cents(row.revenue),
      );
    }
  }
  const values = [...dailyRevenue.values()];
  return values.reduce((sum, value) => sum + value, 0) / values.length / 100;
}

function lineIds(
  rows: readonly OrderLine[],
  predicate: (row: OrderLine) => boolean,
  maximum = 8,
): readonly string[] {
  return rows
    .filter(predicate)
    .slice(0, maximum)
    .map((row) => row.order_line_id);
}

function productStats(rows: readonly OrderLine[]): ReadonlyMap<string, ProductStats> {
  const stats = new Map<string, ProductStats>();
  for (const row of rows) {
    const current = stats.get(row.product_id) ?? {
      revenueCents: 0,
      costCents: 0,
      lineIds: [],
    };
    current.revenueCents += cents(row.revenue);
    current.costCents += cents(row.cost);
    if (current.lineIds.length < 8) {
      current.lineIds.push(row.order_line_id);
    }
    stats.set(row.product_id, current);
  }
  return stats;
}

function marketingRoi(rows: readonly OrderLine[], channel: string): number {
  let revenueCents = 0;
  let costCents = 0;
  let spendCents = 0;
  for (const row of rows) {
    if (row.sales_channel === channel) {
      revenueCents += cents(row.revenue);
      costCents += cents(row.cost);
      spendCents += cents(row.marketing_spend);
    }
  }
  return round((revenueCents - costCents - spendCents) / spendCents);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function anomalyRatio(rows: readonly OrderLine[], targetDate: string): number {
  const daily = new Map<string, number>();
  for (const row of rows) {
    daily.set(row.order_date, (daily.get(row.order_date) ?? 0) + cents(row.revenue));
  }
  const dates = [...daily.keys()].sort();
  const targetIndex = dates.indexOf(targetDate);
  const baselineDates = dates.slice(Math.max(0, targetIndex - 28), targetIndex);
  const baseline = median(baselineDates.map((date) => daily.get(date) ?? 0));
  return round((daily.get(targetDate) ?? 0) / baseline);
}

export function buildScenarioManifest(
  rows: readonly OrderLine[],
  config: GeneratorConfig,
  controls: DatasetControlTotals,
): ScenarioManifest {
  const stats = productStats(rows);
  const hero = stats.get("PROD-HOM-001");
  const lowMargin = stats.get("PROD-KIT-001");
  const aggregateNegative = stats.get("PROD-GFT-001");
  const promotionalNegative = stats.get("PROD-OUT-003");
  if (!hero || !lowMargin || !aggregateNegative || !promotionalNegative) {
    throw new Error("Scenario products are missing from the generated dataset.");
  }

  const customerOrders = new Map<string, Set<string>>();
  for (const row of rows) {
    const orders = customerOrders.get(row.customer_id) ?? new Set<string>();
    orders.add(row.order_id);
    customerOrders.set(row.customer_id, orders);
  }
  const repeatCustomerIds = [...customerOrders.entries()]
    .filter(([, orders]) => orders.size >= 2)
    .map(([customerId]) => customerId)
    .slice(0, 8);

  const southPrevious = revenueFor(
    rows,
    (row) =>
      row.region === "South" && row.order_date >= "2024-07-01" && row.order_date <= "2024-12-31",
  );
  const southCurrent = revenueFor(
    rows,
    (row) =>
      row.region === "South" && row.order_date >= "2025-07-01" && row.order_date <= "2025-12-31",
  );
  const workspacePrevious = revenueFor(
    rows,
    (row) =>
      row.category === "Workspace" &&
      row.order_date >= "2024-07-01" &&
      row.order_date <= "2024-12-31",
  );
  const workspaceCurrent = revenueFor(
    rows,
    (row) =>
      row.category === "Workspace" &&
      row.order_date >= "2025-07-01" &&
      row.order_date <= "2025-12-31",
  );
  const holidayDaily = averageDailyRevenue(rows, (row) =>
    [11, 12].includes(Number(row.order_date.slice(5, 7))),
  );
  const winterDaily = averageDailyRevenue(rows, (row) =>
    [1, 2].includes(Number(row.order_date.slice(5, 7))),
  );
  const giftingHolidayDaily = averageDailyRevenue(
    rows,
    (row) => row.category === "Gifting" && [11, 12].includes(Number(row.order_date.slice(5, 7))),
  );
  const giftingWinterDaily = averageDailyRevenue(
    rows,
    (row) => row.category === "Gifting" && [1, 2].includes(Number(row.order_date.slice(5, 7))),
  );
  const negativeProductIds = [...stats.entries()]
    .filter(([, value]) => value.revenueCents - value.costCents < 0)
    .map(([productId]) => productId);
  const lowMarginRate = round(
    (lowMargin.revenueCents - lowMargin.costCents) / lowMargin.revenueCents,
  );
  const aggregateNegativeMargin = round(
    (aggregateNegative.revenueCents - aggregateNegative.costCents) / aggregateNegative.revenueCents,
  );
  const promotionalMargin = round(
    (promotionalNegative.revenueCents - promotionalNegative.costCents) /
      promotionalNegative.revenueCents,
  );
  const promotionalNegativeRows = rows.filter(
    (row) => row.product_id === "PROD-OUT-003" && cents(row.revenue) < cents(row.cost),
  );
  const promotionalNegativeRowsOutsideWindow = promotionalNegativeRows.filter(
    (row) => row.order_date < "2025-06-20" || row.order_date > "2025-06-26",
  );
  const lowMarginNegativeRows = rows.filter(
    (row) => row.product_id === "PROD-KIT-001" && cents(row.revenue) < cents(row.cost),
  );
  const duplicateSpendOrders = new Map<string, number>();
  for (const row of rows) {
    if (row.marketing_spend > 0) {
      duplicateSpendOrders.set(row.order_id, (duplicateSpendOrders.get(row.order_id) ?? 0) + 1);
    }
  }

  const scenarios: ScenarioManifestEntry[] = [
    {
      id: "seasonality",
      name: "Category-sensitive holiday seasonality",
      purpose:
        "Exercise daily and category trend comparisons without perfectly uniform seasonality.",
      affectedDateRanges: [
        { start: "2024-11-01", end: "2024-12-31" },
        { start: "2025-11-01", end: "2025-12-31" },
      ],
      affectedDimensions: { categories: ["Gifting", "Home", "Kitchen"] },
      expectedDirectionalResult:
        "Average daily holiday revenue exceeds January-February revenue, with a stronger multiplier in Gifting than in nonseasonal categories.",
      evidence: {
        orderLineIds: lineIds(
          rows,
          (row) =>
            row.category === "Gifting" && [11, 12].includes(Number(row.order_date.slice(5, 7))),
        ),
        observed: {
          holidayToWinterDailyRevenueRatio: round(holidayDaily / winterDaily),
          giftingHolidayToWinterDailyRevenueRatio: round(giftingHolidayDaily / giftingWinterDaily),
        },
      },
    },
    {
      id: "repeat-customers",
      name: "One-time and returning customer mix",
      purpose: "Support distinct-order repeat-customer behavior at order-line grain.",
      affectedDateRanges: [{ start: config.dateStart, end: config.dateEnd }],
      affectedDimensions: { customerSegments: ["Loyal", "Occasional", "New"] },
      expectedDirectionalResult:
        "Segment-specific fixed propensities produce both one-time and repeat customers without an exact half split; segment labels describe propensity, not observed order count.",
      evidence: {
        orderLineIds: lineIds(rows, (row) => repeatCustomerIds.includes(row.customer_id)),
        customerIds: repeatCustomerIds,
        observed: {
          repeatCustomerCount: controls.repeatCustomerCount,
          repeatCustomerRate: controls.repeatCustomerRate,
          oneTimeCustomerCount: controls.oneTimeCustomerCount,
          generationMechanism:
            "Seeded Bernoulli draw per customer using segment repeatProbability; eligible customers receive a second order and weighted subsequent orders.",
        },
      },
    },
    {
      id: "regional-variation",
      name: "Strong West and declining South",
      purpose: "Provide regional strength and underperformance cases for comparison logic.",
      affectedDateRanges: [
        { start: "2024-07-01", end: "2024-12-31" },
        { start: "2025-07-01", end: "2025-12-31" },
      ],
      affectedDimensions: { regions: ["West", "South"] },
      expectedDirectionalResult:
        "West leads full-period revenue while South declines in the second half of 2025 versus the same 2024 window.",
      evidence: {
        orderLineIds: [
          ...lineIds(rows, (row) => row.region === "West", 4),
          ...lineIds(rows, (row) => row.region === "South" && row.order_date >= "2025-07-01", 4),
        ],
        observed: {
          westRevenue: controls.revenueByRegion.West,
          southH2RevenueChange: round((southCurrent - southPrevious) / southPrevious),
        },
      },
    },
    {
      id: "channel-variation",
      name: "Channel growth and efficiency variation",
      purpose: "Support channel mix, growth, and contribution-after-spend comparisons.",
      affectedDateRanges: [{ start: config.dateStart, end: config.dateEnd }],
      affectedDimensions: {
        channels: ["Web", "Marketplace", "Retail Pop-up"],
      },
      expectedDirectionalResult:
        "Web has the largest revenue share and Marketplace produces the weakest contribution-after-spend ROI.",
      evidence: {
        orderLineIds: lineIds(rows, (row) => row.campaign === "Marketplace Boost"),
        observed: {
          webMarketingRoi: marketingRoi(rows, "Web"),
          marketplaceMarketingRoi: marketingRoi(rows, "Marketplace"),
          retailMarketingRoi: marketingRoi(rows, "Retail Pop-up"),
        },
      },
    },
    {
      id: "negative-margin",
      name: "Controlled promotional negative margins",
      purpose:
        "Exercise a full-period aggregate loss separately from occasional promotional row losses.",
      affectedDateRanges: [
        { start: "2024-03-01", end: "2025-03-31" },
        { start: "2025-06-20", end: "2025-06-26" },
      ],
      affectedDimensions: {
        products: ["PROD-GFT-001", "PROD-OUT-003"],
      },
      expectedDirectionalResult:
        "Discovery Gift Bundle is negative in aggregate, while normally profitable Enamel Camp Mug Set has negative rows only during its documented promotion.",
      evidence: {
        orderLineIds: [
          ...lineIds(rows, (row) => row.product_id === "PROD-GFT-001", 4),
          ...lineIds(rows, (row) => row.product_id === "PROD-OUT-003" && row.revenue < row.cost, 4),
        ],
        observed: {
          negativeMarginRowCount: controls.negativeMarginRowCount,
          negativeMarginProductCount: controls.negativeMarginProductCount,
          aggregateNegativeProductIds: negativeProductIds.join(","),
          aggregateNegativeProductId: "PROD-GFT-001",
          aggregateNegativeProductMargin: aggregateNegativeMargin,
          promotionalNegativeProductId: "PROD-OUT-003",
          promotionalNegativeRowCount: promotionalNegativeRows.length,
          promotionalNegativeRowsOutsideWindow: promotionalNegativeRowsOutsideWindow.length,
          promotionalProductFullPeriodMargin: promotionalMargin,
        },
      },
    },
    {
      id: "high-revenue-low-margin",
      name: "High-revenue low-margin cookware",
      purpose: "Support percentile-based revenue and weak-margin product rules.",
      affectedDateRanges: [{ start: config.dateStart, end: config.dateEnd }],
      affectedDimensions: { products: ["PROD-KIT-001"] },
      expectedDirectionalResult:
        "Essential Cookware Set ranks in the upper revenue quartile, has no negative rows, and retains a positive aggregate margin below 10%.",
      evidence: {
        orderLineIds: lowMargin.lineIds,
        observed: {
          productRevenue: lowMargin.revenueCents / 100,
          productMargin: lowMarginRate,
          negativeMarginRowCount: lowMarginNegativeRows.length,
        },
      },
    },
    {
      id: "concentration-risk",
      name: "Hero-product concentration",
      purpose: "Exercise product share and top-product concentration calculations.",
      affectedDateRanges: [{ start: config.dateStart, end: config.dateEnd }],
      affectedDimensions: { products: ["PROD-HOM-001"], categories: ["Home"] },
      expectedDirectionalResult:
        "Linen Throw Set contributes at least 30% of full-period revenue without dominating every order.",
      evidence: {
        orderLineIds: hero.lineIds,
        observed: {
          heroProductRevenue: hero.revenueCents / 100,
          heroProductRevenueShare: round(hero.revenueCents / (controls.totalRevenue * 100)),
        },
      },
    },
    {
      id: "declining-category",
      name: "Workspace category decline",
      purpose: "Provide a material category decline over comparable six-month windows.",
      affectedDateRanges: [
        { start: "2024-07-01", end: "2024-12-31" },
        { start: "2025-07-01", end: "2025-12-31" },
      ],
      affectedDimensions: { categories: ["Workspace"] },
      expectedDirectionalResult:
        "Workspace revenue declines by at least 20% in H2 2025 versus H2 2024.",
      evidence: {
        orderLineIds: lineIds(
          rows,
          (row) => row.category === "Workspace" && row.order_date >= "2025-07-01",
        ),
        observed: {
          workspaceH2RevenueChange: round(
            (workspaceCurrent - workspacePrevious) / workspacePrevious,
          ),
        },
      },
    },
    {
      id: "controlled-anomalies",
      name: "Traceable revenue spike and drop",
      purpose: "Provide deliberate daily anomalies for future robust-baseline tests.",
      affectedDateRanges: [
        { start: "2024-11-29", end: "2024-11-29" },
        { start: "2025-08-12", end: "2025-08-12" },
      ],
      affectedDimensions: { dates: ["2024-11-29", "2025-08-12"] },
      expectedDirectionalResult:
        "The November date spikes above its trailing baseline and the August date drops below its trailing baseline.",
      evidence: {
        orderLineIds: [
          ...lineIds(rows, (row) => row.order_date === "2024-11-29", 4),
          ...lineIds(rows, (row) => row.order_date === "2025-08-12", 4),
        ],
        observed: {
          spikeToTrailingMedianRatio: anomalyRatio(rows, "2024-11-29"),
          dropToTrailingMedianRatio: anomalyRatio(rows, "2025-08-12"),
        },
      },
    },
    {
      id: "marketing-spend-allocation",
      name: "Single-line order marketing allocation",
      purpose: "Prevent order-level marketing spend from being repeated on every line.",
      affectedDateRanges: [{ start: config.dateStart, end: config.dateEnd }],
      affectedDimensions: {
        campaigns: ["Marketplace Boost", "Paid Social", "Sponsored Listings"],
      },
      expectedDirectionalResult:
        "Each order has at most one positive marketing_spend row; zero-spend Organic Discovery orders remain valid.",
      evidence: {
        orderLineIds: lineIds(rows, (row) => row.marketing_spend > 0),
        observed: {
          ordersWithDuplicatedPositiveSpend: [...duplicateSpendOrders.values()].filter(
            (count) => count > 1,
          ).length,
          totalMarketingSpend: controls.totalMarketingSpend,
        },
      },
    },
  ];

  return {
    datasetVersion: config.datasetVersion,
    generatorVersion: config.generatorVersion,
    scenarios,
  };
}
