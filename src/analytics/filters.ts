import { MISSING_DIMENSION_KEY } from "./configuration.ts";
import { compareIsoDates, intervalContains } from "./dates.ts";
import { createAnalyticsError } from "./errors.ts";
import type {
  AnalyticsError,
  AnalyticsResult,
  CanonicalOrderLine,
  CustomerType,
  CustomerTypeFilter,
  CustomerTypeScope,
  DateInterval,
  FilterContext,
  ValidatedDataset,
} from "./types.ts";

export type FilterContextInput = {
  readonly period: DateInterval;
  readonly timezone?: string;
  readonly productIds?: readonly string[];
  readonly categories?: readonly string[];
  readonly regions?: readonly string[];
  readonly salesChannels?: readonly string[];
  readonly customerSegments?: readonly string[];
  readonly campaigns?: readonly string[];
  readonly customerTypes?: {
    readonly scope: CustomerTypeScope;
    readonly values: readonly CustomerType[];
  } | null;
};

export type FilteredRows = {
  readonly rows: readonly CanonicalOrderLine[];
  readonly filterContext: FilterContext;
};

export type FilterVocabulary = {
  readonly productIds: ReadonlySet<string>;
  readonly categories: ReadonlySet<string>;
  readonly regions: ReadonlySet<string>;
  readonly salesChannels: ReadonlySet<string>;
  readonly customerSegments: ReadonlySet<string>;
  readonly campaigns: ReadonlySet<string>;
};

/**
 * Dataset-lifetime filter metadata. The contained sets are internal read-only indexes and are never
 * exposed from the supported analytics barrel.
 */
export type FilterDatasetIndex = {
  readonly vocabulary: FilterVocabulary;
  readonly reservedMissingKeyCollision: boolean;
};

export function codePointCompare(left: string, right: string): -1 | 0 | 1 {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftCodePoint = left.codePointAt(leftIndex) ?? 0;
    const rightCodePoint = right.codePointAt(rightIndex) ?? 0;
    if (leftCodePoint < rightCodePoint) {
      return -1;
    }
    if (leftCodePoint > rightCodePoint) {
      return 1;
    }
    leftIndex += leftCodePoint > 0xffff ? 2 : 1;
    rightIndex += rightCodePoint > 0xffff ? 2 : 1;
  }
  if (leftIndex < left.length) {
    return 1;
  }
  if (rightIndex < right.length) {
    return -1;
  }
  return 0;
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value === "UTC" || value.includes("/");
  } catch {
    return false;
  }
}

function vocabularyFor(dataset: ValidatedDataset, missingKey: string): FilterVocabulary {
  const productIds = new Set<string>();
  const categories = new Set<string>();
  const regions = new Set<string>();
  const salesChannels = new Set<string>();
  const customerSegments = new Set<string>([missingKey]);
  const campaigns = new Set<string>([missingKey]);

  for (const row of dataset.rows) {
    productIds.add(row.productId);
    categories.add(row.category);
    regions.add(row.region);
    salesChannels.add(row.salesChannel);
    if (row.customerSegment !== null) {
      customerSegments.add(row.customerSegment);
    }
    if (row.campaign !== null) {
      campaigns.add(row.campaign);
    }
  }

  return { productIds, categories, regions, salesChannels, customerSegments, campaigns };
}

function normalizeSelection(
  input: readonly string[] | undefined,
  field: string,
  vocabulary: ReadonlySet<string>,
  errors: AnalyticsError[],
): readonly string[] {
  const normalized = new Set<string>();
  for (const rawValue of input ?? []) {
    const value = rawValue.trim();
    if (value.length === 0) {
      errors.push(
        createAnalyticsError({
          code: "invalid_filter",
          stage: "filtering",
          message: `${field} selections must not contain blank values.`,
          field,
          value: rawValue,
        }),
      );
      continue;
    }
    if (!vocabulary.has(value)) {
      errors.push(
        createAnalyticsError({
          code: "invalid_filter",
          stage: "filtering",
          message: `${field} selection is not present in the validated dataset vocabulary.`,
          field,
          value,
        }),
      );
      continue;
    }
    normalized.add(value);
  }
  return Object.freeze([...normalized].sort(codePointCompare));
}

function normalizeCustomerTypes(
  input: FilterContextInput["customerTypes"],
  errors: AnalyticsError[],
): CustomerTypeFilter | null {
  if (input === undefined || input === null) {
    return null;
  }
  if (input.scope !== "within_selection" && input.scope !== "full_dataset") {
    errors.push(
      createAnalyticsError({
        code: "invalid_filter",
        stage: "filtering",
        message: "Customer-type scope must be within_selection or full_dataset.",
        field: "customerTypes.scope",
        value: String(input.scope),
      }),
    );
  }

  const values = new Set<CustomerType>();
  for (const value of input.values) {
    if (value !== "one_time" && value !== "repeat") {
      errors.push(
        createAnalyticsError({
          code: "invalid_filter",
          stage: "filtering",
          message: "Customer type must be one_time or repeat.",
          field: "customerTypes.values",
          value: String(value),
        }),
      );
    } else {
      values.add(value);
    }
  }

  return Object.freeze({
    scope: input.scope,
    values: Object.freeze([...values].sort(codePointCompare)),
  });
}

function reservedKeyCollision(dataset: ValidatedDataset, missingKey: string): boolean {
  return dataset.rows.some(
    (row) => row.customerSegment === missingKey || row.campaign === missingKey,
  );
}

export function createFilterDatasetIndex(
  dataset: ValidatedDataset,
  missingKey = MISSING_DIMENSION_KEY,
): FilterDatasetIndex {
  return Object.freeze({
    vocabulary: Object.freeze(vocabularyFor(dataset, missingKey)),
    reservedMissingKeyCollision: reservedKeyCollision(dataset, missingKey),
  });
}

export function createFilterContextWithIndex(
  input: FilterContextInput,
  dataset: ValidatedDataset,
  missingKey: string,
  index: FilterDatasetIndex,
): AnalyticsResult<FilterContext> {
  const errors: AnalyticsError[] = [];
  if (compareIsoDates(input.period.start, input.period.end) > 0) {
    errors.push(
      createAnalyticsError({
        code: "invalid_filter",
        stage: "filtering",
        message: "Filter period start must not be after its end.",
        field: "period",
        value: `${input.period.start}/${input.period.end}`,
      }),
    );
  } else if (!intervalContains(dataset.metadata.dateRange, input.period)) {
    errors.push(
      createAnalyticsError({
        code: "invalid_filter",
        stage: "filtering",
        message: "Filter period must be contained by the validated dataset date range.",
        field: "period",
        value: `${input.period.start}/${input.period.end}`,
      }),
    );
  }

  const timezone = input.timezone ?? dataset.metadata.timezone;
  if (!validTimeZone(timezone) || timezone !== dataset.metadata.timezone) {
    errors.push(
      createAnalyticsError({
        code: "invalid_filter",
        stage: "filtering",
        message: "Filter timezone must match the validated dataset IANA timezone.",
        field: "timezone",
        value: timezone,
      }),
    );
  }

  if (missingKey.length === 0 || index.reservedMissingKeyCollision) {
    errors.push(
      createAnalyticsError({
        code: "invalid_filter",
        stage: "filtering",
        message: "The missing-dimension key is blank or collides with a reported source value.",
        field: "missingDimensionKey",
        value: missingKey,
      }),
    );
  }

  const vocabulary = index.vocabulary;
  const productIds = normalizeSelection(
    input.productIds,
    "productIds",
    vocabulary.productIds,
    errors,
  );
  const categories = normalizeSelection(
    input.categories,
    "categories",
    vocabulary.categories,
    errors,
  );
  const regions = normalizeSelection(input.regions, "regions", vocabulary.regions, errors);
  const salesChannels = normalizeSelection(
    input.salesChannels,
    "salesChannels",
    vocabulary.salesChannels,
    errors,
  );
  const customerSegments = normalizeSelection(
    input.customerSegments,
    "customerSegments",
    vocabulary.customerSegments,
    errors,
  );
  const campaigns = normalizeSelection(input.campaigns, "campaigns", vocabulary.campaigns, errors);
  const customerTypes = normalizeCustomerTypes(input.customerTypes, errors);

  if (errors.length > 0) {
    return { status: "error", errors: Object.freeze(errors) };
  }

  return {
    status: "ok",
    value: Object.freeze({
      period: Object.freeze({ ...input.period }),
      timezone,
      productIds,
      categories,
      regions,
      salesChannels,
      customerSegments,
      campaigns,
      customerTypes,
    }),
    warnings: [],
  };
}

export function createFilterContext(
  input: FilterContextInput,
  dataset: ValidatedDataset,
  missingKey = MISSING_DIMENSION_KEY,
): AnalyticsResult<FilterContext> {
  return createFilterContextWithIndex(
    input,
    dataset,
    missingKey,
    createFilterDatasetIndex(dataset, missingKey),
  );
}

function selected(selection: readonly string[], value: string): boolean {
  return selection.length === 0 || selection.includes(value);
}

export function matchesFilterContextWithoutCustomerType(
  row: CanonicalOrderLine,
  context: FilterContext,
  missingKey: string,
): boolean {
  return (
    row.orderDate >= context.period.start &&
    row.orderDate <= context.period.end &&
    selected(context.productIds, row.productId) &&
    selected(context.categories, row.category) &&
    selected(context.regions, row.region) &&
    selected(context.salesChannels, row.salesChannel) &&
    selected(context.customerSegments, row.customerSegment ?? missingKey) &&
    selected(context.campaigns, row.campaign ?? missingKey)
  );
}

export function classifyCustomersByOrderHistory(
  rows: readonly CanonicalOrderLine[],
): ReadonlyMap<string, CustomerType> {
  const ordersByCustomer = new Map<string, Set<string>>();
  for (const row of rows) {
    const orders = ordersByCustomer.get(row.customerId) ?? new Set<string>();
    orders.add(row.orderId);
    ordersByCustomer.set(row.customerId, orders);
  }

  return new Map(
    [...ordersByCustomer].map(([customerId, orders]) => [
      customerId,
      orders.size >= 2 ? "repeat" : "one_time",
    ]),
  );
}

export function applyFilterContext(
  dataset: ValidatedDataset,
  context: FilterContext,
  missingKey = MISSING_DIMENSION_KEY,
): readonly CanonicalOrderLine[] {
  const baseRows = dataset.rows.filter((row) =>
    matchesFilterContextWithoutCustomerType(row, context, missingKey),
  );
  const typeFilter = context.customerTypes;
  if (typeFilter === null || typeFilter.values.length === 0) {
    return Object.freeze(baseRows);
  }

  const classifications = classifyCustomersByOrderHistory(
    typeFilter.scope === "within_selection" ? baseRows : dataset.rows,
  );
  return Object.freeze(
    baseRows.filter((row) => {
      const customerType = classifications.get(row.customerId);
      return customerType !== undefined && typeFilter.values.includes(customerType);
    }),
  );
}

export function filterDataset(
  dataset: ValidatedDataset,
  input: FilterContextInput,
  missingKey = MISSING_DIMENSION_KEY,
): AnalyticsResult<FilteredRows> {
  const normalized = createFilterContext(input, dataset, missingKey);
  if (normalized.status === "error") {
    return normalized;
  }
  return {
    status: "ok",
    value: Object.freeze({
      rows: applyFilterContext(dataset, normalized.value, missingKey),
      filterContext: normalized.value,
    }),
    warnings: normalized.warnings,
  };
}
