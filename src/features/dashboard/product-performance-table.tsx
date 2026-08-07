import type { BreakdownResult } from "@/analytics";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { asComputableBreakdown } from "@/features/dashboard/analytics-adapter";
import type { EvidenceSelection } from "@/features/dashboard/evidence-drawer";
import {
  formatCount,
  formatCurrencyCents,
  formatRate,
  formatSignedRate,
} from "@/features/dashboard/presentation-formatters";

type ProductPerformanceTableProps = {
  readonly breakdown: BreakdownResult;
  readonly periodLabel: string;
  readonly onInspectEvidence: (selection: EvidenceSelection) => void;
};

function marginBadge(
  entry: NonNullable<ReturnType<typeof asComputableBreakdown>>["entries"][number],
) {
  if (entry.grossMargin.kind !== "rate") return <Badge variant="neutral">Margin unavailable</Badge>;
  if (entry.grossMargin.basisPoints < 0)
    return <Badge variant="destructive">Negative margin</Badge>;
  return <Badge variant="success">Positive margin</Badge>;
}

export function ProductPerformanceTable({
  breakdown,
  onInspectEvidence,
  periodLabel,
}: ProductPerformanceTableProps) {
  const computed = asComputableBreakdown(breakdown);
  if (!computed) {
    return (
      <Card className="p-5 shadow-card sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">
          Which products combine revenue with healthy margins?
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          {breakdown.status === "ok" ? "No product values are available." : breakdown.message}
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden shadow-card">
      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em]">
            Which products combine revenue with healthy margins?
          </h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-6">
            Ranked by revenue. Margin labels supplement, rather than replace, the exact value.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onInspectEvidence({
              title: "Product performance",
              description: "Review the product rows included in the active selection.",
              evidence: computed.evidence,
              periodLabel,
            })
          }
        >
          Inspect table evidence
        </Button>
      </div>
      <div className="border-border overflow-x-auto border-t">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="bg-surface-subtle text-muted-foreground text-xs">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                Product
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Revenue
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Share
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Gross profit
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Margin
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Orders
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Quantity
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Comparison
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {computed.entries.map((entry) => (
              <tr
                key={entry.key}
                className="border-border border-t align-top hover:bg-surface-subtle/60"
              >
                <th scope="row" className="px-5 py-4 font-semibold sm:px-6">
                  {entry.label}
                  <span className="text-muted-foreground mt-1 block text-xs font-medium">
                    {entry.key}
                  </span>
                </th>
                <td className="px-3 py-4 tabular-nums">{formatCurrencyCents(entry.revenue)}</td>
                <td className="px-3 py-4 tabular-nums">
                  {entry.revenueShare.kind === "rate" ? formatRate(entry.revenueShare) : "—"}
                </td>
                <td className="px-3 py-4 tabular-nums">{formatCurrencyCents(entry.grossProfit)}</td>
                <td className="px-3 py-4">
                  <span className="block tabular-nums">
                    {entry.grossMargin.kind === "rate" ? formatRate(entry.grossMargin) : "—"}
                  </span>
                  <span className="mt-1 inline-block">{marginBadge(entry)}</span>
                </td>
                <td className="px-3 py-4 tabular-nums">{formatCount(entry.orders)}</td>
                <td className="px-3 py-4 tabular-nums">{formatCount(entry.quantity)}</td>
                <td className="px-3 py-4 tabular-nums">
                  {entry.comparison?.percentageRevenueChange.kind === "rate"
                    ? formatSignedRate(entry.comparison.percentageRevenueChange)
                    : "—"}
                </td>
                <td className="px-5 py-4 text-right sm:px-6">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onInspectEvidence({
                        title: entry.label,
                        description: "Review the records included in this product's performance.",
                        evidence: entry.evidence,
                        periodLabel,
                      })
                    }
                  >
                    Evidence
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
