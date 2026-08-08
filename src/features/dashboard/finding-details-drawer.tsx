"use client";

import { useEffect, useRef } from "react";
import { FileSearch, X } from "lucide-react";

import type { Finding } from "@/findings";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCount, formatMetricValue } from "@/features/dashboard/presentation-formatters";

export function FindingDetailsDrawer({
  finding,
  onClose,
}: {
  readonly finding: Finding | null;
  readonly onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (finding) {
      priorFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeRef.current?.focus();
    } else {
      priorFocus.current?.focus();
      priorFocus.current = null;
    }
  }, [finding]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && finding) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [finding, onClose]);
  if (!finding) return null;
  const primaryEvidence = finding.evidence[0];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Finding details: ${finding.title}`}
      className="fixed inset-0 z-50 flex justify-end bg-foreground/25"
    >
      <button
        type="button"
        aria-label="Dismiss finding details"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="bg-surface relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border shadow-overlay sm:rounded-card sm:border">
        <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-button">
              <FileSearch aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs font-semibold">Finding details</p>
              <h2 className="mt-1 text-lg font-semibold">{finding.title}</h2>
            </div>
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            aria-label="Close finding details"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="space-y-5 px-5 py-5 text-sm sm:px-6">
          <section>
            <p className="font-semibold">What happened</p>
            <p className="text-muted-foreground mt-2 leading-6">{finding.summary}</p>
          </section>
          <section className="bg-surface-subtle rounded-card p-4">
            <p className="font-semibold">Why this was flagged</p>
            <p className="text-muted-foreground mt-2 leading-6">{finding.explanation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="neutral">{finding.evidenceStrength} evidence</Badge>
              <Badge variant="primary">Rule {finding.ruleId}</Badge>
            </div>
          </section>
          <section>
            <p className="font-semibold">Supporting metrics</p>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-surface-subtle rounded-button p-3">
                <dt className="text-muted-foreground text-xs">Current value</dt>
                <dd className="mt-1 font-semibold">{formatMetricValue(finding.currentValue)}</dd>
              </div>
              <div className="bg-surface-subtle rounded-button p-3">
                <dt className="text-muted-foreground text-xs">Comparison value</dt>
                <dd className="mt-1 font-semibold">{formatMetricValue(finding.comparisonValue)}</dd>
              </div>
              <div className="bg-surface-subtle rounded-button p-3">
                <dt className="text-muted-foreground text-xs">Matching lines</dt>
                <dd className="mt-1 font-semibold">
                  {primaryEvidence ? formatCount(primaryEvidence.matchingRowCount) : "—"}
                </dd>
              </div>
              <div className="bg-surface-subtle rounded-button p-3">
                <dt className="text-muted-foreground text-xs">Distinct orders</dt>
                <dd className="mt-1 font-semibold">
                  {primaryEvidence ? formatCount(primaryEvidence.distinctOrderCount) : "—"}
                </dd>
              </div>
            </dl>
          </section>
          <details className="border-border rounded-card border p-4">
            <summary className="cursor-pointer font-semibold">Rule and evidence details</summary>
            <dl className="text-muted-foreground mt-4 space-y-3 leading-6">
              <div>
                <dt className="font-medium text-foreground">Rule version</dt>
                <dd>{finding.ruleVersion}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Thresholds</dt>
                <dd className="break-words font-mono text-xs">
                  {JSON.stringify(finding.thresholds)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Evidence IDs</dt>
                <dd className="break-all font-mono text-xs">
                  {finding.evidence.map((item) => item.evidenceId).join(", ")}
                </dd>
              </div>
            </dl>
          </details>
        </div>
      </aside>
    </div>
  );
}
