import {
  createDateInterval,
  normalizeRawOrderLines,
  validateDataset,
  validateOrderLines,
  type AnalyticsError,
  type CanonicalOrderLine,
  type DatasetMetadata,
  type RawOrderLine,
  type ValidatedDataset,
  type ValidationConfiguration,
} from "../../analytics/index.ts";

/** Deliberate browser-session limits; this is not presented as an enterprise ETL service. */
export const UPLOAD_LIMITS = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  maxRows: 50_000,
  maxColumns: 100,
  previewRows: 12,
});

export const CANONICAL_UPLOAD_FIELDS = [
  ["order_line_id", "Order line ID", true, "identifier"],
  ["order_id", "Order ID", true, "identifier"],
  ["order_date", "Order date", true, "date"],
  ["customer_id", "Customer ID", true, "identifier"],
  ["customer_segment", "Customer segment", false, "text"],
  ["product_id", "Product ID", true, "identifier"],
  ["product_name", "Product name", true, "text"],
  ["category", "Category", true, "text"],
  ["region", "Region", true, "text"],
  ["sales_channel", "Sales channel", true, "text"],
  ["quantity", "Quantity", true, "integer"],
  ["unit_price", "Unit price", true, "money"],
  ["unit_cost", "Unit cost", true, "money"],
  ["discount_amount", "Discount amount", false, "money"],
  ["revenue", "Revenue", true, "money"],
  ["cost", "Cost", true, "money"],
  ["campaign", "Campaign", false, "text"],
  ["marketing_spend", "Marketing spend", true, "money"],
] as const;

export type CanonicalUploadField = (typeof CANONICAL_UPLOAD_FIELDS)[number][0];
export type UploadColumnType = "text" | "integer" | "number" | "date" | "empty";
export type IngestionSeverity = "error" | "warning" | "info";
export type RowDisposition = "accepted" | "accepted_with_warning" | "rejected";
export type DateFormat = "auto" | "iso" | "mdy" | "dmy" | "ymd";

export type UploadIssue = Readonly<{
  id: string;
  severity: IngestionSeverity;
  category: "file" | "parsing" | "mapping" | "transformation" | "validation" | "security";
  code: string;
  message: string;
  rowNumber: number | null;
  field: CanonicalUploadField | null;
  sourceColumn: string | null;
  sourceValue: string | null;
  proposedTransformation: string | null;
}>;
export type UploadColumn = Readonly<{
  name: string;
  index: number;
  inferredType: UploadColumnType;
  missingCount: number;
}>;
export type UploadRecord = Readonly<{
  sourceRowNumber: number;
  values: Readonly<Record<string, string>>;
}>;
export type ParsedUpload = Readonly<{
  filename: string;
  sizeBytes: number;
  delimiter: "," | ";" | "\t";
  columns: readonly UploadColumn[];
  records: readonly UploadRecord[];
  preview: readonly UploadRecord[];
  duplicateRawRowCount: number;
  issues: readonly UploadIssue[];
}>;
export type MappingSuggestion = Readonly<{
  target: CanonicalUploadField;
  sourceColumn: string | null;
  confidence: "high" | "medium" | "none";
  reason: string;
}>;
export type UploadMapping = Readonly<Partial<Record<CanonicalUploadField, string | null>>>;
export type TransformationSettings = Readonly<{
  trimWhitespace: boolean;
  normalizeOptionalEmptyToNull: boolean;
  parseCurrencyFormatting: boolean;
  dateFormat: DateFormat;
}>;
export const DEFAULT_TRANSFORMATIONS: TransformationSettings = Object.freeze({
  trimWhitespace: true,
  normalizeOptionalEmptyToNull: true,
  parseCurrencyFormatting: true,
  dateFormat: "auto",
});
export type FieldAudit = Readonly<{
  originalValue: string;
  transformation: string | null;
  canonicalValue: string;
}>;
export type PreparedUploadRow = Readonly<{
  sourceRowNumber: number;
  disposition: RowDisposition;
  audit: Readonly<Record<CanonicalUploadField, FieldAudit>>;
  issues: readonly UploadIssue[];
  canonical: CanonicalOrderLine | null;
}>;
export type UploadReconciliation = Readonly<{
  sourceRowCount: number;
  sourceColumnCount: number;
  requiredTargetsMapped: number;
  optionalTargetsMapped: number;
  unmappedSourceColumns: readonly string[];
  acceptedRows: number;
  acceptedWithWarningsRows: number;
  rejectedRows: number;
  blockingIssueCount: number;
  warningCount: number;
  canonicalOrderLines: number;
  distinctOrders: number;
  distinctCustomers: number;
  dateRange: Readonly<{ start: string; end: string }> | null;
  totals: Readonly<{
    quantity: number;
    revenueCents: number;
    costCents: number;
    grossProfitCents: number;
    discountsCents: number;
    marketingSpendCents: number;
  }>;
}>;
export type UploadReadiness =
  | Readonly<{
      status: "ready";
      title: "Ready to analyze";
      message: string;
      returnStep: null;
    }>
  | Readonly<{
      status: "mapping_blocked" | "exclusion_approval_required" | "validation_blocked";
      title: "More information is needed before analysis";
      message: string;
      returnStep: "Map columns" | "Transform" | "Review quality";
    }>;
export type IngestionPreparation = Readonly<{
  parsed: ParsedUpload;
  mapping: UploadMapping;
  transformations: TransformationSettings;
  rows: readonly PreparedUploadRow[];
  issues: readonly UploadIssue[];
  reconciliation: UploadReconciliation;
  dataset: ValidatedDataset | null;
  readiness: UploadReadiness;
  canAnalyze: boolean;
  requiresExclusionApproval: boolean;
}>;

const OPTIONAL = new Set<CanonicalUploadField>(["customer_segment", "discount_amount", "campaign"]);
const ALIASES: Readonly<Record<CanonicalUploadField, readonly string[]>> = {
  order_line_id: ["orderlineid", "lineid", "lineitemid"],
  order_id: ["orderid", "order", "transactionid", "invoiceid"],
  order_date: ["orderdate", "date", "purchasedate", "transactiondate"],
  customer_id: ["customerid", "customer", "clientid", "buyerid"],
  customer_segment: ["customersegment", "segment"],
  product_id: ["productid", "sku", "itemid", "productcode"],
  product_name: ["productname", "product", "itemname", "description"],
  category: ["category", "productcategory", "department"],
  region: ["region", "market", "territory", "state"],
  sales_channel: ["saleschannel", "channel", "source"],
  quantity: ["quantity", "qty", "units", "unitssold"],
  unit_price: ["unitprice", "price", "sellingprice"],
  unit_cost: ["unitcost", "costperunit", "unitcogs"],
  discount_amount: ["discountamount", "discount"],
  revenue: ["revenue", "netsales", "sales", "netrevenue", "amount"],
  cost: ["cost", "cogs", "totalcost", "costofgoods"],
  campaign: ["campaign", "campaignname"],
  marketing_spend: ["marketingspend", "adspend", "spend", "marketingcost"],
};

function makeIssue(value: Omit<UploadIssue, "id">): UploadIssue {
  return Object.freeze({
    ...value,
    id: [
      value.category,
      value.code,
      value.rowNumber ?? "global",
      value.field ?? "none",
      value.sourceColumn ?? "none",
    ].join(":"),
  });
}
function norm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}
function fieldInfo(target: CanonicalUploadField) {
  const item = CANONICAL_UPLOAD_FIELDS.find(([id]) => id === target);
  if (!item) throw new Error(`Unknown upload target ${target}`);
  return item;
}

type CsvRecord = Readonly<{ fields: readonly string[]; sourceRowNumber: number }>;
function parseRecords(
  text: string,
  delimiter: string,
): { records: readonly CsvRecord[] } | { error: UploadIssue } {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  let line = 1;
  let start = 1;
  const push = () => {
    fields.push(field);
    records.push(Object.freeze({ fields: Object.freeze(fields), sourceRowNumber: start }));
    fields = [];
    field = "";
    closed = false;
  };
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i] ?? "";
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        field += c;
        if (c === "\n") line += 1;
      }
      continue;
    }
    if (closed && c !== delimiter && c !== "\r" && c !== "\n")
      return {
        error: makeIssue({
          severity: "error",
          category: "parsing",
          code: "csv_syntax",
          message: "Unexpected character after a closing CSV quote.",
          rowNumber: line,
          field: null,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      };
    if (c === '"') {
      if (field.length > 0)
        return {
          error: makeIssue({
            severity: "error",
            category: "parsing",
            code: "csv_syntax",
            message: "A quoted CSV field must begin with a quote.",
            rowNumber: line,
            field: null,
            sourceColumn: null,
            sourceValue: null,
            proposedTransformation: null,
          }),
        };
      quoted = true;
      continue;
    }
    if (c === delimiter) {
      fields.push(field);
      field = "";
      closed = false;
      continue;
    }
    if (c === "\r" || c === "\n") {
      push();
      if (c === "\r" && source[i + 1] === "\n") i += 1;
      line += 1;
      start = line;
      continue;
    }
    field += c;
  }
  if (quoted)
    return {
      error: makeIssue({
        severity: "error",
        category: "parsing",
        code: "csv_syntax",
        message: "CSV input ended inside a quoted field.",
        rowNumber: line,
        field: null,
        sourceColumn: null,
        sourceValue: null,
        proposedTransformation: null,
      }),
    };
  if (field.length > 0 || fields.length > 0 || closed) push();
  return { records: Object.freeze(records) };
}
function typeOf(values: readonly string[]): UploadColumnType {
  const v = values.map((x) => x.trim()).filter(Boolean);
  if (!v.length) return "empty";
  if (v.every((x) => /^\d+$/u.test(x))) return "integer";
  if (v.every((x) => /^-?[$€£]?\d[\d,]*(?:\.\d{1,2})?$/u.test(x))) return "number";
  if (v.every((x) => /^(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})$/u.test(x)))
    return "date";
  return "text";
}

export function validateUploadFile(input: {
  name: string;
  sizeBytes: number;
}): readonly UploadIssue[] {
  const out: UploadIssue[] = [];
  if (!/\.csv$/iu.test(input.name))
    out.push(
      makeIssue({
        severity: "error",
        category: "file",
        code: "unsupported_file_type",
        message: "Phase 5 accepts CSV files only.",
        rowNumber: null,
        field: null,
        sourceColumn: null,
        sourceValue: input.name,
        proposedTransformation: null,
      }),
    );
  if (input.sizeBytes === 0)
    out.push(
      makeIssue({
        severity: "error",
        category: "file",
        code: "empty_file",
        message: "The selected file is empty.",
        rowNumber: null,
        field: null,
        sourceColumn: null,
        sourceValue: null,
        proposedTransformation: null,
      }),
    );
  if (input.sizeBytes > UPLOAD_LIMITS.maxBytes)
    out.push(
      makeIssue({
        severity: "error",
        category: "file",
        code: "file_too_large",
        message: "CSV files are limited to 8 MB for this browser session.",
        rowNumber: null,
        field: null,
        sourceColumn: null,
        sourceValue: null,
        proposedTransformation: null,
      }),
    );
  return Object.freeze(out);
}

/** Generic, inert CSV parser. It returns text only; it never evaluates cells or formulas. */
export function parseUploadCsv(input: {
  filename: string;
  sizeBytes: number;
  text: string;
}): { status: "ok"; value: ParsedUpload } | { status: "error"; issues: readonly UploadIssue[] } {
  const fileIssues = validateUploadFile({ name: input.filename, sizeBytes: input.sizeBytes });
  if (fileIssues.length) return { status: "error", issues: fileIssues };
  if (input.text.includes("\0") || input.text.includes("\uFFFD"))
    return {
      status: "error",
      issues: Object.freeze([
        makeIssue({
          severity: "error",
          category: "file",
          code: "unsupported_encoding",
          message: "The file is not valid UTF-8 text. Save it as UTF-8 CSV and try again.",
          rowNumber: null,
          field: null,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      ]),
    };
  const first = input.text.replace(/^\uFEFF/u, "").split(/\r?\n/u, 1)[0] ?? "";
  const delimiter = ([",", ";", "\t"] as const).reduce(
    (best, c) => (first.split(c).length > first.split(best).length ? c : best),
    "," as "," | ";" | "\t",
  );
  const result = parseRecords(input.text, delimiter);
  if ("error" in result) return { status: "error", issues: Object.freeze([result.error]) };
  const header = result.records[0];
  if (!header || !header.fields.length || header.fields.every((x) => !x.trim()))
    return {
      status: "error",
      issues: Object.freeze([
        makeIssue({
          severity: "error",
          category: "parsing",
          code: "missing_header",
          message: "The CSV must begin with a non-empty header row.",
          rowNumber: 1,
          field: null,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      ]),
    };
  const headers = header.fields.map((x) => x.trim());
  if (headers.length > UPLOAD_LIMITS.maxColumns)
    return {
      status: "error",
      issues: Object.freeze([
        makeIssue({
          severity: "error",
          category: "file",
          code: "too_many_columns",
          message: "CSV files are limited to 100 columns in this browser workflow.",
          rowNumber: 1,
          field: null,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      ]),
    };
  const duplicates = headers.filter(
    (x, i) => !x || headers.findIndex((y) => norm(y) === norm(x)) !== i,
  );
  if (duplicates.length)
    return {
      status: "error",
      issues: Object.freeze([
        makeIssue({
          severity: "error",
          category: "parsing",
          code: "duplicate_or_empty_header",
          message: `Header names must be non-empty and unique: ${[...new Set(duplicates)].join(", ")}.`,
          rowNumber: 1,
          field: null,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      ]),
    };
  const data = result.records.slice(1);
  if (!data.length)
    return {
      status: "error",
      issues: Object.freeze([
        makeIssue({
          severity: "error",
          category: "file",
          code: "empty_file",
          message: "The CSV has a header but no data rows.",
          rowNumber: null,
          field: null,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      ]),
    };
  if (data.length > UPLOAD_LIMITS.maxRows)
    return {
      status: "error",
      issues: Object.freeze([
        makeIssue({
          severity: "error",
          category: "file",
          code: "too_many_rows",
          message: "CSV files are limited to 50,000 data rows in this browser workflow.",
          rowNumber: null,
          field: null,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      ]),
    };
  const wrong = data.find((x) => x.fields.length !== headers.length);
  if (wrong)
    return {
      status: "error",
      issues: Object.freeze([
        makeIssue({
          severity: "error",
          category: "parsing",
          code: "inconsistent_row_width",
          message: `Row has ${wrong.fields.length} fields; expected ${headers.length}.`,
          rowNumber: wrong.sourceRowNumber,
          field: null,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      ]),
    };
  const records = Object.freeze(
    data.map((row) =>
      Object.freeze({
        sourceRowNumber: row.sourceRowNumber,
        values: Object.freeze(
          Object.fromEntries(headers.map((name, index) => [name, row.fields[index] ?? ""])),
        ),
      }),
    ),
  );
  const columns = Object.freeze(
    headers.map((name, index) => {
      const values = records.map((row) => row.values[name] ?? "");
      return Object.freeze({
        name,
        index,
        inferredType: typeOf(values),
        missingCount: values.filter((x) => !x.trim()).length,
      });
    }),
  );
  const seen = new Set<string>();
  let duplicateRawRowCount = 0;
  for (const row of records) {
    const key = headers.map((h) => row.values[h]).join("\u001f");
    if (seen.has(key)) duplicateRawRowCount += 1;
    else seen.add(key);
  }
  const issues = duplicateRawRowCount
    ? [
        makeIssue({
          severity: "warning",
          category: "validation",
          code: "duplicate_raw_rows",
          message: `${duplicateRawRowCount} raw duplicate rows detected. Review before analysis.`,
          rowNumber: null,
          field: null,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      ]
    : [];
  return {
    status: "ok",
    value: Object.freeze({
      filename: input.filename,
      sizeBytes: input.sizeBytes,
      delimiter,
      columns,
      records,
      preview: Object.freeze(records.slice(0, UPLOAD_LIMITS.previewRows)),
      duplicateRawRowCount,
      issues: Object.freeze(issues),
    }),
  };
}

function compatible(target: CanonicalUploadField, column: UploadColumn): boolean {
  const kind = fieldInfo(target)[3];
  return !(kind === "date" && column.inferredType === "number");
}
export function suggestUploadMappings(parsed: ParsedUpload): readonly MappingSuggestion[] {
  const used = new Set<string>();
  return Object.freeze(
    CANONICAL_UPLOAD_FIELDS.map(([target]) => {
      const aliases = new Set([norm(target), ...ALIASES[target]]);
      const column = parsed.columns.find(
        (c) => !used.has(c.name) && aliases.has(norm(c.name)) && compatible(target, c),
      );
      if (!column)
        return Object.freeze({
          target,
          sourceColumn: null,
          confidence: "none",
          reason: "No unambiguous deterministic header match was found.",
        });
      used.add(column.name);
      return Object.freeze({
        target,
        sourceColumn: column.name,
        confidence: norm(column.name) === norm(target) ? "high" : "medium",
        reason:
          norm(column.name) === norm(target)
            ? "Normalized header matches the canonical field."
            : "Recognized deterministic alias with compatible inferred type.",
      });
    }),
  );
}
export function mappingFromSuggestions(s: readonly MappingSuggestion[]): UploadMapping {
  return Object.freeze(Object.fromEntries(s.map((x) => [x.target, x.sourceColumn])));
}
export function validateUploadMapping(
  parsed: ParsedUpload,
  mapping: UploadMapping,
): readonly UploadIssue[] {
  const issues: UploadIssue[] = [];
  const used = new Map<string, CanonicalUploadField>();
  for (const [target, label, required] of CANONICAL_UPLOAD_FIELDS) {
    const source = mapping[target] ?? null;
    if (required && !source)
      issues.push(
        makeIssue({
          severity: "error",
          category: "mapping",
          code: "required_target_unmapped",
          message: `${label} is required before this dataset can be analyzed.`,
          rowNumber: null,
          field: target,
          sourceColumn: null,
          sourceValue: null,
          proposedTransformation: null,
        }),
      );
    if (source && !parsed.columns.some((c) => c.name === source))
      issues.push(
        makeIssue({
          severity: "error",
          category: "mapping",
          code: "unknown_source_column",
          message: `Mapped source column no longer exists: ${source}.`,
          rowNumber: null,
          field: target,
          sourceColumn: source,
          sourceValue: null,
          proposedTransformation: null,
        }),
      );
    if (source) {
      const prior = used.get(source);
      if (prior)
        issues.push(
          makeIssue({
            severity: "error",
            category: "mapping",
            code: "duplicate_source_mapping",
            message: `${source} is mapped to both ${prior} and ${target}.`,
            rowNumber: null,
            field: target,
            sourceColumn: source,
            sourceValue: null,
            proposedTransformation: null,
          }),
        );
      else used.set(source, target);
    }
  }
  return Object.freeze(issues);
}

function transform(
  target: CanonicalUploadField,
  value: string,
  settings: TransformationSettings,
): { audit: FieldAudit; error: string | null } {
  const initial = settings.trimWhitespace ? value.trim() : value;
  let canonical = initial;
  let note = canonical === value ? null : "Trimmed surrounding whitespace.";
  const kind = fieldInfo(target)[3];
  if (kind === "date" && !/^\d{4}-\d{2}-\d{2}$/u.test(canonical)) {
    const parts = /^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/u.exec(canonical);
    if (!parts)
      return {
        audit: Object.freeze({
          originalValue: value,
          canonicalValue: canonical,
          transformation: note,
        }),
        error: "Date must be ISO YYYY-MM-DD or a selected supported numeric format.",
      };
    const [a, b, c] = parts.slice(1).map(Number);
    let year: number, month: number, day: number;
    if (a >= 1000 || settings.dateFormat === "ymd") [year, month, day] = [a, b, c];
    else if (settings.dateFormat === "mdy") [month, day, year] = [a, b, c];
    else if (settings.dateFormat === "dmy") [day, month, year] = [a, b, c];
    else {
      if (a <= 12 && b <= 12)
        return {
          audit: Object.freeze({
            originalValue: value,
            canonicalValue: canonical,
            transformation: note,
          }),
          error: "Ambiguous numeric date. Select month/day/year or day/month/year.",
        };
      [month, day, year] = [a, b, c];
    }
    if (year < 100) year += 2000;
    canonical = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (createDateInterval(canonical, canonical).status === "error")
      return {
        audit: Object.freeze({
          originalValue: value,
          canonicalValue: canonical,
          transformation: note,
        }),
        error: "Date is outside the supported calendar range.",
      };
    note = `Parsed ${settings.dateFormat === "auto" ? "numeric" : settings.dateFormat.toUpperCase()} date format.`;
  }
  if (kind === "money" && settings.parseCurrencyFormatting) {
    const parsed = canonical.replace(/^[\$€£]/u, "").replaceAll(",", "");
    if (!/^-?\d+(?:\.\d{1,2})?$/u.test(parsed))
      return {
        audit: Object.freeze({
          originalValue: value,
          canonicalValue: canonical,
          transformation: note,
        }),
        error: "Money must use up to two decimal places after configured cleanup.",
      };
    if (parsed !== canonical) {
      canonical = parsed;
      note = "Removed configured currency symbol and grouping separators.";
    }
  }
  return {
    audit: Object.freeze({ originalValue: value, canonicalValue: canonical, transformation: note }),
    error: null,
  };
}
function rawFromAudit(row: number, audit: Record<CanonicalUploadField, FieldAudit>): RawOrderLine {
  return Object.freeze({
    sourceRowNumber: row,
    order_line_id: audit.order_line_id.canonicalValue,
    order_id: audit.order_id.canonicalValue,
    order_date: audit.order_date.canonicalValue,
    customer_id: audit.customer_id.canonicalValue,
    customer_segment: audit.customer_segment.canonicalValue,
    product_id: audit.product_id.canonicalValue,
    product_name: audit.product_name.canonicalValue,
    category: audit.category.canonicalValue,
    region: audit.region.canonicalValue,
    sales_channel: audit.sales_channel.canonicalValue,
    quantity: audit.quantity.canonicalValue,
    unit_price: audit.unit_price.canonicalValue,
    unit_cost: audit.unit_cost.canonicalValue,
    discount_amount: audit.discount_amount.canonicalValue,
    revenue: audit.revenue.canonicalValue,
    cost: audit.cost.canonicalValue,
    campaign: audit.campaign.canonicalValue,
    marketing_spend: audit.marketing_spend.canonicalValue,
  });
}
function config(range: DatasetMetadata["dateRange"]): ValidationConfiguration {
  return Object.freeze({
    currency: "USD",
    timezone: "UTC",
    dateRange: range,
    vocabulary: Object.freeze({
      categories: [],
      regions: [],
      salesChannels: [],
      customerSegments: [],
      campaigns: [],
    }),
    idPatterns: Object.freeze({
      orderLineId: /\S/u,
      orderId: /\S/u,
      customerId: /\S/u,
      productId: /\S/u,
    }),
    marketingSpendSemantics: "line_level",
  });
}
function fromAnalytics(error: AnalyticsError): UploadIssue {
  return makeIssue({
    severity: error.severity,
    category: "validation",
    code: error.code,
    message: error.message,
    rowNumber: error.rowNumber,
    field: null,
    sourceColumn: null,
    sourceValue: error.value,
    proposedTransformation: null,
  });
}
function metadata(range: DatasetMetadata["dateRange"]): DatasetMetadata {
  return Object.freeze({
    datasetVersion: "uploaded-session-dataset",
    transformationVersion: "phase5-ingestion-v1",
    analyticsSpecificationVersion: "3.0.0",
    currency: "USD",
    timezone: "UTC",
    dateRange: range,
    revenueSemantics: "net_after_line_discount",
    costSemantics: "line_cost_of_goods",
    marketingSpendSemantics: "line_level",
  });
}

function firstBlockingMessage(issues: readonly UploadIssue[]): string | null {
  return issues.find((issue) => issue.severity === "error")?.message ?? null;
}

function determineReadiness(input: {
  mappingIssues: readonly UploadIssue[];
  rejectedRows: number;
  allowRowExclusions: boolean;
  dataset: ValidatedDataset | null;
  issues: readonly UploadIssue[];
}): UploadReadiness {
  if (input.mappingIssues.some((issue) => issue.severity === "error"))
    return Object.freeze({
      status: "mapping_blocked",
      title: "More information is needed before analysis",
      message:
        firstBlockingMessage(input.mappingIssues) ??
        "Map the required columns before InsightAI can check this data.",
      returnStep: "Map columns",
    });
  if (input.rejectedRows > 0 && !input.allowRowExclusions)
    return Object.freeze({
      status: "exclusion_approval_required",
      title: "More information is needed before analysis",
      message: `${input.rejectedRows} row${input.rejectedRows === 1 ? " needs" : "s need"} your review. Fix the listed values or explicitly approve excluding those rows before analysis.`,
      returnStep: "Transform",
    });
  if (!input.dataset)
    return Object.freeze({
      status: "validation_blocked",
      title: "More information is needed before analysis",
      message:
        firstBlockingMessage(input.issues) ??
        "InsightAI could not validate this data for analysis. Review the data check and correct the listed issue.",
      returnStep: "Review quality",
    });
  return Object.freeze({
    status: "ready",
    title: "Ready to analyze",
    message: "Your data passed the required checks and is ready for InsightAI to analyze.",
    returnStep: null,
  });
}

export function prepareUploadedDataset(input: {
  parsed: ParsedUpload;
  mapping: UploadMapping;
  transformations?: TransformationSettings;
  allowRowExclusions?: boolean;
}): IngestionPreparation {
  const transformations = input.transformations ?? DEFAULT_TRANSFORMATIONS;
  const mappingIssues = validateUploadMapping(input.parsed, input.mapping);
  const range = createDateInterval("2000-01-01", "2100-12-31");
  if (range.status === "error") throw new Error("Invalid static validation range.");
  const rows: PreparedUploadRow[] = [];
  const issues: UploadIssue[] = [...input.parsed.issues, ...mappingIssues];
  for (const record of input.parsed.records) {
    const audit = {} as Record<CanonicalUploadField, FieldAudit>;
    const rowIssues: UploadIssue[] = [];
    for (const [target] of CANONICAL_UPLOAD_FIELDS) {
      const source = input.mapping[target] ?? null;
      const original = source
        ? (record.values[source] ?? "")
        : target === "discount_amount"
          ? "0"
          : "";
      const transformed = transform(target, original, transformations);
      audit[target] = source
        ? transformed.audit
        : Object.freeze({
            originalValue: "",
            canonicalValue: original,
            transformation: OPTIONAL.has(target)
              ? target === "discount_amount"
                ? "Defaulted optional discount amount to 0."
                : "Left optional field empty."
              : null,
          });
      if (transformed.error)
        rowIssues.push(
          makeIssue({
            severity: "error",
            category: "transformation",
            code: "invalid_transformation_value",
            message: transformed.error,
            rowNumber: record.sourceRowNumber,
            field: target,
            sourceColumn: source,
            sourceValue: original,
            proposedTransformation: null,
          }),
        );
      if (
        audit[target].transformation &&
        audit[target].transformation !== "Left optional field empty."
      )
        rowIssues.push(
          makeIssue({
            severity: "info",
            category: "transformation",
            code: "transformation_applied",
            message: audit[target].transformation,
            rowNumber: record.sourceRowNumber,
            field: target,
            sourceColumn: source,
            sourceValue: original,
            proposedTransformation: audit[target].canonicalValue,
          }),
        );
      if (/^[=+@]/u.test(original.trim()))
        rowIssues.push(
          makeIssue({
            severity: "warning",
            category: "security",
            code: "formula_like_cell",
            message:
              "Formula-like source text is retained only as inert data and is never executed.",
            rowNumber: record.sourceRowNumber,
            field: target,
            sourceColumn: source,
            sourceValue: original,
            proposedTransformation: null,
          }),
        );
    }
    let canonical: CanonicalOrderLine | null = null;
    if (!rowIssues.some((x) => x.severity === "error")) {
      const validated = validateOrderLines(
        normalizeRawOrderLines([rawFromAudit(record.sourceRowNumber, audit)]),
        config(range.value),
      );
      if (validated.status === "error") rowIssues.push(...validated.errors.map(fromAnalytics));
      else canonical = validated.value[0] ?? null;
    }
    const disposition: RowDisposition = rowIssues.some((x) => x.severity === "error")
      ? "rejected"
      : rowIssues.some((x) => x.severity === "warning")
        ? "accepted_with_warning"
        : "accepted";
    issues.push(...rowIssues);
    rows.push(
      Object.freeze({
        sourceRowNumber: record.sourceRowNumber,
        disposition,
        audit: Object.freeze(audit),
        issues: Object.freeze(rowIssues),
        canonical: disposition === "rejected" ? null : canonical,
      }),
    );
  }
  const candidates = rows.flatMap((row) => (row.canonical ? [row.canonical] : []));
  let dataset: ValidatedDataset | null = null;
  const candidateDates = candidates.map((row) => row.orderDate).sort();
  const candidateRange = candidateDates.length
    ? createDateInterval(candidateDates[0] ?? "", candidateDates.at(-1) ?? "")
    : null;
  const rejected = rows.filter((row) => row.disposition === "rejected");
  if (
    !mappingIssues.some((x) => x.severity === "error") &&
    candidateRange?.status === "ok" &&
    (rejected.length === 0 || input.allowRowExclusions)
  ) {
    const validated = validateDataset(
      candidates,
      metadata(candidateRange.value),
      config(candidateRange.value),
    );
    if (validated.status === "valid") dataset = validated.dataset;
    else issues.push(...validated.errors.map(fromAnalytics));
  }
  if (!candidates.length)
    issues.push(
      makeIssue({
        severity: "error",
        category: "validation",
        code: "empty_canonical_result",
        message: "No valid canonical rows remain after mapping and validation.",
        rowNumber: null,
        field: null,
        sourceColumn: null,
        sourceValue: null,
        proposedTransformation: null,
      }),
    );
  const shown = dataset?.rows ?? candidates;
  const mapped = new Set(Object.values(input.mapping).filter((x): x is string => Boolean(x)));
  const totals = shown.reduce(
    (sum, row) => ({
      quantity: sum.quantity + row.quantity,
      revenueCents: sum.revenueCents + row.revenueCents,
      costCents: sum.costCents + row.costCents,
      grossProfitCents: sum.grossProfitCents + row.revenueCents - row.costCents,
      discountsCents: sum.discountsCents + row.discountAmountCents,
      marketingSpendCents: sum.marketingSpendCents + row.marketingSpendCents,
    }),
    {
      quantity: 0,
      revenueCents: 0,
      costCents: 0,
      grossProfitCents: 0,
      discountsCents: 0,
      marketingSpendCents: 0,
    },
  );
  const reconciliation: UploadReconciliation = Object.freeze({
    sourceRowCount: input.parsed.records.length,
    sourceColumnCount: input.parsed.columns.length,
    requiredTargetsMapped: CANONICAL_UPLOAD_FIELDS.filter(
      ([id, , required]) => required && input.mapping[id],
    ).length,
    optionalTargetsMapped: CANONICAL_UPLOAD_FIELDS.filter(
      ([id, , required]) => !required && input.mapping[id],
    ).length,
    unmappedSourceColumns: Object.freeze(
      input.parsed.columns.map((x) => x.name).filter((x) => !mapped.has(x)),
    ),
    acceptedRows: rows.filter((x) => x.disposition === "accepted").length,
    acceptedWithWarningsRows: rows.filter((x) => x.disposition === "accepted_with_warning").length,
    rejectedRows: rejected.length,
    blockingIssueCount: issues.filter((x) => x.severity === "error").length,
    warningCount: issues.filter((x) => x.severity === "warning").length,
    canonicalOrderLines: shown.length,
    distinctOrders: new Set(shown.map((x) => x.orderId)).size,
    distinctCustomers: new Set(shown.map((x) => x.customerId)).size,
    dateRange:
      candidateRange?.status === "ok"
        ? Object.freeze({ start: candidateRange.value.start, end: candidateRange.value.end })
        : null,
    totals: Object.freeze(totals),
  });
  const readiness = determineReadiness({
    mappingIssues,
    rejectedRows: rejected.length,
    allowRowExclusions: input.allowRowExclusions ?? false,
    dataset,
    issues,
  });
  return Object.freeze({
    parsed: input.parsed,
    mapping: Object.freeze({ ...input.mapping }),
    transformations: Object.freeze({ ...transformations }),
    rows: Object.freeze(rows),
    issues: Object.freeze(issues),
    reconciliation,
    dataset,
    readiness,
    canAnalyze: readiness.status === "ready",
    requiresExclusionApproval: rejected.length > 0 && !input.allowRowExclusions,
  });
}

export function decodeUtf8Csv(
  bytes: ArrayBuffer,
): { status: "ok"; text: string } | { status: "error"; issue: UploadIssue } {
  try {
    return { status: "ok", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return {
      status: "error",
      issue: makeIssue({
        severity: "error",
        category: "file",
        code: "unsupported_encoding",
        message: "The file is not valid UTF-8 text. Save it as UTF-8 CSV and try again.",
        rowNumber: null,
        field: null,
        sourceColumn: null,
        sourceValue: null,
        proposedTransformation: null,
      }),
    };
  }
}
