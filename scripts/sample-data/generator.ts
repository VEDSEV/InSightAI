import { PRODUCT_CATALOG } from "./catalog.ts";
import { assignCustomersToOrders, createCustomerPopulation } from "./customers.ts";
import { DeterministicRandom, deriveSeed } from "./prng.ts";
import {
  CAMPAIGNS,
  channelWeights,
  dailyDemandFactor,
  lineDiscountRate,
  productDemandWeight,
  regionWeights,
} from "./scenarios.ts";
import type {
  CampaignDefinition,
  GeneratorConfig,
  OrderLine,
  ProductDefinition,
  Region,
  SalesChannel,
  WeightedInteger,
} from "./types.ts";

type DraftLine = {
  readonly product: ProductDefinition;
  readonly quantity: number;
  readonly discountAmountCents: number;
  readonly revenueCents: number;
  readonly costCents: number;
};

type DraftOrder = {
  readonly orderId: string;
  readonly orderDate: string;
  readonly region: Region;
  readonly salesChannel: SalesChannel;
  readonly campaign: CampaignDefinition;
  readonly reportedCampaign: string;
  readonly lines: readonly DraftLine[];
  readonly marketingSpendCents: number;
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function enumerateDates(start: string, end: string): readonly string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const finalDate = new Date(`${end}T00:00:00.000Z`);

  while (cursor <= finalDate) {
    dates.push(formatDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function chooseWeightedInteger(
  random: DeterministicRandom,
  weights: readonly WeightedInteger[],
): number {
  return random.weighted(weights, (entry) => entry.weight).value;
}

function chooseDiscretionaryDiscount(random: DeterministicRandom): number {
  if (random.next() >= 0.15) {
    return 0;
  }
  return random.next() < 0.72 ? 0.05 : 0.1;
}

function chooseProducts(
  lineCount: number,
  date: string,
  channel: SalesChannel,
  region: Region,
  random: DeterministicRandom,
): readonly ProductDefinition[] {
  const selected: ProductDefinition[] = [];

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const candidates = PRODUCT_CATALOG.filter(
      (product) =>
        !selected.includes(product) && productDemandWeight(product, date, channel, region) > 0,
    );
    selected.push(
      random.weighted(candidates, (product) => productDemandWeight(product, date, channel, region)),
    );
  }

  return selected;
}

function createDraftOrders(config: GeneratorConfig): readonly DraftOrder[] {
  const random = new DeterministicRandom(deriveSeed(config.seed, "orders"));
  const drafts: DraftOrder[] = [];
  let orderSequence = 1;

  for (const date of enumerateDates(config.dateStart, config.dateEnd)) {
    const naturalVariation = 0.82 + random.next() * 0.36;
    const orderCount = Math.max(
      1,
      Math.round(config.baseOrdersPerDay * dailyDemandFactor(date) * naturalVariation),
    );

    for (let dailyOrder = 0; dailyOrder < orderCount; dailyOrder += 1) {
      const region = random.weighted(regionWeights(date), (entry) => entry.weight).value;
      const salesChannel = random.weighted(channelWeights(date), (entry) => entry.weight).value;
      const campaign = random.weighted(CAMPAIGNS[salesChannel], (entry) => entry.weight);
      const lineCount = chooseWeightedInteger(random, config.lineCountWeights);
      const products = chooseProducts(lineCount, date, salesChannel, region, random);
      const lines = products.map((product) => {
        const quantity = chooseWeightedInteger(random, config.quantityWeights);
        const grossRevenueCents = product.unitPriceCents * quantity;
        const discountRate = lineDiscountRate(
          product,
          date,
          campaign,
          chooseDiscretionaryDiscount(random),
        );
        const discountAmountCents = Math.round(grossRevenueCents * discountRate);

        return {
          product,
          quantity,
          discountAmountCents,
          revenueCents: grossRevenueCents - discountAmountCents,
          costCents: product.unitCostCents * quantity,
        };
      });
      const orderRevenueCents = lines.reduce((sum, line) => sum + line.revenueCents, 0);
      const spendVariation = 0.92 + random.next() * 0.16;
      const marketingSpendCents = Math.round(
        orderRevenueCents * campaign.marketingRate * spendVariation,
      );

      drafts.push({
        orderId: `ORD-${orderSequence.toString().padStart(6, "0")}`,
        orderDate: date,
        region,
        salesChannel,
        campaign,
        reportedCampaign:
          random.next() < config.optionalMissingness.campaignOrderRate ? "" : campaign.name,
        lines,
        marketingSpendCents,
      });
      orderSequence += 1;
    }
  }

  return drafts;
}

function dollars(cents: number): number {
  return cents / 100;
}

export function generateDataset(config: GeneratorConfig): readonly OrderLine[] {
  const drafts = createDraftOrders(config);
  const profileRandom = new DeterministicRandom(deriveSeed(config.seed, "customer-profiles"));
  const assignmentRandom = new DeterministicRandom(deriveSeed(config.seed, "customer-assignments"));
  const customers = createCustomerPopulation(config, profileRandom);
  const customerAssignments = assignCustomersToOrders(drafts.length, customers, assignmentRandom);
  const rows: OrderLine[] = [];
  let lineSequence = 1;

  for (const [orderIndex, draft] of drafts.entries()) {
    const customer = customerAssignments[orderIndex];
    for (const [lineIndex, line] of draft.lines.entries()) {
      rows.push({
        order_line_id: `LINE-${lineSequence.toString().padStart(7, "0")}`,
        order_id: draft.orderId,
        order_date: draft.orderDate,
        customer_id: customer.customerId,
        customer_segment: customer.reportedCustomerSegment,
        product_id: line.product.productId,
        product_name: line.product.productName,
        category: line.product.category,
        region: draft.region,
        sales_channel: draft.salesChannel,
        quantity: line.quantity,
        unit_price: dollars(line.product.unitPriceCents),
        unit_cost: dollars(line.product.unitCostCents),
        discount_amount: dollars(line.discountAmountCents),
        revenue: dollars(line.revenueCents),
        cost: dollars(line.costCents),
        campaign: draft.reportedCampaign,
        marketing_spend: lineIndex === 0 ? dollars(draft.marketingSpendCents) : 0,
      });
      lineSequence += 1;
    }
  }

  return rows;
}
