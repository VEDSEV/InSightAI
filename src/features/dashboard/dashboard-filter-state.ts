"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { createDateInterval, type FilterContextInput } from "@/analytics";

export const DASHBOARD_DATE_PRESETS = [
  { id: "full", label: "Full dataset", start: "2024-01-01", end: "2025-12-31" },
  { id: "last-30", label: "Last 30 days", start: "2025-12-02", end: "2025-12-31" },
  { id: "last-90", label: "Last 90 days", start: "2025-10-03", end: "2025-12-31" },
  { id: "ytd-2025", label: "Year to date (2025)", start: "2025-01-01", end: "2025-12-31" },
  { id: "year-2024", label: "2024", start: "2024-01-01", end: "2024-12-31" },
  { id: "year-2025", label: "2025", start: "2025-01-01", end: "2025-12-31" },
] as const;

export type DashboardDatePreset = (typeof DASHBOARD_DATE_PRESETS)[number]["id"] | "custom";

export type DashboardFilterState = {
  readonly preset: DashboardDatePreset;
  readonly start: string;
  readonly end: string;
  readonly category: string | null;
  readonly region: string | null;
  readonly channel: string | null;
  readonly productId: string | null;
};

export const DEFAULT_DASHBOARD_FILTER_STATE: DashboardFilterState = Object.freeze({
  preset: "full",
  start: "2024-01-01",
  end: "2025-12-31",
  category: null,
  region: null,
  channel: null,
  productId: null,
});

const FILTER_QUERY_KEYS = Object.freeze({
  preset: "range",
  start: "start",
  end: "end",
  category: "category",
  region: "region",
  channel: "channel",
  productId: "product",
});

function presetForDates(start: string, end: string): DashboardDatePreset {
  return (
    DASHBOARD_DATE_PRESETS.find((preset) => preset.start === start && preset.end === end)?.id ??
    "custom"
  );
}

function selection(value: string | null): readonly string[] {
  return value === null ? Object.freeze([]) : Object.freeze([value]);
}

export function readDashboardFilterState(search: string): DashboardFilterState {
  const query = new URLSearchParams(search);
  const start = query.get(FILTER_QUERY_KEYS.start) ?? DEFAULT_DASHBOARD_FILTER_STATE.start;
  const end = query.get(FILTER_QUERY_KEYS.end) ?? DEFAULT_DASHBOARD_FILTER_STATE.end;
  const requestedPreset = query.get(FILTER_QUERY_KEYS.preset);
  const matchingPreset = presetForDates(start, end);
  const namedPreset = DASHBOARD_DATE_PRESETS.find((preset) => preset.id === requestedPreset);
  const preset =
    requestedPreset === "custom"
      ? "custom"
      : namedPreset?.start === start && namedPreset.end === end
        ? namedPreset.id
        : matchingPreset;

  return Object.freeze({
    preset,
    start,
    end,
    category: query.get(FILTER_QUERY_KEYS.category),
    region: query.get(FILTER_QUERY_KEYS.region),
    channel: query.get(FILTER_QUERY_KEYS.channel),
    productId: query.get(FILTER_QUERY_KEYS.productId),
  });
}

export function dashboardFilterSearch(state: DashboardFilterState): string {
  const query = new URLSearchParams();
  if (state.preset !== "full") query.set(FILTER_QUERY_KEYS.preset, state.preset);
  if (state.start !== DEFAULT_DASHBOARD_FILTER_STATE.start) {
    query.set(FILTER_QUERY_KEYS.start, state.start);
  }
  if (state.end !== DEFAULT_DASHBOARD_FILTER_STATE.end) query.set(FILTER_QUERY_KEYS.end, state.end);
  if (state.category !== null) query.set(FILTER_QUERY_KEYS.category, state.category);
  if (state.region !== null) query.set(FILTER_QUERY_KEYS.region, state.region);
  if (state.channel !== null) query.set(FILTER_QUERY_KEYS.channel, state.channel);
  if (state.productId !== null) query.set(FILTER_QUERY_KEYS.productId, state.productId);
  const serialized = query.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

export function dashboardFilterContext(
  state: DashboardFilterState,
):
  | { readonly status: "ok"; readonly filter: FilterContextInput }
  | { readonly status: "error"; readonly message: string } {
  const period = createDateInterval(state.start, state.end);
  if (period.status === "error") {
    return { status: "error", message: period.errors.map((error) => error.message).join(" ") };
  }
  return {
    status: "ok",
    filter: Object.freeze({
      period: period.value,
      categories: selection(state.category),
      regions: selection(state.region),
      salesChannels: selection(state.channel),
      productIds: selection(state.productId),
    }),
  };
}

type FilterUpdate =
  Partial<DashboardFilterState> | ((current: DashboardFilterState) => DashboardFilterState);

function writeSearch(state: DashboardFilterState): void {
  const query = new URLSearchParams(dashboardFilterSearch(state));
  const workspaceView = new URLSearchParams(window.location.search).get("view");
  if (workspaceView === "advanced") query.set("view", workspaceView);
  const search = query.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", next);
}

export function useDashboardFilters() {
  const [filters, setFilters] = useState<DashboardFilterState>(DEFAULT_DASHBOARD_FILTER_STATE);
  const hasInitialized = useRef(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!hasInitialized.current) return;
    const nextSearch = dashboardFilterSearch(filters);
    if (window.location.search !== nextSearch) writeSearch(filters);
  }, [filters]);

  useEffect(() => {
    const syncFromLocation = () => setFilters(readDashboardFilterState(window.location.search));
    syncFromLocation();
    hasInitialized.current = true;
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const updateFilters = useCallback((update: FilterUpdate) => {
    startTransition(() => {
      setFilters((current) => {
        const next =
          typeof update === "function" ? update(current) : Object.freeze({ ...current, ...update });
        const retainedPreset = DASHBOARD_DATE_PRESETS.find(
          (preset) =>
            preset.id === next.preset && preset.start === next.start && preset.end === next.end,
        );
        const normalized = Object.freeze({
          ...next,
          preset:
            next.preset === "custom"
              ? "custom"
              : (retainedPreset?.id ?? presetForDates(next.start, next.end)),
        });
        return normalized;
      });
    });
  }, []);

  const choosePreset = useCallback(
    (presetId: DashboardDatePreset) => {
      if (presetId === "custom") {
        updateFilters({ preset: "custom" });
        return;
      }
      const preset = DASHBOARD_DATE_PRESETS.find((candidate) => candidate.id === presetId);
      if (preset) updateFilters({ preset: preset.id, start: preset.start, end: preset.end });
    },
    [updateFilters],
  );

  const resetFilters = useCallback(
    () => updateFilters(DEFAULT_DASHBOARD_FILTER_STATE),
    [updateFilters],
  );

  const replaceFilters = useCallback(
    (next: DashboardFilterState) => updateFilters(Object.freeze({ ...next })),
    [updateFilters],
  );

  return Object.freeze({
    filters,
    isPending,
    updateFilters,
    choosePreset,
    resetFilters,
    replaceFilters,
  });
}
