"use client";

import { ArrowUpRight, FileSearch, Info, ShieldAlert } from "lucide-react";

import type { Finding, FindingsResult } from "@/findings";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { formatMetricValue } from "@/features/dashboard/presentation-formatters";

const severityVariant = {
  critical: "destructive",
  high: "destructive",
  medium: "warning",
  low: "neutral",
  informational: "primary",
} as const;

function FindingIcon({ category }: { readonly category: Finding["category"] }) {
  if (category === "risk" || category === "margin_issue" || category === "efficiency_issue")
    return <ShieldAlert aria-hidden="true" className="size-4" />;
  if (category === "opportunity") return <ArrowUpRight aria-hidden="true" className="size-4" />;
  return <Info aria-hidden="true" className="size-4" />;
}

function readableCategory(category: Finding["category"]): string {
  return category.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function FindingsPanel({
  findings,
  onInspect,
}: {
  readonly findings: FindingsResult | undefined;
  readonly onInspect: (finding: Finding) => void;
}) {
  if (!findings) return null;
  return (
    <section aria-labelledby="key-findings-title" aria-live="polite">
      <SectionHeader
        title="What deserves attention?"
        titleId="key-findings-title"
        description="Prioritized deterministic observations from the active filter context. They describe signals; they do not explain causes or prescribe actions."
      />
      {findings.findings.length === 0 ? (
        <Card className="mt-4 p-5" role="status">
          <p className="font-semibold">No material findings for this selection</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Available signals did not meet the documented materiality and evidence thresholds.
          </p>
        </Card>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {findings.findings.map((finding) => (
            <Card key={finding.findingId} className="flex flex-col gap-4 p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="bg-surface-subtle text-primary flex size-9 shrink-0 items-center justify-center rounded-button">
                    <FindingIcon category={finding.category} />
                  </span>
                  <div>
                    <p className="text-muted-foreground text-xs font-semibold">
                      {readableCategory(finding.category)}
                    </p>
                    <h3 className="mt-1 text-base font-semibold tracking-[-0.015em]">
                      {finding.title}
                    </h3>
                  </div>
                </div>
                <Badge variant={severityVariant[finding.severity]}>
                  {finding.severity} priority
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm leading-6">{finding.summary}</p>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-foreground text-sm font-semibold tabular-nums">
                  {formatMetricValue(finding.currentValue)}
                </p>
                <Button size="sm" variant="ghost" onClick={() => onInspect(finding)}>
                  <FileSearch aria-hidden="true" className="size-4" />
                  Details
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
