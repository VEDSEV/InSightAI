"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BreakdownResult, PerformanceTrendResult } from "@/analytics";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { asComputableBreakdown } from "@/features/dashboard/analytics-adapter";
import type { EvidenceSelection } from "@/features/dashboard/evidence-drawer";
import {
  formatCompactCurrencyCents,
  formatCount,
  formatCurrencyCents,
  formatRate,
} from "@/features/dashboard/presentation-formatters";

export function shouldDisableChartAnimation(prefersReducedMotion: boolean): boolean {
  return prefersReducedMotion;
}

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(shouldDisableChartAnimation(query.matches));
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

type RevenueTrendChartProps = {
  readonly trend: PerformanceTrendResult;
  readonly periodLabel: string;
  readonly onInspectEvidence: (selection: EvidenceSelection) => void;
};

export function RevenueTrendChart({
  trend,
  periodLabel,
  onInspectEvidence,
}: RevenueTrendChartProps) {
  const [measure, setMeasure] = useState<"revenue" | "grossProfit">("revenue");
  const reducedMotion = useReducedMotion();
  const chartData = trend.series.map((entry) => ({
    bucket: entry.key,
    revenue: entry.revenue,
    grossProfit: entry.grossProfit,
    orders: entry.orderCount,
  }));
  const measureLabel = measure === "revenue" ? "Revenue" : "Gross profit";

  return (
    <Card className="overflow-hidden p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em]">
            How is business performance changing over time?
          </h2>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-6">
            Monthly revenue and gross profit for the current selection.
          </p>
        </div>
        <div
          className="border-border bg-surface-subtle inline-flex self-start rounded-button border p-1"
          role="group"
          aria-label="Trend measure"
        >
          <Button
            size="sm"
            variant={measure === "revenue" ? "primary" : "ghost"}
            aria-pressed={measure === "revenue"}
            onClick={() => setMeasure("revenue")}
          >
            Revenue
          </Button>
          <Button
            size="sm"
            variant={measure === "grossProfit" ? "primary" : "ghost"}
            aria-pressed={measure === "grossProfit"}
            onClick={() => setMeasure("grossProfit")}
          >
            Gross profit
          </Button>
        </div>
      </div>

      <figure className="mt-6" aria-labelledby="trend-chart-summary">
        <figcaption id="trend-chart-summary" className="sr-only">
          {measureLabel} trend from {periodLabel}. The structured table below contains the essential
          monthly values.
        </figcaption>
        <div className="h-72 min-w-0" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="bucket"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={26}
              />
              <YAxis
                tickFormatter={(value: number) => formatCompactCurrencyCents(value)}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <RechartsTooltip
                formatter={(value, name) => [
                  formatCurrencyCents(Number(value ?? 0)),
                  name === "grossProfit" ? "Gross profit" : "Revenue",
                ]}
                labelFormatter={(label) => `Period beginning ${label}`}
                contentStyle={{
                  borderRadius: "0.625rem",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow-overlay)",
                }}
              />
              <Line
                type="linear"
                dataKey={measure}
                stroke={measure === "revenue" ? "var(--chart-1)" : "var(--chart-3)"}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={!reducedMotion}
                animationDuration={240}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          Showing {measureLabel.toLowerCase()} by {trend.frequency} bucket.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onInspectEvidence({
              title: `${measureLabel} trend`,
              description: "Review the period-by-period records behind this trend.",
              evidence: trend.evidence,
              periodLabel,
            })
          }
        >
          Inspect trend evidence
        </Button>
      </div>

      <details className="border-border mt-4 rounded-button border p-3">
        <summary className="cursor-pointer text-sm font-semibold">View trend data table</summary>
        <div className="mt-3 max-h-64 overflow-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="text-muted-foreground border-b border-border">
              <tr>
                <th className="px-2 py-2 font-semibold">Period</th>
                <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                <th className="px-2 py-2 text-right font-semibold">Gross profit</th>
                <th className="px-2 py-2 text-right font-semibold">Orders</th>
              </tr>
            </thead>
            <tbody>
              {trend.series.map((entry) => (
                <tr key={entry.key} className="border-b border-border/70 last:border-0">
                  <th scope="row" className="px-2 py-2 font-medium">
                    {entry.key}
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatCurrencyCents(entry.revenue)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatCurrencyCents(entry.grossProfit)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatCount(entry.orderCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

type BreakdownChartProps = {
  readonly title: string;
  readonly description: string;
  readonly breakdown: BreakdownResult;
  readonly periodLabel: string;
  readonly onInspectEvidence: (selection: EvidenceSelection) => void;
};

export function BreakdownChart({
  breakdown,
  description,
  onInspectEvidence,
  periodLabel,
  title,
}: BreakdownChartProps) {
  const computed = asComputableBreakdown(breakdown);
  const reducedMotion = useReducedMotion();
  if (!computed) {
    return (
      <Card className="p-5 shadow-card sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          {breakdown.status === "ok" ? "No breakdown values are available." : breakdown.message}
        </p>
      </Card>
    );
  }

  const visibleEntries = computed.entries.slice(0, 8);
  const chartData = visibleEntries.map((entry) => ({ label: entry.label, revenue: entry.revenue }));

  return (
    <Card className="min-w-0 overflow-hidden p-5 shadow-card sm:p-6">
      <div className="flex gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-6">{description}</p>
        </div>
        <Tooltip content="Bars use net revenue after explicit line discounts. The data table provides the exact values and shares." />
      </div>
      <figure className="mt-5" aria-labelledby={`${computed.dimension}-chart-summary`}>
        <figcaption id={`${computed.dimension}-chart-summary`} className="sr-only">
          Revenue by {computed.dimension}. The structured table below gives exact values and shares.
        </figcaption>
        <div className="h-64 min-w-0" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value: number) => formatCompactCurrencyCents(value)}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: "var(--foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={108}
              />
              <RechartsTooltip
                formatter={(value) => [formatCurrencyCents(Number(value ?? 0)), "Revenue"]}
                contentStyle={{
                  borderRadius: "0.625rem",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow-overlay)",
                }}
              />
              <Bar
                dataKey="revenue"
                fill="var(--chart-1)"
                radius={[0, 5, 5, 0]}
                isAnimationActive={!reducedMotion}
                animationDuration={220}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <div className="mt-3 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onInspectEvidence({
              title,
              description:
                "This ranked breakdown uses the same active filter context as every dashboard result.",
              evidence: computed.evidence,
              periodLabel,
            })
          }
        >
          Inspect breakdown evidence
        </Button>
      </div>
      <details className="border-border mt-3 rounded-button border p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          View breakdown data table
        </summary>
        <div className="mt-3 overflow-auto">
          <table className="w-full min-w-[30rem] text-left text-xs">
            <thead className="text-muted-foreground border-b border-border">
              <tr>
                <th className="px-2 py-2 font-semibold">Segment</th>
                <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                <th className="px-2 py-2 text-right font-semibold">Share</th>
                <th className="px-2 py-2 text-right font-semibold">Orders</th>
              </tr>
            </thead>
            <tbody>
              {computed.entries.map((entry) => (
                <tr key={entry.key} className="border-b border-border/70 last:border-0">
                  <th scope="row" className="px-2 py-2 font-medium">
                    {entry.label}
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatCurrencyCents(entry.revenue)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {entry.revenueShare.kind === "rate" ? formatRate(entry.revenueShare) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCount(entry.orders)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
