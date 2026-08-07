"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, FileSearch, X } from "lucide-react";

import type { EvidenceReference } from "@/analytics";

import { Button } from "@/components/ui/button";
import { formatCount } from "@/features/dashboard/presentation-formatters";

export type EvidenceSelection = {
  readonly title: string;
  readonly description: string;
  readonly evidence: EvidenceReference;
  readonly periodLabel: string;
};

type EvidenceDrawerProps = {
  readonly selection: EvidenceSelection | null;
  readonly onClose: () => void;
};

type DetailSectionProps = {
  readonly title: string;
  readonly children: React.ReactNode;
};

function DetailSection({ children, title }: DetailSectionProps) {
  return (
    <details className="group border-border rounded-card border p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden="true"
          className="text-muted-foreground size-4 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export function EvidenceDrawer({ selection, onClose }: EvidenceDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (selection) {
      const activeElement = document.activeElement;
      previousFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      closeButtonRef.current?.focus();
      return;
    }
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }, [selection]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selection) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, selection]);

  if (!selection) return null;
  const { evidence } = selection;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence details: ${selection.title}`}
      className="fixed inset-0 z-50 flex justify-end bg-foreground/25 p-0 sm:p-4"
    >
      <button
        type="button"
        aria-label="Dismiss evidence panel"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="bg-surface relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border shadow-overlay sm:rounded-card sm:border 2xl:max-w-[46rem]">
        <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-button">
              <FileSearch aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs font-semibold">Evidence details</p>
              <h2
                id="evidence-details-title"
                className="mt-1 text-lg font-semibold tracking-[-0.02em]"
              >
                {selection.title}
              </h2>
            </div>
          </div>
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            aria-label="Close evidence details"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <section aria-labelledby="evidence-summary-heading">
            <h3 id="evidence-summary-heading" className="text-sm font-semibold">
              Summary
            </h3>
            <p className="text-muted-foreground mt-2 text-sm leading-6">{selection.description}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="bg-surface-subtle rounded-button p-3">
                <dt className="text-muted-foreground text-xs">Selected period</dt>
                <dd className="mt-1 font-semibold">{selection.periodLabel}</dd>
              </div>
              <div className="bg-surface-subtle rounded-button p-3">
                <dt className="text-muted-foreground text-xs">Matching lines</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {formatCount(evidence.matchingRowCount)}
                </dd>
              </div>
              <div className="bg-surface-subtle rounded-button p-3">
                <dt className="text-muted-foreground text-xs">Distinct orders</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {formatCount(evidence.distinctOrderCount)}
                </dd>
              </div>
              <div className="bg-surface-subtle rounded-button p-3">
                <dt className="text-muted-foreground text-xs">Segments included</dt>
                <dd className="mt-1 font-semibold">{evidence.segmentKeys.length || "All"}</dd>
              </div>
            </dl>
          </section>

          <DetailSection title="Calculation details">
            <dl className="text-muted-foreground space-y-4 text-sm leading-6">
              <div>
                <dt className="font-medium text-foreground">Segment selection</dt>
                <dd className="mt-1">{evidence.segmentKeys.join(", ") || "Whole selection"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Metric inputs</dt>
                <dd className="mt-1">
                  {evidence.metricDependencies.join(", ") || "Not applicable"}
                </dd>
              </div>
              <div className="border-border grid grid-cols-2 gap-3 border-t pt-4 text-xs">
                <div>
                  <dt>Dataset version</dt>
                  <dd className="mt-1 break-all font-mono text-foreground">
                    {evidence.datasetVersion}
                  </dd>
                </div>
                <div>
                  <dt>Engine version</dt>
                  <dd className="mt-1 font-mono text-foreground">{evidence.engineVersion}</dd>
                </div>
              </div>
            </dl>
          </DetailSection>

          <DetailSection title="Evidence and source details">
            <p className="text-muted-foreground text-xs leading-5">
              A compact sample lets you inspect supporting records without loading every matching
              record.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-xs font-semibold">Order-line IDs</h3>
                <p className="text-muted-foreground mt-1 break-words font-mono text-xs leading-5">
                  {evidence.sampleOrderLineIds.join(", ") || "No matching records"}
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold">Order IDs</h3>
                <p className="text-muted-foreground mt-1 break-words font-mono text-xs leading-5">
                  {evidence.sampleOrderIds.join(", ") || "No matching records"}
                </p>
              </div>
              {evidence.truncated ? (
                <p className="text-muted-foreground text-xs">
                  Samples are capped at {evidence.sampleLimit} identifiers per type.
                </p>
              ) : null}
              <div className="border-border border-t pt-4">
                <h3 className="text-xs font-semibold">Evidence reference</h3>
                <p className="text-muted-foreground mt-1 break-all font-mono text-xs">
                  {evidence.evidenceId}
                </p>
              </div>
            </div>
          </DetailSection>
        </div>
      </aside>
    </div>
  );
}
