import { CSV_COLUMNS, type OrderLine } from "./types.ts";

const MONEY_COLUMNS = new Set<keyof OrderLine>([
  "unit_price",
  "unit_cost",
  "discount_amount",
  "revenue",
  "cost",
  "marketing_spend",
]);

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function serializeDataset(rows: readonly OrderLine[]): string {
  const lines = [CSV_COLUMNS.join(",")];

  for (const row of rows) {
    const values = CSV_COLUMNS.map((column) => {
      const value = row[column];
      if (MONEY_COLUMNS.has(column as keyof OrderLine)) {
        return (value as number).toFixed(2);
      }
      return escapeCsv(String(value));
    });
    lines.push(values.join(","));
  }

  return `${lines.join("\n")}\n`;
}
