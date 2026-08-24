// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createAnalyticsEngine } from "@/analytics";
import { createEvidencePacket } from "@/ai/evidence-packet";
import { MAX_EVIDENCE_PACKET_BYTES } from "@/ai/types";
import { createFindingsEngine } from "@/findings";
import {
  DEFAULT_TRANSFORMATIONS,
  mappingFromSuggestions,
  parseUploadCsv,
  prepareUploadedDataset,
  suggestUploadMappings,
} from "@/features/ingestion/ingestion-core";

const fixtureText = readFileSync(
  new URL("fixtures/ingestion/phase7-ai-consent-qa.csv", import.meta.url),
  "utf8",
);

function prepareFixture() {
  const parsed = parseUploadCsv({
    filename: "phase7-ai-consent-qa.csv",
    sizeBytes: new TextEncoder().encode(fixtureText).byteLength,
    text: fixtureText,
  });
  if (parsed.status === "error")
    throw new Error(parsed.issues.map((issue) => issue.message).join(" "));
  const prepared = prepareUploadedDataset({
    parsed: parsed.value,
    mapping: mappingFromSuggestions(suggestUploadMappings(parsed.value)),
    transformations: DEFAULT_TRANSFORMATIONS,
  });
  if (!prepared.dataset) throw new Error("The Phase 7 AI consent QA fixture must validate.");
  return prepared;
}

describe("Phase 7 uploaded AI-consent QA fixture", () => {
  it("maps and validates cleanly, then produces a supported Web concentration finding", () => {
    const prepared = prepareFixture();

    expect(prepared.readiness.status).toBe("ready");
    expect(prepared.reconciliation).toMatchObject({
      sourceRowCount: 14,
      canonicalOrderLines: 14,
      distinctOrders: 14,
      distinctCustomers: 14,
      rejectedRows: 0,
      blockingIssueCount: 0,
    });
    expect(prepared.dataset?.metadata.dateRange).toMatchObject({
      start: "2024-01-15",
      end: "2025-12-10",
    });

    const dataset = prepared.dataset!;
    const findings = createFindingsEngine(createAnalyticsEngine(dataset), dataset).generate({
      filter: { period: dataset.metadata.dateRange },
    });
    const web = findings.findings.find(
      (finding) =>
        finding.findingType === "revenue_concentration" &&
        finding.affectedDimension === "channel" &&
        finding.affectedSegment === "Web",
    );

    expect(web?.summary).toBe("Web accounts for 85.7% of revenue in the active selection.");
    expect(web?.currentValue).toMatchObject({ kind: "rate", basisPoints: 8571 });
    expect(web?.evidence[0]).toMatchObject({ matchingRowCount: 12, distinctOrderCount: 12 });
  });

  it("keeps fixture identifiers and raw rows out of the uploaded-data AI evidence packet", () => {
    const dataset = prepareFixture().dataset!;
    const findings = createFindingsEngine(createAnalyticsEngine(dataset), dataset).generate({
      filter: { period: dataset.metadata.dateRange },
    });
    const finding = findings.findings.find(
      (candidate) =>
        candidate.findingType === "revenue_concentration" &&
        candidate.affectedDimension === "channel" &&
        candidate.affectedSegment === "Web",
    );
    if (!finding)
      throw new Error("Expected the QA fixture to produce a Web concentration finding.");

    const serializedPacket = JSON.stringify(createEvidencePacket("phase7-qa-fixture", finding));
    expect(new TextEncoder().encode(serializedPacket).byteLength).toBeLessThanOrEqual(
      MAX_EVIDENCE_PACKET_BYTES,
    );
    expect(serializedPacket).not.toContain("QA-LINE-001");
    expect(serializedPacket).not.toContain("QA-ORDER-001");
    expect(serializedPacket).not.toContain("QA-CUSTOMER-001");
    expect(serializedPacket).not.toContain("Fixture Product 01");
    expect(serializedPacket).not.toContain("Line ID,Order,Order Date");
  });
});
