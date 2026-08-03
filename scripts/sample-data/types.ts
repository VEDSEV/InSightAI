export const CSV_COLUMNS = [
  "order_line_id",
  "order_id",
  "order_date",
  "customer_id",
  "customer_segment",
  "product_id",
  "product_name",
  "category",
  "region",
  "sales_channel",
  "quantity",
  "unit_price",
  "unit_cost",
  "discount_amount",
  "revenue",
  "cost",
  "campaign",
  "marketing_spend",
] as const;

export type CustomerSegment = "Loyal" | "Occasional" | "New";
export type Region = "Central" | "East" | "South" | "West";
export type SalesChannel = "Marketplace" | "Retail Pop-up" | "Web";

export type WeightedInteger = {
  readonly value: number;
  readonly weight: number;
};

export type GeneratorConfig = {
  readonly datasetVersion: string;
  readonly generatorVersion: string;
  readonly sourceRevision: string;
  readonly seed: number;
  readonly currency: "USD";
  readonly timezone: "America/Chicago";
  readonly dateStart: string;
  readonly dateEnd: string;
  readonly baseOrdersPerDay: number;
  readonly customerSegments: {
    readonly loyal: CustomerSegmentConfig;
    readonly occasional: CustomerSegmentConfig;
    readonly new: CustomerSegmentConfig;
  };
  readonly optionalMissingness: {
    readonly customerSegmentRate: number;
    readonly campaignOrderRate: number;
  };
  readonly lineCountWeights: readonly WeightedInteger[];
  readonly quantityWeights: readonly WeightedInteger[];
};

export type CustomerSegmentConfig = {
  readonly count: number;
  readonly repeatProbability: number;
  readonly repeatWeight: number;
};

export type ProductDefinition = {
  readonly productId: string;
  readonly productName: string;
  readonly category: string;
  readonly unitPriceCents: number;
  readonly unitCostCents: number;
  readonly baseWeight: number;
  readonly availableFrom?: string;
  readonly availableTo?: string;
};

export type CustomerProfile = {
  readonly customerId: string;
  readonly customerSegment: CustomerSegment;
  readonly reportedCustomerSegment: CustomerSegment | "";
  readonly repeatWeight: number;
  readonly repeatEligible: boolean;
};

export type CampaignDefinition = {
  readonly name: string;
  readonly weight: number;
  readonly marketingRate: number;
  readonly discountRate: number;
};

export type OrderLine = {
  readonly order_line_id: string;
  readonly order_id: string;
  readonly order_date: string;
  readonly customer_id: string;
  readonly customer_segment: CustomerSegment | "";
  readonly product_id: string;
  readonly product_name: string;
  readonly category: string;
  readonly region: Region;
  readonly sales_channel: SalesChannel;
  readonly quantity: number;
  readonly unit_price: number;
  readonly unit_cost: number;
  readonly discount_amount: number;
  readonly revenue: number;
  readonly cost: number;
  readonly campaign: string;
  readonly marketing_spend: number;
};

export type DatasetControlTotals = {
  readonly datasetVersion: string;
  readonly generatorVersion: string;
  readonly sourceRevision: string;
  readonly seed: number;
  readonly currency: string;
  readonly timezone: string;
  readonly dateRange: { readonly start: string; readonly end: string };
  readonly csvSha256: string;
  readonly rowCount: number;
  readonly distinctOrderCount: number;
  readonly multiLineOrderCount: number;
  readonly distinctCustomerCount: number;
  readonly totalQuantity: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalGrossProfit: number;
  readonly overallGrossMargin: number;
  readonly totalMarketingSpend: number;
  readonly totalDiscount: number;
  readonly negativeMarginRowCount: number;
  readonly negativeMarginProductCount: number;
  readonly productsWithAnyNegativeMarginRowCount: number;
  readonly repeatCustomerDefinition: string;
  readonly oneTimeCustomerCount: number;
  readonly repeatCustomerCount: number;
  readonly repeatCustomerRate: number;
  readonly missingOptionalFields: {
    readonly customerSegmentRowCount: number;
    readonly customerSegmentCustomerCount: number;
    readonly campaignRowCount: number;
    readonly campaignOrderCount: number;
  };
  readonly revenueByCategory: Readonly<Record<string, number>>;
  readonly revenueByRegion: Readonly<Record<string, number>>;
  readonly revenueByChannel: Readonly<Record<string, number>>;
};

export type ScenarioEvidence = {
  readonly orderLineIds: readonly string[];
  readonly customerIds?: readonly string[];
  readonly observed: Readonly<Record<string, number | string>>;
};

export type ScenarioManifestEntry = {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly affectedDateRanges: readonly {
    readonly start: string;
    readonly end: string;
  }[];
  readonly affectedDimensions: Readonly<Record<string, readonly string[]>>;
  readonly expectedDirectionalResult: string;
  readonly evidence: ScenarioEvidence;
};

export type ScenarioManifest = {
  readonly datasetVersion: string;
  readonly generatorVersion: string;
  readonly scenarios: readonly ScenarioManifestEntry[];
};

export type PercentileSummary = {
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
};

export type NumericDistribution = {
  readonly count: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly mean: number;
  readonly median: number;
  readonly percentiles: PercentileSummary;
};

export type DistributionProfile = {
  readonly datasetVersion: string;
  readonly generatorVersion: string;
  readonly sourceRevision: string;
  readonly seed: number;
  readonly csvSha256: string;
  readonly definitions: {
    readonly repeatCustomer: string;
    readonly percentileMethod: string;
    readonly shareBasis: string;
    readonly orderRevenue: string;
  };
  readonly orderLinesPerOrder: NumericDistribution;
  readonly quantityPerLine: NumericDistribution & {
    readonly frequency: Readonly<Record<string, number>>;
  };
  readonly ordersPerCustomer: NumericDistribution;
  readonly orderRevenue: NumericDistribution;
  readonly discounts: {
    readonly rowsWithDiscount: number;
    readonly rowRate: number;
    readonly totalDiscount: number;
  };
  readonly marketingSpend: {
    readonly rowsWithSpend: number;
    readonly rowRate: number;
    readonly ordersWithSpend: number;
    readonly orderRate: number;
    readonly totalSpend: number;
  };
  readonly revenueShares: {
    readonly product: Readonly<Record<string, number>>;
    readonly category: Readonly<Record<string, number>>;
    readonly region: Readonly<Record<string, number>>;
    readonly channel: Readonly<Record<string, number>>;
  };
  readonly optionalFieldMissingness: {
    readonly customerSegment: {
      readonly blankRows: number;
      readonly rowRate: number;
      readonly blankCustomers: number;
      readonly customerRate: number;
    };
    readonly campaign: {
      readonly blankRows: number;
      readonly rowRate: number;
      readonly blankOrders: number;
      readonly orderRate: number;
    };
  };
  readonly customerFrequency: {
    readonly oneTimeCustomerCount: number;
    readonly repeatCustomerCount: number;
    readonly repeatCustomerRate: number;
  };
};
