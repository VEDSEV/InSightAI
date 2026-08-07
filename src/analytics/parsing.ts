import { createAnalyticsError } from "./errors.ts";
import type { AnalyticsResult, RawOrderLine } from "./types.ts";

export const ORDER_LINE_CSV_COLUMNS = [
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

type CsvRecord = {
  readonly fields: readonly string[];
  readonly sourceRowNumber: number;
};

function parseCsvRecords(text: string): AnalyticsResult<readonly CsvRecord[]> {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let index = 0;
  let physicalLine = 1;
  let recordStartLine = 1;
  let inQuotes = false;
  let quoteClosed = false;

  const syntaxError = (message: string) => ({
    status: "error" as const,
    errors: [
      createAnalyticsError({
        code: "csv_syntax",
        stage: "parsing",
        message,
        rowNumber: physicalLine,
      }),
    ],
  });

  const pushRecord = () => {
    fields.push(field);
    records.push(
      Object.freeze({ fields: Object.freeze(fields), sourceRowNumber: recordStartLine }),
    );
    fields = [];
    field = "";
    quoteClosed = false;
  };

  while (index < source.length) {
    const character = source[index] ?? "";

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        quoteClosed = true;
        index += 1;
        continue;
      }

      field += character;
      if (character === "\n") {
        physicalLine += 1;
      }
      index += 1;
      continue;
    }

    if (quoteClosed && character !== "," && character !== "\r" && character !== "\n") {
      return syntaxError("Unexpected character after a closing CSV quote.");
    }

    if (character === '"') {
      if (field.length > 0) {
        return syntaxError("A quoted CSV field must begin with a quote.");
      }
      inQuotes = true;
      index += 1;
      continue;
    }

    if (character === ",") {
      fields.push(field);
      field = "";
      quoteClosed = false;
      index += 1;
      continue;
    }

    if (character === "\r" || character === "\n") {
      pushRecord();
      if (character === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      index += 1;
      physicalLine += 1;
      recordStartLine = physicalLine;
      continue;
    }

    field += character;
    index += 1;
  }

  if (inQuotes) {
    return syntaxError("CSV input ended inside a quoted field.");
  }

  if (field.length > 0 || fields.length > 0 || quoteClosed) {
    pushRecord();
  }

  return { status: "ok", value: Object.freeze(records), warnings: [] };
}

function valueAt(
  record: CsvRecord,
  indexes: Readonly<Record<string, number>>,
  column: string,
): string {
  const columnIndex = indexes[column];
  return columnIndex === undefined ? "" : (record.fields[columnIndex] ?? "");
}

export function parseOrderLineCsv(text: string): AnalyticsResult<readonly RawOrderLine[]> {
  const parsed = parseCsvRecords(text);
  if (parsed.status === "error") {
    return parsed;
  }

  const headerRecord = parsed.value[0];
  if (!headerRecord) {
    return {
      status: "error",
      errors: [
        createAnalyticsError({
          code: "missing_column",
          stage: "parsing",
          message: "CSV input does not contain a header row.",
          rowNumber: 1,
        }),
      ],
    };
  }

  const header = headerRecord.fields.map((value) => value.trim());
  const headerCounts = new Map<string, number>();
  for (const column of header) {
    headerCounts.set(column, (headerCounts.get(column) ?? 0) + 1);
  }

  const errors = [];
  for (const column of ORDER_LINE_CSV_COLUMNS) {
    if (!headerCounts.has(column)) {
      errors.push(
        createAnalyticsError({
          code: "missing_column",
          stage: "parsing",
          message: `Required CSV column is missing: ${column}.`,
          rowNumber: headerRecord.sourceRowNumber,
          field: column,
        }),
      );
    }
  }
  for (const [column, count] of headerCounts) {
    if (!ORDER_LINE_CSV_COLUMNS.some((expected) => expected === column) || count > 1) {
      errors.push(
        createAnalyticsError({
          code: "unexpected_column",
          stage: "parsing",
          message:
            count > 1
              ? `CSV column appears more than once: ${column}.`
              : `Unexpected CSV column: ${column}.`,
          rowNumber: headerRecord.sourceRowNumber,
          field: column,
        }),
      );
    }
  }
  if (errors.length > 0) {
    return { status: "error", errors: Object.freeze(errors) };
  }

  const indexes: Record<string, number> = {};
  header.forEach((column, columnIndex) => {
    indexes[column] = columnIndex;
  });

  const rows: RawOrderLine[] = [];
  for (const record of parsed.value.slice(1)) {
    if (record.fields.length !== header.length) {
      errors.push(
        createAnalyticsError({
          code: "csv_syntax",
          stage: "parsing",
          message: `CSV row has ${record.fields.length} fields; expected ${header.length}.`,
          rowNumber: record.sourceRowNumber,
        }),
      );
      continue;
    }

    rows.push(
      Object.freeze({
        sourceRowNumber: record.sourceRowNumber,
        order_line_id: valueAt(record, indexes, "order_line_id"),
        order_id: valueAt(record, indexes, "order_id"),
        order_date: valueAt(record, indexes, "order_date"),
        customer_id: valueAt(record, indexes, "customer_id"),
        customer_segment: valueAt(record, indexes, "customer_segment"),
        product_id: valueAt(record, indexes, "product_id"),
        product_name: valueAt(record, indexes, "product_name"),
        category: valueAt(record, indexes, "category"),
        region: valueAt(record, indexes, "region"),
        sales_channel: valueAt(record, indexes, "sales_channel"),
        quantity: valueAt(record, indexes, "quantity"),
        unit_price: valueAt(record, indexes, "unit_price"),
        unit_cost: valueAt(record, indexes, "unit_cost"),
        discount_amount: valueAt(record, indexes, "discount_amount"),
        revenue: valueAt(record, indexes, "revenue"),
        cost: valueAt(record, indexes, "cost"),
        campaign: valueAt(record, indexes, "campaign"),
        marketing_spend: valueAt(record, indexes, "marketing_spend"),
      }),
    );
  }

  return errors.length > 0
    ? { status: "error", errors: Object.freeze(errors) }
    : { status: "ok", value: Object.freeze(rows), warnings: [] };
}
