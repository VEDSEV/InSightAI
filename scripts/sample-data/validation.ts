import { CATEGORIES, PRODUCT_CATALOG } from "./catalog.ts";
import { CAMPAIGNS, REGIONS, SALES_CHANNELS } from "./scenarios.ts";
import type { GeneratorConfig, OrderLine, ScenarioManifest } from "./types.ts";

const REQUIRED_SCENARIOS = new Set([
  "seasonality",
  "repeat-customers",
  "regional-variation",
  "channel-variation",
  "negative-margin",
  "high-revenue-low-margin",
  "concentration-risk",
  "declining-category",
  "controlled-anomalies",
  "marketing-spend-allocation",
]);

function cents(value: number): number {
  return Math.round(value * 100);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function validateGeneratedDataset(
  rows: readonly OrderLine[],
  config: GeneratorConfig,
  manifest?: ScenarioManifest,
): void {
  assert(rows.length >= 3_000, "Dataset must contain at least 3,000 rows.");
  assert(rows[0]?.order_date === config.dateStart, "Dataset start date is incorrect.");
  assert(rows.at(-1)?.order_date === config.dateEnd, "Dataset end date is incorrect.");

  const start = new Date(`${config.dateStart}T00:00:00.000Z`);
  const end = new Date(`${config.dateEnd}T00:00:00.000Z`);
  const coveredMonths =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth() +
    1;
  assert(coveredMonths >= 18, "Dataset must cover at least 18 calendar months.");

  const products = new Map(PRODUCT_CATALOG.map((product) => [product.productId, product]));
  const validCampaigns = new Set(
    Object.values(CAMPAIGNS).flatMap((campaigns) => campaigns.map((campaign) => campaign.name)),
  );
  const lineIds = new Set<string>();
  const orderState = new Map<
    string,
    {
      date: string;
      customerId: string;
      customerSegment: string;
      region: string;
      channel: string;
      campaign: string;
      lineCount: number;
      positiveSpendRows: number;
    }
  >();
  const customerOrders = new Map<string, Set<string>>();
  const customerSegments = new Map<string, string>();
  let priorDate = "";

  for (const row of rows) {
    const requiredTextValues = [
      row.order_line_id,
      row.order_id,
      row.order_date,
      row.customer_id,
      row.product_id,
      row.product_name,
      row.category,
      row.region,
      row.sales_channel,
    ];
    assert(
      requiredTextValues.every((value) => value.trim().length > 0),
      "A required analytical field is blank.",
    );
    assert(!lineIds.has(row.order_line_id), `Duplicate line ID: ${row.order_line_id}`);
    lineIds.add(row.order_line_id);
    assert(/^LINE-\d{7}$/.test(row.order_line_id), "Malformed order_line_id.");
    assert(/^ORD-\d{6}$/.test(row.order_id), "Malformed order_id.");
    assert(/^CUST-\d{4}$/.test(row.customer_id), "Malformed synthetic customer_id.");
    assert(
      row.order_date >= config.dateStart && row.order_date <= config.dateEnd,
      "Date outside configured range.",
    );
    assert(row.order_date >= priorDate, "Rows must remain in chronological order.");
    priorDate = row.order_date;
    assert(
      Number.isInteger(row.quantity) && row.quantity > 0,
      "Quantity must be a positive integer.",
    );
    assert(row.unit_price > 0 && row.unit_cost >= 0, "Unit monetary values are invalid.");
    assert(
      row.discount_amount >= 0 && row.marketing_spend >= 0,
      "Allocated values must be non-negative.",
    );
    assert(REGIONS.includes(row.region), `Unknown region: ${row.region}`);
    assert(SALES_CHANNELS.includes(row.sales_channel), `Unknown channel: ${row.sales_channel}`);
    assert(CATEGORIES.includes(row.category), `Unknown category: ${row.category}`);
    assert(
      row.campaign === "" || validCampaigns.has(row.campaign),
      `Unknown campaign: ${row.campaign}`,
    );
    assert(
      row.customer_segment === "" || ["Loyal", "Occasional", "New"].includes(row.customer_segment),
      `Unknown customer segment: ${row.customer_segment}`,
    );

    const product = products.get(row.product_id);
    assert(product, `Unknown product: ${row.product_id}`);
    assert(product.productName === row.product_name, "Product name does not match catalog.");
    assert(product.category === row.category, "Product category does not match catalog.");
    assert(cents(row.unit_price) === product.unitPriceCents, "Unit price does not match catalog.");
    assert(cents(row.unit_cost) === product.unitCostCents, "Unit cost does not match catalog.");
    assert(
      cents(row.revenue) === row.quantity * cents(row.unit_price) - cents(row.discount_amount),
      `Revenue does not reconcile on ${row.order_line_id}.`,
    );
    assert(
      cents(row.cost) === row.quantity * cents(row.unit_cost),
      `Cost does not reconcile on ${row.order_line_id}.`,
    );

    const existing = orderState.get(row.order_id);
    if (existing) {
      assert(existing.date === row.order_date, "Order date changed between lines.");
      assert(existing.customerId === row.customer_id, "Order customer changed between lines.");
      assert(
        existing.customerSegment === row.customer_segment,
        "Customer segment changed between lines.",
      );
      assert(existing.region === row.region, "Order region changed between lines.");
      assert(existing.channel === row.sales_channel, "Order channel changed between lines.");
      assert(existing.campaign === row.campaign, "Order campaign changed between lines.");
      existing.lineCount += 1;
      existing.positiveSpendRows += row.marketing_spend > 0 ? 1 : 0;
    } else {
      orderState.set(row.order_id, {
        date: row.order_date,
        customerId: row.customer_id,
        customerSegment: row.customer_segment,
        region: row.region,
        channel: row.sales_channel,
        campaign: row.campaign,
        lineCount: 1,
        positiveSpendRows: row.marketing_spend > 0 ? 1 : 0,
      });
    }

    const orders = customerOrders.get(row.customer_id) ?? new Set<string>();
    orders.add(row.order_id);
    customerOrders.set(row.customer_id, orders);
    const knownSegment = customerSegments.get(row.customer_id);
    assert(
      !knownSegment || knownSegment === row.customer_segment,
      "Customer segment changed across orders.",
    );
    customerSegments.set(row.customer_id, row.customer_segment);

    const text = `${row.customer_id} ${row.product_name} ${row.campaign}`;
    assert(!/@|https?:\/\//i.test(text), "Customer-data leakage pattern found.");
  }

  assert(
    [...orderState.values()].some((order) => order.lineCount > 1),
    "Dataset must contain repeated order IDs for multi-line orders.",
  );
  assert(
    [...orderState.values()].every((order) => order.positiveSpendRows <= 1),
    "Marketing spend was duplicated across order lines.",
  );
  const repeatCustomerCount = [...customerOrders.values()].filter(
    (orders) => orders.size >= 2,
  ).length;
  assert(repeatCustomerCount > 0, "Dataset must contain repeat customers.");
  assert(repeatCustomerCount < customerOrders.size, "Dataset must contain one-time customers.");
  assert(
    repeatCustomerCount * 2 !== customerOrders.size,
    "Repeat-customer output must not be an exact half split.",
  );
  assert(
    rows.some((row) => row.customer_segment === ""),
    "Configured optional customer-segment missingness was not observed.",
  );
  assert(
    rows.some((row) => row.campaign === ""),
    "Configured optional campaign missingness was not observed.",
  );

  const productRows = (productId: string) => rows.filter((row) => row.product_id === productId);
  const productProfit = (productId: string) =>
    productRows(productId).reduce((sum, row) => sum + cents(row.revenue) - cents(row.cost), 0);
  const aggregateNegative = productRows("PROD-GFT-001");
  const promotional = productRows("PROD-OUT-003");
  const highRevenueLowMargin = productRows("PROD-KIT-001");
  assert(aggregateNegative.length > 0, "Aggregate negative-margin case is missing.");
  assert(productProfit("PROD-GFT-001") < 0, "Aggregate negative-margin case is not negative.");
  assert(
    productProfit("PROD-OUT-003") > 0 &&
      promotional.some((row) => cents(row.revenue) - cents(row.cost) < 0) &&
      promotional.some((row) => cents(row.revenue) - cents(row.cost) > 0),
    "Promotional negative-margin case is not analytically distinct.",
  );
  assert(
    productProfit("PROD-KIT-001") > 0 &&
      highRevenueLowMargin.every((row) => cents(row.revenue) - cents(row.cost) > 0),
    "High-revenue low-margin case must remain positive.",
  );

  if (manifest) {
    const scenarioIds = new Set(manifest.scenarios.map((scenario) => scenario.id));
    assert(
      scenarioIds.size === REQUIRED_SCENARIOS.size &&
        [...REQUIRED_SCENARIOS].every((id) => scenarioIds.has(id)),
      "Scenario manifest does not contain the required scenario set.",
    );
    for (const scenario of manifest.scenarios) {
      assert(scenario.evidence.orderLineIds.length > 0, `${scenario.id} lacks evidence rows.`);
      assert(
        scenario.evidence.orderLineIds.every((lineId) => lineIds.has(lineId)),
        `${scenario.id} references an unknown evidence row.`,
      );
    }
  }
}
