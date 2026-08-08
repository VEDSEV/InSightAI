import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  DEFAULT_TRANSFORMATIONS,
  mappingFromSuggestions,
  parseUploadCsv,
  prepareUploadedDataset,
  suggestUploadMappings,
} from "../src/features/ingestion/ingestion-core.ts";

const source = readFileSync("data/sample/insightai-orders.csv", "utf8");
const header = source.split(/\r?\n/u, 1)[0] ?? "";
const rows = source.split(/\r?\n/u).slice(1).filter(Boolean);

function elapsed<T>(work: () => T): { readonly value: T; readonly milliseconds: number } {
  const started = performance.now();
  const value = work();
  return { value, milliseconds: performance.now() - started };
}

function benchmark(name: string, text: string): void {
  const parsedTiming = elapsed(() =>
    parseUploadCsv({
      filename: `${name}.csv`,
      sizeBytes: new TextEncoder().encode(text).byteLength,
      text,
    }),
  );
  const parsed = parsedTiming.value;
  if (parsed.status === "error") throw new Error(parsed.issues[0]?.message);
  const parsedUpload = parsed.value;
  const mappingTiming = elapsed(() => mappingFromSuggestions(suggestUploadMappings(parsedUpload)));
  const prepareTiming = elapsed(() =>
    prepareUploadedDataset({
      parsed: parsedUpload,
      mapping: mappingTiming.value,
      transformations: DEFAULT_TRANSFORMATIONS,
      allowRowExclusions: true,
    }),
  );
  const report = prepareTiming.value.reconciliation;
  console.log(
    JSON.stringify(
      {
        name,
        sourceRows: report.sourceRowCount,
        parseMs: Number(parsedTiming.milliseconds.toFixed(2)),
        mappingMs: Number(mappingTiming.milliseconds.toFixed(2)),
        transformationValidationAndReconciliationMs: Number(prepareTiming.milliseconds.toFixed(2)),
        canAnalyze: prepareTiming.value.canAnalyze,
      },
      null,
      2,
    ),
  );
}

benchmark("small", [header, ...rows.slice(0, 24)].join("\n"));
benchmark("phase2-sized", source);
benchmark(
  "50k-shape",
  [
    header,
    ...Array.from({ length: 8 }, () => rows)
      .flat()
      .slice(0, 50_000),
  ].join("\n"),
);
