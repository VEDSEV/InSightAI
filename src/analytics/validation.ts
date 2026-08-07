import { compareIsoDates, dateIsWithin, parseIsoDate } from "./dates.ts";
import { createAnalyticsError, partitionAnalyticsErrors } from "./errors.ts";
import { multiplyMoneyCents, parseMoneyCents, subtractMoneyCents } from "./money.ts";
import { normalizeRawOrderLines } from "./normalization.ts";
import { parseOrderLineCsv } from "./parsing.ts";
import type {
  AnalyticsError,
  AnalyticsResult,
  CanonicalOrderLine,
  DataQualityState,
  DatasetMetadata,
  DatasetValidationResult,
  MoneyCents,
  NormalizedOrderLine,
  ValidatedDataset,
  ValidationConfiguration,
} from "./types.ts";

type IngestCanonicalCsvInput = {
  readonly text: string;
  readonly metadata: DatasetMetadata;
  readonly validationConfig: ValidationConfiguration;
};

const REQUIRED_TEXT_FIELDS = [
  "orderLineId",
  "orderId",
  "orderDate",
  "customerId",
  "productId",
  "productName",
  "category",
  "region",
  "salesChannel",
] as const;

const MONEY_FIELDS = [
  ["unitPrice", "unitPriceCents"],
  ["unitCost", "unitCostCents"],
  ["discountAmount", "discountAmountCents"],
  ["revenue", "revenueCents"],
  ["cost", "costCents"],
  ["marketingSpend", "marketingSpendCents"],
] as const;

type ParsedMoneyFields = Record<(typeof MONEY_FIELDS)[number][1], MoneyCents>;

function withRow(error: AnalyticsError, row: NormalizedOrderLine): AnalyticsError {
  return Object.freeze({ ...error, rowNumber: row.sourceRowNumber });
}

function isAllowed(value: string, vocabulary: readonly string[]): boolean {
  return vocabulary.length === 0 || vocabulary.includes(value);
}

function validateVocabulary(
  value: string | null,
  allowed: readonly string[],
  field: string,
  row: NormalizedOrderLine,
  errors: AnalyticsError[],
): void {
  if (value !== null && !isAllowed(value, allowed)) {
    errors.push(
      createAnalyticsError({
        code: "invalid_category",
        stage: "row_validation",
        message: `${field} is not present in the configured dataset vocabulary.`,
        rowNumber: row.sourceRowNumber,
        field,
        value,
      }),
    );
  }
}

function validateId(
  value: string,
  pattern: RegExp,
  field: string,
  row: NormalizedOrderLine,
  errors: AnalyticsError[],
): void {
  const stablePattern = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
  if (!stablePattern.test(value)) {
    errors.push(
      createAnalyticsError({
        code: "invalid_id",
        stage: "row_validation",
        message: `${field} does not match the configured identifier policy.`,
        rowNumber: row.sourceRowNumber,
        field,
        value,
      }),
    );
  }
}

function validateNormalizedOrderLine(
  row: NormalizedOrderLine,
  config: ValidationConfiguration,
): AnalyticsResult<CanonicalOrderLine> {
  const errors: AnalyticsError[] = [];

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (row[field].length === 0) {
      errors.push(
        createAnalyticsError({
          code: "invalid_required_value",
          stage: "row_validation",
          message: `${field} is required.`,
          rowNumber: row.sourceRowNumber,
          field,
          value: row[field],
        }),
      );
    }
  }

  validateId(row.orderLineId, config.idPatterns.orderLineId, "orderLineId", row, errors);
  validateId(row.orderId, config.idPatterns.orderId, "orderId", row, errors);
  validateId(row.customerId, config.idPatterns.customerId, "customerId", row, errors);
  validateId(row.productId, config.idPatterns.productId, "productId", row, errors);

  validateVocabulary(row.category, config.vocabulary.categories, "category", row, errors);
  validateVocabulary(row.region, config.vocabulary.regions, "region", row, errors);
  validateVocabulary(
    row.salesChannel,
    config.vocabulary.salesChannels,
    "salesChannel",
    row,
    errors,
  );
  validateVocabulary(
    row.customerSegment,
    config.vocabulary.customerSegments,
    "customerSegment",
    row,
    errors,
  );
  validateVocabulary(row.campaign, config.vocabulary.campaigns, "campaign", row, errors);

  const parsedDate = parseIsoDate(row.orderDate, "orderDate");
  if (parsedDate.status === "error") {
    errors.push(...parsedDate.errors.map((error) => withRow(error, row)));
  }

  let quantity: number | null = null;
  if (!/^[1-9]\d*$/.test(row.quantity)) {
    errors.push(
      createAnalyticsError({
        code: "invalid_quantity",
        stage: "row_validation",
        message: "quantity must be a positive base-10 integer.",
        rowNumber: row.sourceRowNumber,
        field: "quantity",
        value: row.quantity,
      }),
    );
  } else {
    quantity = Number(row.quantity);
    if (!Number.isSafeInteger(quantity)) {
      errors.push(
        createAnalyticsError({
          code: "unsafe_integer",
          stage: "row_validation",
          message: "quantity exceeds the supported safe-integer range.",
          rowNumber: row.sourceRowNumber,
          field: "quantity",
          value: row.quantity,
        }),
      );
      quantity = null;
    }
  }

  const parsedMoney: Partial<ParsedMoneyFields> = {};
  for (const [sourceField, canonicalField] of MONEY_FIELDS) {
    const parsed = parseMoneyCents(row[sourceField], sourceField);
    if (parsed.status === "error") {
      errors.push(...parsed.errors.map((error) => withRow(error, row)));
    } else {
      parsedMoney[canonicalField] = parsed.value;
      if (parsed.value < 0) {
        errors.push(
          createAnalyticsError({
            code: "invalid_money",
            stage: "row_validation",
            message: `${sourceField} must be non-negative in a canonical source row.`,
            rowNumber: row.sourceRowNumber,
            field: sourceField,
            value: row[sourceField],
          }),
        );
      }
    }
  }

  if (
    quantity !== null &&
    parsedMoney.unitPriceCents !== undefined &&
    parsedMoney.discountAmountCents !== undefined &&
    parsedMoney.revenueCents !== undefined
  ) {
    try {
      const expectedRevenue = subtractMoneyCents(
        multiplyMoneyCents(parsedMoney.unitPriceCents, quantity),
        parsedMoney.discountAmountCents,
      );
      if (expectedRevenue !== parsedMoney.revenueCents || expectedRevenue < 0) {
        errors.push(
          createAnalyticsError({
            code: "arithmetic_mismatch",
            stage: "row_validation",
            message: "revenue must equal quantity × unit price − discount amount.",
            rowNumber: row.sourceRowNumber,
            field: "revenue",
            value: row.revenue,
          }),
        );
      }
    } catch (error) {
      errors.push(
        createAnalyticsError({
          code: "unsafe_integer",
          stage: "row_validation",
          message: error instanceof Error ? error.message : "Revenue arithmetic overflowed.",
          rowNumber: row.sourceRowNumber,
          field: "revenue",
          value: row.revenue,
        }),
      );
    }
  }

  if (
    quantity !== null &&
    parsedMoney.unitCostCents !== undefined &&
    parsedMoney.costCents !== undefined
  ) {
    try {
      const expectedCost = multiplyMoneyCents(parsedMoney.unitCostCents, quantity);
      if (expectedCost !== parsedMoney.costCents) {
        errors.push(
          createAnalyticsError({
            code: "arithmetic_mismatch",
            stage: "row_validation",
            message: "cost must equal quantity × unit cost.",
            rowNumber: row.sourceRowNumber,
            field: "cost",
            value: row.cost,
          }),
        );
      }
    } catch (error) {
      errors.push(
        createAnalyticsError({
          code: "unsafe_integer",
          stage: "row_validation",
          message: error instanceof Error ? error.message : "Cost arithmetic overflowed.",
          rowNumber: row.sourceRowNumber,
          field: "cost",
          value: row.cost,
        }),
      );
    }
  }

  if (
    errors.length > 0 ||
    parsedDate.status !== "ok" ||
    quantity === null ||
    MONEY_FIELDS.some(([, field]) => parsedMoney[field] === undefined)
  ) {
    return { status: "error", errors: Object.freeze(errors) };
  }

  const money = parsedMoney as ParsedMoneyFields;
  return {
    status: "ok",
    value: Object.freeze({
      sourceRowNumber: row.sourceRowNumber,
      orderLineId: row.orderLineId,
      orderId: row.orderId,
      orderDate: parsedDate.value,
      customerId: row.customerId,
      customerSegment: row.customerSegment,
      productId: row.productId,
      productName: row.productName,
      category: row.category,
      region: row.region,
      salesChannel: row.salesChannel,
      quantity,
      unitPriceCents: money.unitPriceCents,
      unitCostCents: money.unitCostCents,
      discountAmountCents: money.discountAmountCents,
      revenueCents: money.revenueCents,
      costCents: money.costCents,
      campaign: row.campaign,
      marketingSpendCents: money.marketingSpendCents,
    }),
    warnings: [],
  };
}

export function validateOrderLines(
  rows: readonly NormalizedOrderLine[],
  config: ValidationConfiguration,
): AnalyticsResult<readonly CanonicalOrderLine[]> {
  const canonical: CanonicalOrderLine[] = [];
  const errors: AnalyticsError[] = [];
  for (const row of rows) {
    const result = validateNormalizedOrderLine(row, config);
    if (result.status === "ok") {
      canonical.push(result.value);
    } else {
      errors.push(...result.errors);
    }
  }
  return errors.length > 0
    ? { status: "error", errors: Object.freeze(errors) }
    : { status: "ok", value: Object.freeze(canonical), warnings: [] };
}

function validCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

function invalidDatasetResult(
  inputRowCount: number,
  errors: readonly AnalyticsError[],
): DatasetValidationResult {
  const partitioned = partitionAnalyticsErrors(errors);
  const dataQuality: DataQualityState = Object.freeze({
    status: "invalid",
    inputRowCount,
    acceptedRowCount: 0,
    rejectedRowCount: inputRowCount,
    warningCount: partitioned.warnings.length,
    errors: partitioned.errors,
    warnings: partitioned.warnings,
  });
  return { status: "invalid", dataQuality, errors: Object.freeze(errors) };
}

export function validateDataset(
  rows: readonly CanonicalOrderLine[],
  metadata: DatasetMetadata,
  config: ValidationConfiguration,
): DatasetValidationResult {
  const errors: AnalyticsError[] = [];
  if (rows.length === 0) {
    errors.push(
      createAnalyticsError({
        code: "empty_dataset",
        stage: "dataset_validation",
        message: "A validated dataset must contain at least one order line.",
      }),
    );
  }

  for (const [field, value] of [
    ["datasetVersion", metadata.datasetVersion],
    ["transformationVersion", metadata.transformationVersion],
    ["analyticsSpecificationVersion", metadata.analyticsSpecificationVersion],
  ] as const) {
    if (value.trim().length === 0) {
      errors.push(
        createAnalyticsError({
          code: "invalid_required_value",
          stage: "dataset_validation",
          message: `${field} metadata is required.`,
          field,
          value,
        }),
      );
    }
  }
  if (
    metadata.revenueSemantics !== "net_after_line_discount" ||
    metadata.costSemantics !== "line_cost_of_goods" ||
    !["line_level", "single_line_order_allocation", "unavailable"].includes(
      metadata.marketingSpendSemantics,
    ) ||
    metadata.marketingSpendSemantics !== config.marketingSpendSemantics
  ) {
    errors.push(
      createAnalyticsError({
        code: "unsupported_semantics",
        stage: "dataset_validation",
        message:
          "Dataset revenue, cost, or marketing-spend semantics are unsupported or inconsistent.",
        field: "semantics",
      }),
    );
  }

  if (!validCurrency(metadata.currency) || metadata.currency !== config.currency) {
    errors.push(
      createAnalyticsError({
        code: "invalid_currency",
        stage: "dataset_validation",
        message: "Dataset currency must be one configured ISO 4217 code.",
        field: "currency",
        value: metadata.currency,
      }),
    );
  }
  if (!validTimeZone(metadata.timezone) || metadata.timezone !== config.timezone) {
    errors.push(
      createAnalyticsError({
        code: "invalid_timezone",
        stage: "dataset_validation",
        message: "Dataset timezone must be the configured IANA timezone.",
        field: "timezone",
        value: metadata.timezone,
      }),
    );
  }
  if (
    metadata.dateRange.start !== config.dateRange.start ||
    metadata.dateRange.end !== config.dateRange.end
  ) {
    errors.push(
      createAnalyticsError({
        code: "invalid_date_range",
        stage: "dataset_validation",
        message: "Dataset metadata date range does not match validation configuration.",
        field: "dateRange",
      }),
    );
  }

  const lineIds = new Set<string>();
  const orders = new Map<
    string,
    {
      readonly date: string;
      readonly customerId: string;
      readonly customerSegment: string | null;
      readonly region: string;
      readonly channel: string;
      readonly campaign: string | null;
      positiveSpendRows: number;
    }
  >();
  const products = new Map<string, { readonly name: string; readonly category: string }>();
  let actualStart = rows[0]?.orderDate;
  let actualEnd = rows[0]?.orderDate;

  for (const row of rows) {
    if (!dateIsWithin(row.orderDate, metadata.dateRange)) {
      errors.push(
        createAnalyticsError({
          code: "invalid_date_range",
          stage: "dataset_validation",
          message: "Order date falls outside the declared dataset date range.",
          rowNumber: row.sourceRowNumber,
          field: "orderDate",
          value: row.orderDate,
        }),
      );
    }
    if (actualStart === undefined || compareIsoDates(row.orderDate, actualStart) < 0) {
      actualStart = row.orderDate;
    }
    if (actualEnd === undefined || compareIsoDates(row.orderDate, actualEnd) > 0) {
      actualEnd = row.orderDate;
    }

    if (lineIds.has(row.orderLineId)) {
      errors.push(
        createAnalyticsError({
          code: "duplicate_order_line_id",
          stage: "dataset_validation",
          message: `Duplicate order-line ID: ${row.orderLineId}.`,
          rowNumber: row.sourceRowNumber,
          field: "orderLineId",
          value: row.orderLineId,
        }),
      );
    }
    lineIds.add(row.orderLineId);

    const existingOrder = orders.get(row.orderId);
    if (existingOrder) {
      const consistent =
        existingOrder.date === row.orderDate &&
        existingOrder.customerId === row.customerId &&
        existingOrder.customerSegment === row.customerSegment &&
        existingOrder.region === row.region &&
        existingOrder.channel === row.salesChannel &&
        existingOrder.campaign === row.campaign;
      if (!consistent) {
        errors.push(
          createAnalyticsError({
            code: "inconsistent_order",
            stage: "dataset_validation",
            message:
              "Order-level date, customer, region, channel, segment, or campaign changed across lines.",
            rowNumber: row.sourceRowNumber,
            field: "orderId",
            value: row.orderId,
          }),
        );
      }
      if (row.marketingSpendCents > 0) {
        existingOrder.positiveSpendRows += 1;
      }
    } else {
      orders.set(row.orderId, {
        date: row.orderDate,
        customerId: row.customerId,
        customerSegment: row.customerSegment,
        region: row.region,
        channel: row.salesChannel,
        campaign: row.campaign,
        positiveSpendRows: row.marketingSpendCents > 0 ? 1 : 0,
      });
    }

    const existingProduct = products.get(row.productId);
    if (
      existingProduct &&
      (existingProduct.name !== row.productName || existingProduct.category !== row.category)
    ) {
      errors.push(
        createAnalyticsError({
          code: "inconsistent_dimension",
          stage: "dataset_validation",
          message: "Product name/category mapping changed across rows.",
          rowNumber: row.sourceRowNumber,
          field: "productId",
          value: row.productId,
        }),
      );
    } else if (!existingProduct) {
      products.set(row.productId, { name: row.productName, category: row.category });
    }
  }

  if (
    rows.length > 0 &&
    (actualStart !== metadata.dateRange.start || actualEnd !== metadata.dateRange.end)
  ) {
    errors.push(
      createAnalyticsError({
        code: "invalid_date_range",
        stage: "dataset_validation",
        message: "Declared date range must equal the actual minimum and maximum order dates.",
        field: "dateRange",
        value: `${actualStart ?? "none"}/${actualEnd ?? "none"}`,
      }),
    );
  }

  if (
    metadata.marketingSpendSemantics === "single_line_order_allocation" &&
    [...orders.values()].some((order) => order.positiveSpendRows > 1)
  ) {
    errors.push(
      createAnalyticsError({
        code: "unsupported_semantics",
        stage: "dataset_validation",
        message: "Marketing spend appears on more than one line in an order.",
        field: "marketingSpendCents",
      }),
    );
  }

  if (errors.length > 0) {
    return invalidDatasetResult(rows.length, errors);
  }

  const dataQuality: DataQualityState = Object.freeze({
    status: "valid",
    inputRowCount: rows.length,
    acceptedRowCount: rows.length,
    rejectedRowCount: 0,
    warningCount: 0,
    errors: Object.freeze([]),
    warnings: Object.freeze([]),
  });
  const dataset = Object.freeze({
    rows: Object.freeze([...rows]),
    metadata: Object.freeze({
      ...metadata,
      dateRange: Object.freeze({ ...metadata.dateRange }),
    }),
    dataQuality,
  }) as ValidatedDataset;
  return { status: "valid", dataset };
}

export function ingestCanonicalCsv(input: IngestCanonicalCsvInput): DatasetValidationResult {
  const parsed = parseOrderLineCsv(input.text);
  if (parsed.status === "error") {
    return invalidDatasetResult(0, parsed.errors);
  }
  const normalized = normalizeRawOrderLines(parsed.value);
  const rowValidation = validateOrderLines(normalized, input.validationConfig);
  if (rowValidation.status === "error") {
    return invalidDatasetResult(normalized.length, rowValidation.errors);
  }
  return validateDataset(rowValidation.value, input.metadata, input.validationConfig);
}
