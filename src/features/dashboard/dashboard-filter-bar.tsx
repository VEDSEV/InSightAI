"use client";

import { FilterX, RotateCcw, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardFilterOptions } from "@/features/dashboard/analytics-adapter";
import { DashboardMobileFilterSheet } from "@/features/dashboard/dashboard-mobile-filter-sheet";
import {
  DASHBOARD_DATE_PRESETS,
  type DashboardDatePreset,
  type DashboardFilterState,
} from "@/features/dashboard/dashboard-filter-state";

type DashboardFilterBarProps = {
  readonly filters: DashboardFilterState;
  readonly options: DashboardFilterOptions;
  readonly activeFilterChips: readonly string[];
  readonly isPending: boolean;
  readonly onChoosePreset: (preset: DashboardDatePreset) => void;
  readonly onUpdate: (update: Partial<DashboardFilterState>) => void;
  readonly onReset: () => void;
};

type SelectionControlProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string | null;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string | null) => void;
};

function SelectionControl({ id, label, value, options, onChange }: SelectionControlProps) {
  const allLabel =
    label === "Category"
      ? "All categories"
      : label === "Region"
        ? "All regions"
        : label === "Channel"
          ? "All channels"
          : "All products";
  return (
    <label className="min-w-0 text-xs font-semibold text-muted-foreground" htmlFor={id}>
      <span className="mb-1.5 block">{label}</span>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="border-border bg-surface text-foreground min-h-10 w-full rounded-control border px-3 text-sm font-medium shadow-control outline-none transition-colors duration-fast hover:border-border-strong focus:border-primary motion-reduce:transition-none"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DashboardFilterBar({
  activeFilterChips,
  filters,
  isPending,
  onChoosePreset,
  onReset,
  onUpdate,
  options,
}: DashboardFilterBarProps) {
  const hasActiveFilters =
    activeFilterChips.length > 0 ||
    filters.preset !== "full" ||
    filters.category !== null ||
    filters.region !== null ||
    filters.channel !== null ||
    filters.productId !== null;

  return (
    <>
      <DashboardMobileFilterSheet
        activeFilterChips={activeFilterChips}
        filters={filters}
        isPending={isPending}
        options={options}
        onReset={onReset}
        onUpdate={onUpdate}
      />
      <section
        className="hidden md:block"
        aria-labelledby="dashboard-filters-title"
        aria-busy={isPending}
      >
        <div className="border-border bg-surface rounded-card border p-4 shadow-control lg:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-button">
                <SlidersHorizontal aria-hidden="true" className="size-4" />
              </span>
              <div>
                <h2 id="dashboard-filters-title" className="text-sm font-semibold">
                  Filters
                </h2>
                <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                  Narrow every view with one shared selection.
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" disabled={!hasActiveFilters} onClick={onReset}>
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Reset filters
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="date-preset">
              <span className="mb-1.5 block">Date range</span>
              <select
                id="date-preset"
                value={filters.preset}
                onChange={(event) => onChoosePreset(event.target.value as DashboardDatePreset)}
                className="border-border bg-surface text-foreground min-h-10 w-full rounded-control border px-3 text-sm font-medium shadow-control outline-none transition-colors duration-fast hover:border-border-strong focus:border-primary motion-reduce:transition-none"
              >
                {DASHBOARD_DATE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </label>
            <SelectionControl
              id="category-filter"
              label="Category"
              value={filters.category}
              options={options.categories}
              onChange={(category) => onUpdate({ category })}
            />
            <SelectionControl
              id="region-filter"
              label="Region"
              value={filters.region}
              options={options.regions}
              onChange={(region) => onUpdate({ region })}
            />
            <SelectionControl
              id="channel-filter"
              label="Channel"
              value={filters.channel}
              options={options.channels}
              onChange={(channel) => onUpdate({ channel })}
            />
            <SelectionControl
              id="product-filter"
              label="Product"
              value={filters.productId}
              options={options.products}
              onChange={(productId) => onUpdate({ productId })}
            />
          </div>

          {filters.preset === "custom" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-[26rem]">
              <label
                className="text-xs font-semibold text-muted-foreground"
                htmlFor="custom-start-date"
              >
                <span className="mb-1.5 block">Start date</span>
                <input
                  id="custom-start-date"
                  type="date"
                  value={filters.start}
                  min="2024-01-01"
                  max="2025-12-31"
                  onChange={(event) => onUpdate({ start: event.target.value, preset: "custom" })}
                  className="border-border bg-surface text-foreground min-h-10 w-full rounded-control border px-3 text-sm font-medium shadow-control outline-none transition-colors duration-fast hover:border-border-strong focus:border-primary motion-reduce:transition-none"
                />
              </label>
              <label
                className="text-xs font-semibold text-muted-foreground"
                htmlFor="custom-end-date"
              >
                <span className="mb-1.5 block">End date</span>
                <input
                  id="custom-end-date"
                  type="date"
                  value={filters.end}
                  min="2024-01-01"
                  max="2025-12-31"
                  onChange={(event) => onUpdate({ end: event.target.value, preset: "custom" })}
                  className="border-border bg-surface text-foreground min-h-10 w-full rounded-control border px-3 text-sm font-medium shadow-control outline-none transition-colors duration-fast hover:border-border-strong focus:border-primary motion-reduce:transition-none"
                />
              </label>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
            <span className="text-muted-foreground text-xs font-semibold">Viewing</span>
            {hasActiveFilters ? (
              <>
                {filters.preset !== "full" ? (
                  <Badge variant="primary">{filters.preset.replaceAll("-", " ")}</Badge>
                ) : null}
                {activeFilterChips.map((chip) => (
                  <Badge key={chip} variant="neutral">
                    {chip}
                  </Badge>
                ))}
              </>
            ) : (
              <span className="text-muted-foreground text-xs">
                All eligible orders in the full dataset
              </span>
            )}
            {isPending ? (
              <span className="text-primary ml-auto inline-flex items-center gap-1 text-xs font-semibold">
                <FilterX aria-hidden="true" className="size-3.5" /> Updating results
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
