export type PreviewTrend = "positive" | "negative" | "neutral";

export type PreviewKpi = {
  id: "revenue" | "gross-profit" | "gross-margin" | "orders";
  title: string;
  value: string;
  comparison: string;
  comparisonAccessibleLabel: string;
  trend: PreviewTrend;
  context: string;
  explanation: string;
  sparkline: readonly number[];
};

export const previewWorkspace = {
  label: "Sample workspace",
  dataLabel: "Demonstration data",
  periodLabel: "Illustrative 90-day view",
  generatedLabel: "Synthetic values for interface review only",
  kpis: [
    {
      id: "revenue",
      title: "Revenue",
      value: "$184.2K",
      comparison: "+12.4%",
      comparisonAccessibleLabel:
        "Demonstration revenue is 12.4 percent higher than the comparison period",
      trend: "positive",
      context: "vs. previous 90 days",
      explanation:
        "Preview of total revenue before validation and deterministic analytics are connected.",
      sparkline: [42, 47, 45, 52, 55, 53, 61, 63, 60, 67, 71, 74],
    },
    {
      id: "gross-profit",
      title: "Gross profit",
      value: "$62.7K",
      comparison: "+8.1%",
      comparisonAccessibleLabel:
        "Demonstration gross profit is 8.1 percent higher than the comparison period",
      trend: "positive",
      context: "revenue less product cost",
      explanation: "Preview of gross profit. Marketing, tax, shipping, and overhead are excluded.",
      sparkline: [32, 35, 36, 38, 41, 39, 43, 46, 44, 47, 49, 51],
    },
    {
      id: "gross-margin",
      title: "Gross margin",
      value: "34.0%",
      comparison: "−1.4 pp",
      comparisonAccessibleLabel:
        "Demonstration gross margin is 1.4 percentage points lower than the comparison period",
      trend: "negative",
      context: "vs. previous 90 days",
      explanation:
        "Preview of aggregate gross profit divided by revenue, not an average of row margins.",
      sparkline: [48, 47, 49, 46, 44, 45, 43, 42, 44, 41, 40, 39],
    },
    {
      id: "orders",
      title: "Orders",
      value: "1,486",
      comparison: "+9.6%",
      comparisonAccessibleLabel:
        "Demonstration order count is 9.6 percent higher than the comparison period",
      trend: "positive",
      context: "distinct order IDs",
      explanation: "Preview of distinct order count in the selected filter context.",
      sparkline: [31, 34, 33, 38, 39, 42, 41, 45, 47, 48, 52, 55],
    },
  ] satisfies readonly PreviewKpi[],
  revenueTrend: [
    { period: "Jan 06", value: 12.1 },
    { period: "Jan 13", value: 13.4 },
    { period: "Jan 20", value: 12.8 },
    { period: "Jan 27", value: 14.5 },
    { period: "Feb 03", value: 15.1 },
    { period: "Feb 10", value: 14.7 },
    { period: "Feb 17", value: 16.3 },
    { period: "Feb 24", value: 15.8 },
    { period: "Mar 03", value: 17.2 },
    { period: "Mar 10", value: 16.6 },
    { period: "Mar 17", value: 18.1 },
    { period: "Mar 24", value: 17.6 },
  ],
  categories: [
    { name: "Home & Living", revenue: "$52.4K", share: 100, change: "+14.2%" },
    { name: "Apparel", revenue: "$43.8K", share: 84, change: "+6.8%" },
    { name: "Beauty", revenue: "$36.1K", share: 69, change: "+11.3%" },
    { name: "Electronics", revenue: "$31.9K", share: 61, change: "−2.1%" },
    { name: "Accessories", revenue: "$20.0K", share: 38, change: "+4.7%" },
  ],
  marketing: [
    { channel: "Email", roi: "3.4×", score: 100, note: "Strongest preview return" },
    { channel: "Organic social", roi: "2.7×", score: 79, note: "Efficient reach" },
    { channel: "Paid search", roi: "1.9×", score: 56, note: "Stable contribution" },
    { channel: "Affiliates", roi: "1.3×", score: 38, note: "Review economics" },
  ],
  healthSignals: [
    {
      id: "margin-watch",
      tone: "warning",
      label: "Review",
      title: "Margin pressure pattern",
      description:
        "Illustrates how a lower-margin signal could be presented with period context and evidence.",
      evidence: "Demo evidence · Gross margin −1.4 pp",
    },
    {
      id: "category-opportunity",
      tone: "success",
      label: "Opportunity",
      title: "Home & Living momentum",
      description:
        "Shows the intended structure for a positive segment finding without claiming a real cause.",
      evidence: "Demo evidence · Revenue +14.2%",
    },
    {
      id: "region-attention",
      tone: "neutral",
      label: "Monitor",
      title: "West region variability",
      description:
        "Previews a neutral watch item that would require deterministic support before release.",
      evidence: "Demo evidence · Recent range widened",
    },
  ] as const,
  products: [
    {
      product: "Linen Throw Set",
      category: "Home & Living",
      revenue: "$18,420",
      margin: "41.2%",
      orders: "184",
      status: "Healthy",
    },
    {
      product: "Everyday Tote",
      category: "Accessories",
      revenue: "$15,860",
      margin: "36.8%",
      orders: "219",
      status: "Healthy",
    },
    {
      product: "Studio Headphones",
      category: "Electronics",
      revenue: "$14,210",
      margin: "18.4%",
      orders: "96",
      status: "Review",
    },
    {
      product: "Botanical Serum",
      category: "Beauty",
      revenue: "$12,740",
      margin: "38.6%",
      orders: "168",
      status: "Healthy",
    },
    {
      product: "Essential Hoodie",
      category: "Apparel",
      revenue: "$11,980",
      margin: "22.1%",
      orders: "143",
      status: "Monitor",
    },
  ],
} as const;
