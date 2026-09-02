"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileUp, ShieldCheck } from "lucide-react";

import type { ValidatedDataset } from "@/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CANONICAL_UPLOAD_FIELDS,
  DEFAULT_TRANSFORMATIONS,
  decodeUtf8Csv,
  mappingFromSuggestions,
  parseUploadCsv,
  prepareUploadedDataset,
  suggestUploadMappings,
  UPLOAD_LIMITS,
  type CanonicalUploadField,
  type ParsedUpload,
  type TransformationSettings,
  type UploadIssue,
  type UploadMapping,
} from "@/features/ingestion/ingestion-core";

const STEPS = [
  "Choose data",
  "Preview file",
  "Map columns",
  "Review quality",
  "Transform",
  "Reconcile",
  "Open dashboard",
] as const;
type Step = (typeof STEPS)[number];

const FOUNDER_STEP_LABEL: Readonly<Record<Step, string>> = Object.freeze({
  "Choose data": "Upload file",
  "Preview file": "Check file",
  "Map columns": "Match columns",
  "Review quality": "Data check",
  Transform: "Prepare data",
  Reconcile: "Check totals",
  "Open dashboard": "View insights",
});

const FOUNDER_PROGRESS: readonly { readonly label: string; readonly steps: readonly Step[] }[] =
  Object.freeze([
    { label: "Upload file", steps: ["Choose data", "Preview file"] },
    { label: "Check your data", steps: ["Map columns", "Review quality", "Transform"] },
    { label: "Review your totals", steps: ["Reconcile"] },
    { label: "See your insights", steps: ["Open dashboard"] },
  ]);

function formatBytes(bytes: number) {
  return `${(bytes / 1024).toFixed(bytes < 1024 * 1024 ? 0 : 1)} KB`;
}

function IssueList({ issues }: { readonly issues: readonly UploadIssue[] }) {
  const [filter, setFilter] = useState<"all" | "error" | "warning">("all");
  const visible = issues
    .filter((item) => filter === "all" || item.severity === filter)
    .slice(0, 100);
  return (
    <section aria-labelledby="upload-issues-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="upload-issues-title" className="text-base font-semibold">
          Row-level review
        </h3>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Show
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            className="border-border bg-surface rounded-md border px-2 py-1"
          >
            <option value="all">All issues</option>
            <option value="error">Blocking errors</option>
            <option value="warning">Warnings</option>
          </select>
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">No matching issues.</p>
      ) : (
        <div className="border-border overflow-x-auto rounded-card border">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <caption className="sr-only">Issues found while preparing the uploaded CSV</caption>
            <thead className="bg-surface-subtle text-muted-foreground text-xs">
              <tr>
                <th className="p-3">Severity</th>
                <th className="p-3">Row</th>
                <th className="p-3">Field</th>
                <th className="p-3">Explanation</th>
                <th className="p-3">Source value</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className="border-border border-t align-top">
                  <td className="p-3">
                    <Badge
                      variant={
                        item.severity === "error"
                          ? "destructive"
                          : item.severity === "warning"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {item.severity}
                    </Badge>
                  </td>
                  <td className="p-3">{item.rowNumber ?? "—"}</td>
                  <td className="p-3">{item.field ?? "—"}</td>
                  <td className="p-3">{item.message}</td>
                  <td className="p-3 font-mono text-xs break-all">{item.sourceValue ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {issues.length > visible.length ? (
        <p className="text-muted-foreground text-xs">
          Showing the first {visible.length} matching issues to keep this review responsive.
        </p>
      ) : null}
    </section>
  );
}

function Stepper({ step }: { readonly step: Step }) {
  const index = FOUNDER_PROGRESS.findIndex((item) => item.steps.includes(step));
  return (
    <ol aria-label="Upload progress" className="grid gap-2 sm:grid-cols-4">
      {FOUNDER_PROGRESS.map((item, itemIndex) => (
        <li
          key={item.label}
          className={`rounded-md px-2 py-2 text-xs font-medium ${itemIndex === index ? "bg-primary text-primary-foreground" : itemIndex < index ? "bg-success-subtle text-success-strong" : "bg-surface-subtle text-muted-foreground"}`}
          aria-current={itemIndex === index ? "step" : undefined}
        >
          <span className="mr-1">{itemIndex < index ? "✓" : itemIndex + 1}.</span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}

function Preview({ parsed }: { readonly parsed: ParsedUpload }) {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Rows</p>
          <p className="mt-1 text-xl font-semibold">{parsed.records.length.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Columns</p>
          <p className="mt-1 text-xl font-semibold">{parsed.columns.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Delimiter</p>
          <p className="mt-1 text-xl font-semibold">
            {parsed.delimiter === "\t" ? "Tab" : parsed.delimiter}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Duplicate raw rows</p>
          <p className="mt-1 text-xl font-semibold">{parsed.duplicateRawRowCount}</p>
        </Card>
      </div>
      <div className="border-border overflow-x-auto rounded-card border">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <caption className="sr-only">First rows of the uploaded CSV</caption>
          <thead className="bg-surface-subtle text-muted-foreground text-xs">
            <tr>
              {parsed.columns.map((column) => (
                <th key={column.name} className="p-3">
                  <span className="block">{column.name}</span>
                  <span className="font-normal">
                    {column.inferredType} · {column.missingCount} blank
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.preview.map((record) => (
              <tr key={record.sourceRowNumber} className="border-border border-t">
                {parsed.columns.map((column) => (
                  <td
                    key={column.name}
                    className="max-w-44 truncate p-3"
                    title={record.values[column.name]}
                  >
                    {record.values[column.name] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function UploadWorkflow({
  onComplete,
  onCancel,
}: {
  readonly onComplete: (dataset: ValidatedDataset, filename: string) => void;
  readonly onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("Choose data");
  const [parsed, setParsed] = useState<ParsedUpload | null>(null);
  const [mapping, setMapping] = useState<UploadMapping>({});
  const [transformations, setTransformations] =
    useState<TransformationSettings>(DEFAULT_TRANSFORMATIONS);
  const [allowExclusions, setAllowExclusions] = useState(false);
  const [fileIssues, setFileIssues] = useState<readonly UploadIssue[]>([]);
  const preparation = useMemo(
    () =>
      parsed
        ? prepareUploadedDataset({
            parsed,
            mapping,
            transformations,
            allowRowExclusions: allowExclusions,
          })
        : null,
    [allowExclusions, mapping, parsed, transformations],
  );
  const stepIndex = STEPS.indexOf(step);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    const decoded = decodeUtf8Csv(await file.arrayBuffer());
    if (decoded.status === "error") {
      setFileIssues([decoded.issue]);
      return;
    }
    const parsedResult = parseUploadCsv({
      filename: file.name,
      sizeBytes: file.size,
      text: decoded.text,
    });
    if (parsedResult.status === "error") {
      setParsed(null);
      setFileIssues(parsedResult.issues);
      return;
    }
    setFileIssues([]);
    setParsed(parsedResult.value);
    setMapping(mappingFromSuggestions(suggestUploadMappings(parsedResult.value)));
    setAllowExclusions(false);
    setStep("Preview file");
  }
  function updateMapping(target: CanonicalUploadField, sourceColumn: string | null) {
    setMapping((current) => ({ ...current, [target]: sourceColumn }));
  }
  function next() {
    const target = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)];
    if (target) setStep(target);
  }
  function previous() {
    const target = STEPS[Math.max(stepIndex - 1, 0)];
    if (target) setStep(target);
  }
  const errorCount = preparation?.issues.filter((item) => item.severity === "error").length ?? 0;
  const mappingErrorCount =
    preparation?.issues.filter((item) => item.severity === "error" && item.category === "mapping")
      .length ?? 0;
  const isReadyToAnalyze = preparation?.readiness.status === "ready";
  const readinessReturnStep =
    preparation && preparation.readiness.status !== "ready"
      ? preparation.readiness.returnStep
      : null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-semibold">Your data, in this browser session</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">
            Bring your sales data to life
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Your raw file and sales rows stay in this browser session. AI is optional: if you ask
            for an explanation and approve the privacy review, InsightAI may send only the small,
            reviewed summary needed for that explanation—not your raw file or rows.
          </p>
        </div>
        <Button variant="ghost" onClick={onCancel}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to workspace
        </Button>
      </div>
      <Stepper step={step} />
      {step === "Choose data" ? (
        <Card className="p-6">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void chooseFile(event.dataTransfer.files[0]);
            }}
            className="border-border flex min-h-64 flex-col items-center justify-center rounded-card border border-dashed p-6 text-center"
          >
            <FileUp aria-hidden="true" className="text-primary size-10" />
            <h2 className="mt-4 text-lg font-semibold">
              Drop your sales CSV here or choose a file
            </h2>
            <p className="text-muted-foreground mt-2 max-w-md text-sm">
              UTF-8 CSV only, up to {UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB and{" "}
              {UPLOAD_LIMITS.maxRows.toLocaleString()} rows. Your file is not stored by InsightAI.
            </p>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
            <Button className="mt-5" onClick={() => inputRef.current?.click()}>
              Choose CSV
            </Button>
          </div>
          {fileIssues.length ? (
            <div className="mt-5">
              <IssueList issues={fileIssues} />
            </div>
          ) : null}
        </Card>
      ) : null}
      {parsed && step === "Preview file" ? (
        <Card className="p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{parsed.filename}</h2>
              <p className="text-muted-foreground text-sm">
                {formatBytes(parsed.sizeBytes)} · Suggestions are not authoritative.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setParsed(null);
                setStep("Choose data");
              }}
            >
              Replace file
            </Button>
          </div>
          <Preview parsed={parsed} />
        </Card>
      ) : null}
      {parsed && step === "Map columns" ? (
        <Card className="p-5">
          <div className="mb-5">
            <h2 className="text-lg font-semibold">Match your columns</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              We matched the columns we recognize. Review only anything that looks wrong; every
              match is editable.
            </p>
          </div>
          <div className="space-y-3">
            {CANONICAL_UPLOAD_FIELDS.map(([target, label, required]) => {
              const selected = mapping[target] ?? "";
              const source = parsed.columns.find((column) => column.name === selected);
              const mappedElsewhere = new Set(
                Object.entries(mapping)
                  .filter(([field, value]) => field !== target && value)
                  .map(([, value]) => value),
              );
              return (
                <div
                  key={target}
                  className="border-border grid gap-2 rounded-card border p-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1fr)_minmax(10rem,auto)] sm:items-center"
                >
                  <div>
                    <p className="font-medium">
                      {label}{" "}
                      {required ? (
                        <span className="text-destructive-strong">*</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">optional</span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">{target}</p>
                  </div>
                  <label className="sr-only" htmlFor={`mapping-${target}`}>
                    {label} source column
                  </label>
                  <select
                    id={`mapping-${target}`}
                    value={selected}
                    onChange={(event) => updateMapping(target, event.target.value || null)}
                    className="border-border bg-surface rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="">Not mapped</option>
                    {parsed.columns.map((column) => (
                      <option
                        key={column.name}
                        value={column.name}
                        disabled={mappedElsewhere.has(column.name)}
                      >
                        {column.name} · {column.inferredType}
                      </option>
                    ))}
                  </select>
                  <Badge variant={selected ? "success" : required ? "destructive" : "neutral"}>
                    {selected
                      ? (source?.inferredType ?? "mapped")
                      : required
                        ? "required"
                        : "optional"}
                  </Badge>
                </div>
              );
            })}
          </div>
          {preparation ? (
            <div className="mt-5">
              <IssueList
                issues={preparation.issues.filter((issue) => issue.category === "mapping")}
              />
            </div>
          ) : null}
        </Card>
      ) : null}
      {parsed && preparation && step === "Review quality" ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Data check</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                We stop only for issues that would make your results unreliable. Warnings remain
                visible and never add or guess values.
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant={errorCount ? "destructive" : "success"}>{errorCount} blocking</Badge>
              <Badge variant="warning">{preparation.reconciliation.warningCount} warnings</Badge>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-muted-foreground text-xs">Accepted</p>
              <p className="text-xl font-semibold">
                {preparation.reconciliation.acceptedRows +
                  preparation.reconciliation.acceptedWithWarningsRows}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-muted-foreground text-xs">Rejected</p>
              <p className="text-xl font-semibold">{preparation.reconciliation.rejectedRows}</p>
            </Card>
            <Card className="p-4">
              <p className="text-muted-foreground text-xs">Source rows</p>
              <p className="text-xl font-semibold">{preparation.reconciliation.sourceRowCount}</p>
            </Card>
          </div>
          <div className="mt-5">
            <IssueList issues={preparation.issues} />
          </div>
        </Card>
      ) : null}
      {parsed && preparation && step === "Transform" ? (
        <Card className="space-y-5 p-5">
          <div>
            <h2 className="text-lg font-semibold">Prepare your data</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Original values remain available in the review. Nothing is silently imputed or
              deleted.
            </p>
          </div>
          <fieldset className="space-y-3">
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={transformations.trimWhitespace}
                onChange={(event) =>
                  setTransformations((current) => ({
                    ...current,
                    trimWhitespace: event.target.checked,
                  }))
                }
              />
              Trim surrounding whitespace
            </label>
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={transformations.parseCurrencyFormatting}
                onChange={(event) =>
                  setTransformations((current) => ({
                    ...current,
                    parseCurrencyFormatting: event.target.checked,
                  }))
                }
              />
              Remove configured currency symbols and grouping separators
            </label>
            <label className="flex flex-wrap items-center gap-3 text-sm">
              Numeric date interpretation{" "}
              <select
                value={transformations.dateFormat}
                onChange={(event) =>
                  setTransformations((current) => ({
                    ...current,
                    dateFormat: event.target.value as TransformationSettings["dateFormat"],
                  }))
                }
                className="border-border bg-surface rounded-md border px-2 py-1"
              >
                <option value="auto">Auto (reject ambiguous)</option>
                <option value="mdy">Month / day / year</option>
                <option value="dmy">Day / month / year</option>
                <option value="ymd">Year / month / day</option>
              </select>
            </label>
          </fieldset>
          {preparation.reconciliation.rejectedRows > 0 ? (
            <label className="bg-warning-subtle flex gap-3 rounded-card p-4 text-sm">
              <input
                type="checkbox"
                checked={allowExclusions}
                onChange={(event) => setAllowExclusions(event.target.checked)}
              />
              <span>
                <strong>Explicitly exclude rejected rows.</strong>
                <br />
                {preparation.reconciliation.rejectedRows} rows would be excluded. Their original
                values and issue records stay visible during this session.
              </span>
            </label>
          ) : null}
          <IssueList
            issues={preparation.issues.filter(
              (issue) => issue.category === "transformation" || issue.category === "security",
            )}
          />
        </Card>
      ) : null}
      {parsed && preparation && step === "Reconcile" ? (
        <Card className="space-y-5 p-5">
          <div>
            <h2 className="text-lg font-semibold">Check your totals</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Review what InsightAI will analyze after the choices you made above.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Source rows", preparation.reconciliation.sourceRowCount],
              ["Analyzed sales rows", preparation.reconciliation.canonicalOrderLines],
              ["Distinct orders", preparation.reconciliation.distinctOrders],
              ["Customers", preparation.reconciliation.distinctCustomers],
              [
                "Revenue",
                `$${(preparation.reconciliation.totals.revenueCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
              ],
              [
                "Gross profit",
                `$${(preparation.reconciliation.totals.grossProfitCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
              ],
              [
                "Discounts",
                `$${(preparation.reconciliation.totals.discountsCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
              ],
              [
                "Marketing spend",
                `$${(preparation.reconciliation.totals.marketingSpendCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
              ],
            ].map(([label, value]) => (
              <Card key={String(label)} className="p-4">
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </Card>
            ))}
          </div>
          <div className="text-muted-foreground rounded-card bg-surface-subtle p-4 text-sm">
            Date range:{" "}
            {preparation.reconciliation.dateRange
              ? `${preparation.reconciliation.dateRange.start} to ${preparation.reconciliation.dateRange.end}`
              : "Not available"}
            . Unmapped source columns:{" "}
            {preparation.reconciliation.unmappedSourceColumns.length
              ? preparation.reconciliation.unmappedSourceColumns.join(", ")
              : "None"}
            . Extra source columns are not required for analysis unless you map them.
          </div>
          {isReadyToAnalyze ? (
            <div className="bg-success-subtle flex gap-3 rounded-card p-4 text-sm">
              <ShieldCheck aria-hidden="true" className="text-success-strong mt-0.5 size-5" />
              {preparation.readiness.message}
            </div>
          ) : (
            <div className="bg-destructive-subtle flex gap-3 rounded-card p-4 text-sm">
              <AlertTriangle aria-hidden="true" className="text-destructive-strong mt-0.5 size-5" />
              <div>
                <p className="font-semibold">{preparation.readiness.title}</p>
                <p className="mt-1">{preparation.readiness.message}</p>
                {readinessReturnStep ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="secondary"
                    onClick={() => setStep(readinessReturnStep)}
                  >
                    Return to {FOUNDER_STEP_LABEL[readinessReturnStep]}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </Card>
      ) : null}
      {parsed && preparation && step === "Open dashboard" ? (
        <Card className="p-6 text-center">
          {isReadyToAnalyze ? (
            <Check aria-hidden="true" className="text-success-strong mx-auto size-10" />
          ) : (
            <AlertTriangle aria-hidden="true" className="text-destructive-strong mx-auto size-10" />
          )}
          <h2 className="mt-3 text-xl font-semibold">{preparation.readiness.title}</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm">
            {isReadyToAnalyze
              ? "The uploaded dataset is session-only and will be analyzed through InsightAI’s existing deterministic engine. Switching datasets resets dashboard filters."
              : preparation.readiness.message}
          </p>
          <Button
            className="mt-5"
            disabled={!isReadyToAnalyze || !preparation.dataset}
            onClick={() => preparation.dataset && onComplete(preparation.dataset, parsed.filename)}
          >
            See my business insights
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </Card>
      ) : null}
      {step !== "Choose data" ? (
        <div className="sticky bottom-3 flex justify-between rounded-card border border-border bg-surface/95 p-3 shadow-card backdrop-blur">
          <Button variant="ghost" onClick={previous}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back
          </Button>
          {step === "Open dashboard" ? (
            <Button variant="ghost" onClick={() => setStep("Reconcile")}>
              Review data check
            </Button>
          ) : (
            <Button
              disabled={
                (step === "Map columns" && mappingErrorCount > 0) ||
                (step === "Reconcile" && !isReadyToAnalyze)
              }
              onClick={next}
            >
              Continue
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      ) : null}
    </main>
  );
}
