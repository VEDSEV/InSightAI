import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRANSFORMATIONS,
  mappingFromSuggestions,
  parseUploadCsv,
  prepareUploadedDataset,
  suggestUploadMappings,
  validateUploadFile,
} from "@/features/ingestion/ingestion-core";

const renamedHeader = [
  "Line ID",
  "Order",
  "Order Date",
  "Customer",
  "Segment",
  "SKU",
  "Product",
  "Department",
  "Region",
  "Channel",
  "Qty",
  "Price",
  "Unit COGS",
  "Discount",
  "Net Sales",
  "COGS",
  "Campaign",
  "Ad Spend",
].join(",");
const validRows = [
  "00001,ORD-0001,01/02/2025,0007,,SKU-01,Widget,Home,West,Web,2,$10.00,$6.00,$1.00,$19.00,$12.00,,0",
  "00002,ORD-0002,01/03/2025,0008,New,SKU-02,Gizmo,Kitchen,East,Web,1,$25.00,$10.00,$0.00,$25.00,$10.00,Launch,3.50",
].join("\n");
const validCsv = `${renamedHeader}\n${validRows}`;

function parsedFixture(text = validCsv) {
  const parsed = parseUploadCsv({
    filename: "orders.csv",
    sizeBytes: new TextEncoder().encode(text).byteLength,
    text,
  });
  if (parsed.status === "error")
    throw new Error(parsed.issues.map((issue) => issue.message).join(" "));
  return parsed.value;
}

describe("Phase 5 ingestion core", () => {
  it("parses a noncanonical CSV, infers deterministic aliases, and preserves leading-zero identifiers", () => {
    const parsed = parsedFixture();
    const mapping = mappingFromSuggestions(suggestUploadMappings(parsed));
    expect(parsed.columns.find((column) => column.name === "Order Date")?.inferredType).toBe(
      "date",
    );
    expect(mapping.order_line_id).toBe("Line ID");
    expect(mapping.product_id).toBe("SKU");
    const prepared = prepareUploadedDataset({
      parsed,
      mapping,
      transformations: { ...DEFAULT_TRANSFORMATIONS, dateFormat: "mdy" },
    });
    expect(prepared.canAnalyze).toBe(true);
    expect(prepared.dataset?.rows[0]?.orderLineId).toBe("00001");
    expect(prepared.reconciliation.totals.revenueCents).toBe(4400);
    expect(prepared.reconciliation.totals.grossProfitCents).toBe(2200);
  });

  it("rejects ambiguous numeric dates until the user selects an interpretation", () => {
    const parsed = parsedFixture();
    const mapping = mappingFromSuggestions(suggestUploadMappings(parsed));
    const prepared = prepareUploadedDataset({ parsed, mapping });
    expect(prepared.canAnalyze).toBe(false);
    expect(prepared.issues.some((issue) => issue.message.includes("Ambiguous numeric date"))).toBe(
      true,
    );
  });

  it("keeps invalid rows visible and requires explicit exclusion before analytics", () => {
    const parsed = parsedFixture(
      `${renamedHeader}\n${validRows}\n00003,ORD-0003,01/04/2025,0009,,SKU-03,Bad,Home,West,Web,nope,$10,$5,0,$10,$5,,0`,
    );
    const mapping = mappingFromSuggestions(suggestUploadMappings(parsed));
    const blocked = prepareUploadedDataset({
      parsed,
      mapping,
      transformations: { ...DEFAULT_TRANSFORMATIONS, dateFormat: "mdy" },
    });
    expect(blocked.requiresExclusionApproval).toBe(true);
    expect(blocked.dataset).toBeNull();
    expect(blocked.rows.find((row) => row.sourceRowNumber === 4)?.disposition).toBe("rejected");
    const allowed = prepareUploadedDataset({
      parsed,
      mapping,
      transformations: { ...DEFAULT_TRANSFORMATIONS, dateFormat: "mdy" },
      allowRowExclusions: true,
    });
    expect(allowed.canAnalyze).toBe(true);
    expect(allowed.reconciliation.rejectedRows).toBe(1);
  });

  it("rejects duplicate headers, malformed rows, missing required mappings, and unsafe file sizes", () => {
    const duplicate = parseUploadCsv({
      filename: "orders.csv",
      sizeBytes: 20,
      text: "Order,order\n1,2",
    });
    expect(duplicate.status).toBe("error");
    const malformed = parseUploadCsv({ filename: "orders.csv", sizeBytes: 20, text: "a,b\n1,2,3" });
    expect(malformed.status).toBe("error");
    expect(validateUploadFile({ name: "orders.xlsx", sizeBytes: 10 })[0]?.code).toBe(
      "unsupported_file_type",
    );
    expect(validateUploadFile({ name: "orders.csv", sizeBytes: 9 * 1024 * 1024 })[0]?.code).toBe(
      "file_too_large",
    );
    const parsed = parsedFixture();
    const prepared = prepareUploadedDataset({
      parsed,
      mapping: {},
      transformations: { ...DEFAULT_TRANSFORMATIONS, dateFormat: "mdy" },
    });
    expect(prepared.issues.some((issue) => issue.code === "required_target_unmapped")).toBe(true);
  });

  it("keeps formula-like strings inert, surfaces their warning, and retains field audit values", () => {
    const csv = `${renamedHeader}\n00001,ORD-0001,2025-01-02,0007,,SKU-01,"=HYPERLINK(""https://bad"")",Home,West,Web,2,10,6,1,19,12,,0`;
    const parsed = parsedFixture(csv);
    const mapping = mappingFromSuggestions(suggestUploadMappings(parsed));
    const prepared = prepareUploadedDataset({ parsed, mapping });
    const productAudit = prepared.rows[0]?.audit.product_name;
    expect(productAudit?.originalValue).toBe('=HYPERLINK("https://bad")');
    expect(prepared.issues.some((issue) => issue.code === "formula_like_cell")).toBe(true);
    expect(prepared.rows[0]?.disposition).toBe("accepted_with_warning");
  });
});
