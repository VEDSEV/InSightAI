// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ORDER_LINE_CSV_COLUMNS,
  dateInterval,
  ingestCanonicalCsv,
  isoDate,
  moneyCents,
  normalizeRawOrderLine,
  normalizeRawOrderLines,
  parseOrderLineCsv,
  validateDataset,
  validateOrderLines,
} from "@/analytics";

const GOLDEN_CSV = readFileSync(
  new URL("./fixtures/analytics/golden-order-lines.csv", import.meta.url),
  "utf8",
);
const CSV_HEADER = ORDER_LINE_CSV_COLUMNS.join(",");
const FIXTURE_DATE_RANGE = dateInterval(isoDate("2024-02-28"), isoDate("2024-05-01"));

const VALIDATION_CONFIG = {
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: FIXTURE_DATE_RANGE,
  vocabulary: {
    categories: ["Home", "Kitchen", "Outdoor", "Wellness"],
    regions: ["Central", "East", "South", "West"],
    salesChannels: ["Marketplace", "Retail Pop-up", "Web"],
    customerSegments: ["Loyal", "New", "Occasional"],
    campaigns: [
      "Email Retention",
      "Local Event",
      "Organic Discovery",
      "Paid Social",
      "Sponsored Listings",
    ],
  },
  idPatterns: {
    orderLineId: /^LINE-\d{7}$/,
    orderId: /^ORD-\d{6}$/,
    customerId: /^CUST-\d{4}$/,
    productId: /^PROD-[A-Z]{3}-\d{3}$/,
  },
  marketingSpendSemantics: "single_line_order_allocation" as const,
};

const DATASET_METADATA = {
  datasetVersion: "golden-order-lines-v1",
  transformationVersion: "golden-transform-v1",
  analyticsSpecificationVersion: "3.0.0",
  currency: "USD",
  timezone: "America/Chicago",
  dateRange: FIXTURE_DATE_RANGE,
  revenueSemantics: "net_after_line_discount" as const,
  costSemantics: "line_cost_of_goods" as const,
  marketingSpendSemantics: "single_line_order_allocation" as const,
};

const parsedGolden = parseOrderLineCsv(GOLDEN_CSV);
if (parsedGolden.status === "error") {
  throw new Error(parsedGolden.errors.map((error) => error.message).join("; "));
}
const GOLDEN_RAW_ROWS = parsedGolden.value;

function rawWith(overrides: Partial<(typeof GOLDEN_RAW_ROWS)[number]>) {
  return Object.freeze({ ...GOLDEN_RAW_ROWS[0], ...overrides });
}

function canonicalGoldenRows() {
  const validated = validateOrderLines(normalizeRawOrderLines(GOLDEN_RAW_ROWS), VALIDATION_CONFIG);
  if (validated.status === "error") {
    throw new Error(validated.errors.map((error) => error.message).join("; "));
  }
  return validated.value;
}

describe("canonical CSV parsing", () => {
  it("parses BOM, CRLF, quoted commas, and escaped quotes without changing field content", () => {
    const row = [
      "LINE-9000010",
      "ORD-900009",
      "2024-02-28",
      "CUST-9007",
      "Loyal",
      "PROD-HOM-902",
      '"Golden, Home ""Quoted"""',
      "Home",
      "West",
      "Web",
      "1",
      "10.00",
      "6.00",
      "0.00",
      "10.00",
      "6.00",
      "Organic Discovery",
      "0.00",
    ].join(",");

    const result = parseOrderLineCsv(`\uFEFF${CSV_HEADER}\r\n${row}\r\n`);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({
        sourceRowNumber: 2,
        product_name: 'Golden, Home "Quoted"',
      });
    }
  });

  it("reports missing, duplicate, and unexpected headers", () => {
    const missing = parseOrderLineCsv(
      `${ORDER_LINE_CSV_COLUMNS.filter((column) => column !== "campaign").join(",")}\n`,
    );
    expect(missing.status).toBe("error");
    if (missing.status === "error") {
      expect(missing.errors).toContainEqual(
        expect.objectContaining({ code: "missing_column", field: "campaign" }),
      );
    }

    const duplicate = parseOrderLineCsv(`${CSV_HEADER},campaign\n`);
    expect(duplicate.status).toBe("error");
    if (duplicate.status === "error") {
      expect(duplicate.errors).toContainEqual(
        expect.objectContaining({ code: "unexpected_column", field: "campaign" }),
      );
    }

    const unexpected = parseOrderLineCsv(`${CSV_HEADER},unexpected\n`);
    expect(unexpected.status).toBe("error");
    if (unexpected.status === "error") {
      expect(unexpected.errors).toContainEqual(
        expect.objectContaining({ code: "unexpected_column", field: "unexpected" }),
      );
    }
  });

  it("rejects malformed quoting and rows with the wrong field count", () => {
    const unterminated = parseOrderLineCsv(`${CSV_HEADER}\n"unterminated`);
    expect(unterminated.status).toBe("error");
    if (unterminated.status === "error") {
      expect(unterminated.errors.map((error) => error.code)).toContain("csv_syntax");
    }

    const shortRow = parseOrderLineCsv(`${CSV_HEADER}\nLINE-9000001,ORD-900001\n`);
    expect(shortRow.status).toBe("error");
    if (shortRow.status === "error") {
      expect(shortRow.errors.map((error) => error.code)).toContain("csv_syntax");
    }
  });
});

describe("row normalization and validation", () => {
  it("trims required values, maps optional blanks to null, and leaves raw input unchanged", () => {
    const raw = rawWith({
      order_id: "  ORD-900001  ",
      product_name: "  Golden Home A  ",
      customer_segment: "   ",
      campaign: " ",
    });

    const normalized = normalizeRawOrderLine(raw);
    expect(normalized).toMatchObject({
      orderId: "ORD-900001",
      productName: "Golden Home A",
      customerSegment: null,
      campaign: null,
    });
    expect(raw.order_id).toBe("  ORD-900001  ");
    expect(raw.customer_segment).toBe("   ");
  });

  it("accepts nullable optional dimensions while retaining a complete canonical row", () => {
    const result = validateOrderLines(
      normalizeRawOrderLines([rawWith({ customer_segment: "", campaign: "" })]),
      VALIDATION_CONFIG,
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.value[0]).toMatchObject({
        customerSegment: null,
        campaign: null,
        revenueCents: 1_800,
        costCents: 1_200,
      });
    }
  });

  it("rejects blank required values", () => {
    const result = validateOrderLines(
      normalizeRawOrderLines([rawWith({ product_name: "   " })]),
      VALIDATION_CONFIG,
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "invalid_required_value", field: "productName" }),
      );
    }
  });

  it.each([
    ["order_line_id", "bad-line", "orderLineId"],
    ["order_id", "bad-order", "orderId"],
    ["customer_id", "bad-customer", "customerId"],
    ["product_id", "bad-product", "productId"],
  ] as const)("enforces the configured %s identifier policy", (field, value, canonicalField) => {
    const result = validateOrderLines(
      normalizeRawOrderLines([rawWith({ [field]: value })]),
      VALIDATION_CONFIG,
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "invalid_id", field: canonicalField }),
      );
    }
  });

  it.each([
    ["category", "Unknown category", "category"],
    ["region", "Unknown region", "region"],
    ["sales_channel", "Unknown channel", "salesChannel"],
    ["customer_segment", "Unknown segment", "customerSegment"],
    ["campaign", "Unknown campaign", "campaign"],
  ] as const)("enforces the configured %s vocabulary", (field, value, canonicalField) => {
    const result = validateOrderLines(
      normalizeRawOrderLines([rawWith({ [field]: value })]),
      VALIDATION_CONFIG,
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: "invalid_category", field: canonicalField }),
      );
    }
  });

  it.each(["0", "-1", "1.5", "1e2"])("rejects invalid quantity %s", (quantity) => {
    const result = validateOrderLines(
      normalizeRawOrderLines([rawWith({ quantity })]),
      VALIDATION_CONFIG,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errors.map((error) => error.code)).toContain("invalid_quantity");
    }
  });

  it("rejects unsafe quantity, fractional-cent money, and negative canonical money", () => {
    const unsafeQuantity = validateOrderLines(
      normalizeRawOrderLines([rawWith({ quantity: "9007199254740992" })]),
      VALIDATION_CONFIG,
    );
    expect(unsafeQuantity.status).toBe("error");
    if (unsafeQuantity.status === "error") {
      expect(unsafeQuantity.errors.map((error) => error.code)).toContain("unsafe_integer");
    }

    for (const overrides of [{ unit_price: "10.001" }, { marketing_spend: "-1.00" }]) {
      const result = validateOrderLines(
        normalizeRawOrderLines([rawWith(overrides)]),
        VALIDATION_CONFIG,
      );
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.errors.map((error) => error.code)).toContain("invalid_money");
      }
    }
  });

  it("accepts normalized zero-, one-, and two-decimal money forms", () => {
    const result = validateOrderLines(
      normalizeRawOrderLines([
        rawWith({
          unit_price: "10",
          unit_cost: "6.0",
          discount_amount: "2.00",
          revenue: "18",
          cost: "12.0",
          marketing_spend: "3",
        }),
      ]),
      VALIDATION_CONFIG,
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.value[0]).toMatchObject({
        unitPriceCents: 1_000,
        unitCostCents: 600,
        revenueCents: 1_800,
      });
    }
  });

  it.each([
    ["revenue", "18.01"],
    ["cost", "12.01"],
  ] as const)("rejects a one-cent %s reconciliation error", (field, value) => {
    const result = validateOrderLines(
      normalizeRawOrderLines([rawWith({ [field]: value })]),
      VALIDATION_CONFIG,
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errors.map((error) => error.code)).toContain("arithmetic_mismatch");
    }
  });
});

describe("dataset-level validation", () => {
  it("ingests the golden fixture through the all-or-nothing validation boundary", () => {
    const result = ingestCanonicalCsv({
      text: GOLDEN_CSV,
      metadata: DATASET_METADATA,
      validationConfig: VALIDATION_CONFIG,
    });

    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.dataset.rows).toHaveLength(9);
      expect(result.dataset.dataQuality).toMatchObject({
        status: "valid",
        inputRowCount: 9,
        acceptedRowCount: 9,
        rejectedRowCount: 0,
      });
      expect(result.dataset.rows.filter((row) => row.customerSegment === null)).toHaveLength(2);
      expect(result.dataset.rows.filter((row) => row.campaign === null)).toHaveLength(2);
    }
  });

  it("rejects duplicate line IDs without returning a partially valid dataset", () => {
    const rows = canonicalGoldenRows();
    const duplicate = Object.freeze({
      ...rows[0],
      sourceRowNumber: 99,
      marketingSpendCents: moneyCents(0),
    });
    const result = validateDataset([...rows, duplicate], DATASET_METADATA, VALIDATION_CONFIG);

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors.map((error) => error.code)).toContain("duplicate_order_line_id");
      expect(result.dataQuality).toMatchObject({
        inputRowCount: 10,
        acceptedRowCount: 0,
        rejectedRowCount: 10,
      });
      expect(result).not.toHaveProperty("dataset");
    }
  });

  it("rejects inconsistent order-level and product-level dimensions", () => {
    const rows = canonicalGoldenRows();
    const inconsistentOrder = rows.map((row, index) =>
      index === 1 ? Object.freeze({ ...row, region: "East" }) : row,
    );
    const orderResult = validateDataset(inconsistentOrder, DATASET_METADATA, VALIDATION_CONFIG);
    expect(orderResult.status).toBe("invalid");
    if (orderResult.status === "invalid") {
      expect(orderResult.errors.map((error) => error.code)).toContain("inconsistent_order");
    }

    const inconsistentProduct = rows.map((row, index) =>
      index === 2 ? Object.freeze({ ...row, productName: "Changed product name" }) : row,
    );
    const productResult = validateDataset(inconsistentProduct, DATASET_METADATA, VALIDATION_CONFIG);
    expect(productResult.status).toBe("invalid");
    if (productResult.status === "invalid") {
      expect(productResult.errors.map((error) => error.code)).toContain("inconsistent_dimension");
    }
  });

  it.each([
    [{ currency: "EUR" }, "invalid_currency"],
    [{ timezone: "Mars/Olympus" }, "invalid_timezone"],
    [
      { dateRange: dateInterval(isoDate("2024-02-28"), isoDate("2024-04-30")) },
      "invalid_date_range",
    ],
  ] as const)("rejects invalid dataset metadata %#", (metadataPatch, expectedCode) => {
    const result = validateDataset(
      canonicalGoldenRows(),
      { ...DATASET_METADATA, ...metadataPatch },
      VALIDATION_CONFIG,
    );

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors.map((error) => error.code)).toContain(expectedCode);
    }
  });

  it("enforces declared single-line order marketing allocation", () => {
    const rows = canonicalGoldenRows().map((row, index) =>
      index === 1 ? Object.freeze({ ...row, marketingSpendCents: moneyCents(1) }) : row,
    );
    const result = validateDataset(rows, DATASET_METADATA, VALIDATION_CONFIG);

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors.map((error) => error.code)).toContain("unsupported_semantics");
    }
  });

  it("rejects a header-only empty source with no synthetic accepted rows", () => {
    const result = ingestCanonicalCsv({
      text: `${CSV_HEADER}\n`,
      metadata: DATASET_METADATA,
      validationConfig: VALIDATION_CONFIG,
    });

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors.map((error) => error.code)).toContain("empty_dataset");
      expect(result.dataQuality).toMatchObject({
        inputRowCount: 0,
        acceptedRowCount: 0,
        rejectedRowCount: 0,
      });
      expect(result).not.toHaveProperty("dataset");
    }
  });

  it("rejects the entire source when one row fails validation", () => {
    const invalidCsv = GOLDEN_CSV.replace(",18.00,12.00,", ",18.01,12.00,");
    expect(invalidCsv).not.toBe(GOLDEN_CSV);

    const result = ingestCanonicalCsv({
      text: invalidCsv,
      metadata: DATASET_METADATA,
      validationConfig: VALIDATION_CONFIG,
    });

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.errors.map((error) => error.code)).toContain("arithmetic_mismatch");
      expect(result.dataQuality).toMatchObject({
        inputRowCount: 9,
        acceptedRowCount: 0,
        rejectedRowCount: 9,
      });
      expect(result).not.toHaveProperty("dataset");
    }
  });
});
