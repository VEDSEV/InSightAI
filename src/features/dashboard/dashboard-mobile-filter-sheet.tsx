"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardFilterOptions } from "@/features/dashboard/analytics-adapter";
import {
  DASHBOARD_DATE_PRESETS,
  type DashboardDatePreset,
  type DashboardFilterState,
} from "@/features/dashboard/dashboard-filter-state";

type DashboardMobileFilterSheetProps = {
  readonly filters: DashboardFilterState;
  readonly options: DashboardFilterOptions;
  readonly activeFilterChips: readonly string[];
  readonly isPending: boolean;
  readonly onUpdate: (update: Partial<DashboardFilterState>) => void;
  readonly onReset: () => void;
};

type MobileSelectProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string | null;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string | null) => void;
};

function hasActiveFilters(filters: DashboardFilterState, activeFilterChips: readonly string[]) {
  return (
    activeFilterChips.length > 0 ||
    filters.preset !== "full" ||
    filters.category !== null ||
    filters.region !== null ||
    filters.channel !== null ||
    filters.productId !== null
  );
}

function MobileSelect({ id, label, onChange, options, value }: MobileSelectProps) {
  const allLabel =
    label === "Category"
      ? "All categories"
      : label === "Region"
        ? "All regions"
        : label === "Channel"
          ? "All channels"
          : "All products";

  return (
    <label className="block text-xs font-semibold text-muted-foreground" htmlFor={id}>
      <span className="mb-1.5 block">{label}</span>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="border-border bg-surface text-foreground min-h-11 w-full rounded-control border px-3 text-sm font-medium shadow-control outline-none transition-colors duration-fast hover:border-border-strong focus:border-primary motion-reduce:transition-none"
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

export function DashboardMobileFilterSheet({
  activeFilterChips,
  filters,
  isPending,
  onReset,
  onUpdate,
  options,
}: DashboardMobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DashboardFilterState>(filters);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const hasActive = hasActiveFilters(filters, activeFilterChips);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      closeRef.current?.focus();
      return;
    }
    if (wasOpenRef.current) {
      triggerRef.current?.focus();
      wasOpenRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const manageKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", manageKeyboard);
    return () => window.removeEventListener("keydown", manageKeyboard);
  }, [open]);

  const openSheet = () => {
    setDraft(filters);
    setOpen(true);
  };

  const choosePreset = (preset: DashboardDatePreset) => {
    if (preset === "custom") {
      setDraft((current) => ({ ...current, preset }));
      return;
    }
    const selected = DASHBOARD_DATE_PRESETS.find((candidate) => candidate.id === preset);
    if (selected) {
      setDraft((current) => ({
        ...current,
        preset: selected.id,
        start: selected.start,
        end: selected.end,
      }));
    }
  };

  const apply = () => {
    onUpdate(draft);
    setOpen(false);
  };

  const reset = () => {
    onReset();
    setOpen(false);
  };

  return (
    <section className="md:hidden" aria-labelledby="mobile-filters-title" aria-busy={isPending}>
      <div className="border-border bg-surface rounded-card border p-3.5 shadow-control">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="mobile-filters-title" className="text-sm font-semibold">
              Filters
            </h2>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {hasActive ? "Refine this view" : "Full dataset"}
            </p>
          </div>
          <Button
            ref={triggerRef}
            size="sm"
            variant="secondary"
            aria-expanded={open}
            aria-controls="mobile-filter-sheet"
            onClick={openSheet}
          >
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            Filters
            {activeFilterChips.length > 0 ? (
              <span className="bg-primary-soft text-primary-strong rounded-full px-1.5 py-0.5 text-[0.625rem] leading-none">
                {activeFilterChips.length}
              </span>
            ) : null}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-live="polite">
          {hasActive ? (
            <>
              {filters.preset !== "full" ? <Badge variant="primary">{filters.preset}</Badge> : null}
              {activeFilterChips.map((chip) => (
                <Badge key={chip} variant="neutral">
                  {chip}
                </Badge>
              ))}
            </>
          ) : (
            <span className="text-muted-foreground text-xs">All eligible orders</span>
          )}
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-foreground/25"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-filter-sheet-title"
          aria-describedby="mobile-filter-sheet-description"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Dismiss filters"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-filter-sheet"
            ref={sheetRef}
            className="bg-surface relative max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-card border-t border-border shadow-overlay"
          >
            <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <h2 id="mobile-filter-sheet-title" className="text-lg font-semibold">
                  Filters
                </h2>
                <p
                  id="mobile-filter-sheet-description"
                  className="text-muted-foreground mt-1 text-xs leading-5"
                >
                  Choose a date range and the dimensions you want to compare.
                </p>
              </div>
              <Button
                ref={closeRef}
                size="icon"
                variant="ghost"
                aria-label="Close filters"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label
                className="block text-xs font-semibold text-muted-foreground"
                htmlFor="mobile-date-preset"
              >
                <span className="mb-1.5 block">Date range</span>
                <select
                  id="mobile-date-preset"
                  value={draft.preset}
                  onChange={(event) => choosePreset(event.target.value as DashboardDatePreset)}
                  className="border-border bg-surface text-foreground min-h-11 w-full rounded-control border px-3 text-sm font-medium shadow-control outline-none transition-colors duration-fast hover:border-border-strong focus:border-primary motion-reduce:transition-none"
                >
                  {DASHBOARD_DATE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
              </label>

              {draft.preset === "custom" ? (
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className="text-xs font-semibold text-muted-foreground"
                    htmlFor="mobile-custom-start-date"
                  >
                    <span className="mb-1.5 block">Start date</span>
                    <input
                      id="mobile-custom-start-date"
                      type="date"
                      value={draft.start}
                      min="2024-01-01"
                      max="2025-12-31"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          start: event.target.value,
                          preset: "custom",
                        }))
                      }
                      className="border-border bg-surface text-foreground min-h-11 w-full rounded-control border px-3 text-sm font-medium shadow-control outline-none transition-colors duration-fast hover:border-border-strong focus:border-primary motion-reduce:transition-none"
                    />
                  </label>
                  <label
                    className="text-xs font-semibold text-muted-foreground"
                    htmlFor="mobile-custom-end-date"
                  >
                    <span className="mb-1.5 block">End date</span>
                    <input
                      id="mobile-custom-end-date"
                      type="date"
                      value={draft.end}
                      min="2024-01-01"
                      max="2025-12-31"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          end: event.target.value,
                          preset: "custom",
                        }))
                      }
                      className="border-border bg-surface text-foreground min-h-11 w-full rounded-control border px-3 text-sm font-medium shadow-control outline-none transition-colors duration-fast hover:border-border-strong focus:border-primary motion-reduce:transition-none"
                    />
                  </label>
                </div>
              ) : null}

              <MobileSelect
                id="mobile-category-filter"
                label="Category"
                value={draft.category}
                options={options.categories}
                onChange={(category) => setDraft((current) => ({ ...current, category }))}
              />
              <MobileSelect
                id="mobile-region-filter"
                label="Region"
                value={draft.region}
                options={options.regions}
                onChange={(region) => setDraft((current) => ({ ...current, region }))}
              />
              <MobileSelect
                id="mobile-channel-filter"
                label="Channel"
                value={draft.channel}
                options={options.channels}
                onChange={(channel) => setDraft((current) => ({ ...current, channel }))}
              />
              <MobileSelect
                id="mobile-product-filter"
                label="Product"
                value={draft.productId}
                options={options.products}
                onChange={(productId) => setDraft((current) => ({ ...current, productId }))}
              />
            </div>

            <div className="border-border bg-surface sticky bottom-0 flex gap-2 border-t px-5 py-4">
              <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={reset} disabled={!hasActive}>
                <RotateCcw aria-hidden="true" className="size-3.5" />
                Reset
              </Button>
              <Button className="flex-1" onClick={apply}>
                Apply filters
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
