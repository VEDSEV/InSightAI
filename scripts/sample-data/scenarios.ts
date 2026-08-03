import type { CampaignDefinition, ProductDefinition, Region, SalesChannel } from "./types.ts";

type WeightedDimension<T> = { readonly value: T; readonly weight: number };

const MONTH_DEMAND_FACTORS: Readonly<Record<number, number>> = {
  1: 0.82,
  2: 0.88,
  3: 0.96,
  4: 0.98,
  5: 1.02,
  6: 1.06,
  7: 1.04,
  8: 1.08,
  9: 1.03,
  10: 1.1,
  11: 1.38,
  12: 1.56,
};

export const REGIONS: readonly Region[] = ["Central", "East", "South", "West"];
export const SALES_CHANNELS: readonly SalesChannel[] = ["Marketplace", "Retail Pop-up", "Web"];

export const CAMPAIGNS: Readonly<Record<SalesChannel, readonly CampaignDefinition[]>> = {
  Web: [
    {
      name: "Organic Discovery",
      weight: 45,
      marketingRate: 0,
      discountRate: 0,
    },
    {
      name: "Email Retention",
      weight: 30,
      marketingRate: 0.025,
      discountRate: 0.04,
    },
    {
      name: "Paid Social",
      weight: 25,
      marketingRate: 0.14,
      discountRate: 0.02,
    },
  ],
  Marketplace: [
    {
      name: "Sponsored Listings",
      weight: 70,
      marketingRate: 0.18,
      discountRate: 0.03,
    },
    {
      name: "Marketplace Boost",
      weight: 30,
      marketingRate: 0.34,
      discountRate: 0.05,
    },
  ],
  "Retail Pop-up": [
    {
      name: "Local Event",
      weight: 60,
      marketingRate: 0.08,
      discountRate: 0.02,
    },
    {
      name: "Community Referral",
      weight: 40,
      marketingRate: 0.03,
      discountRate: 0,
    },
  ],
};

function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

export function dailyDemandFactor(date: string): number {
  const monthFactor = MONTH_DEMAND_FACTORS[monthOf(date)] ?? 1;
  const yearFactor = yearOf(date) === 2025 ? 1.07 : 1;
  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 1.08 : 0.98;

  if (date === "2024-11-29") {
    return monthFactor * yearFactor * weekendFactor * 4.2;
  }

  if (date === "2025-08-12") {
    return monthFactor * yearFactor * weekendFactor * 0.12;
  }

  return monthFactor * yearFactor * weekendFactor;
}

export function regionWeights(date: string): readonly WeightedDimension<Region>[] {
  if (date >= "2025-07-01") {
    return [
      { value: "West", weight: 42 },
      { value: "East", weight: 27 },
      { value: "Central", weight: 23 },
      { value: "South", weight: 8 },
    ];
  }

  return [
    { value: "West", weight: 34 },
    { value: "East", weight: 25 },
    { value: "Central", weight: 24 },
    { value: "South", weight: 17 },
  ];
}

export function channelWeights(date: string): readonly WeightedDimension<SalesChannel>[] {
  if (yearOf(date) === 2025) {
    return [
      { value: "Web", weight: 64 },
      { value: "Marketplace", weight: 25 },
      { value: "Retail Pop-up", weight: 11 },
    ];
  }

  return [
    { value: "Web", weight: 56 },
    { value: "Marketplace", weight: 28 },
    { value: "Retail Pop-up", weight: 16 },
  ];
}

export function isProductAvailable(product: ProductDefinition, date: string): boolean {
  return (
    (!product.availableFrom || date >= product.availableFrom) &&
    (!product.availableTo || date <= product.availableTo) &&
    (product.productId !== "PROD-GFT-002" || monthOf(date) >= 10)
  );
}

export function productDemandWeight(
  product: ProductDefinition,
  date: string,
  channel: SalesChannel,
  region: Region,
): number {
  if (!isProductAvailable(product, date)) {
    return 0;
  }

  const month = monthOf(date);
  let factor = 1;

  if (product.category === "Gifting") {
    factor *= month === 11 || month === 12 ? 3.2 : 0.75;
  } else if (product.category === "Outdoor") {
    factor *= month >= 5 && month <= 8 ? 1.75 : 0.65;
  } else if (product.category === "Wellness") {
    factor *= month === 1 || month === 2 ? 1.5 : 0.95;
  } else if (product.category === "Kitchen") {
    factor *= month === 11 || month === 12 ? 1.35 : 1;
  } else if (product.category === "Home") {
    factor *= month >= 10 ? 1.18 : 1;
  } else if (product.category === "Workspace") {
    factor *= month === 8 || month === 9 ? 1.4 : 1;
    if (date >= "2025-07-01") {
      const monthsIntoDecline = month - 7;
      factor *= Math.max(0.28, 0.7 - monthsIntoDecline * 0.08);
    }
  }

  if (channel === "Web" && product.productId === "PROD-HOM-001") {
    factor *= 1.16;
  }
  if (channel === "Marketplace" && product.category === "Kitchen") {
    factor *= 1.25;
  }
  if (channel === "Retail Pop-up" && product.category === "Gifting") {
    factor *= 1.35;
  }
  if (region === "West" && product.category === "Outdoor") {
    factor *= 1.18;
  }

  return product.baseWeight * factor;
}

export function lineDiscountRate(
  product: ProductDefinition,
  date: string,
  campaign: CampaignDefinition,
  discretionaryRate: number,
): number {
  if (product.productId === "PROD-GFT-001") {
    return 0.12;
  }

  let rate = campaign.discountRate + discretionaryRate;
  if (product.productId === "PROD-OUT-003" && date >= "2025-06-20" && date <= "2025-06-26") {
    return 0.25;
  }
  if (product.productId === "PROD-KIT-001") {
    rate = Math.min(0.1, rate);
  }

  return Math.min(0.25, rate);
}
