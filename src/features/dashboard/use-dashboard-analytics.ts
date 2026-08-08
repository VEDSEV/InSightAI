"use client";

import { useEffect, useMemo, useState } from "react";

import { createAnalyticsEngine, type AnalyticsEngine, type ValidatedDataset } from "@/analytics";

import {
  createDashboardFilterOptions,
  createDashboardViewModel,
  type DashboardFilterOptions,
  type DashboardViewModelResult,
} from "@/features/dashboard/analytics-adapter";
import type { DashboardFilterState } from "@/features/dashboard/dashboard-filter-state";
import { loadDashboardSampleDataset } from "@/features/dashboard/dashboard-sample-dataset";

type DashboardAnalyticsSource =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "source_ready";
      readonly dataset: ValidatedDataset;
      readonly engine: AnalyticsEngine;
      readonly filterOptions: DashboardFilterOptions;
    };

type DashboardAnalyticsState =
  Exclude<DashboardAnalyticsSource, { readonly status: "source_ready" }> | DashboardViewModelResult;

export function useDashboardAnalytics(
  filters: DashboardFilterState,
  suppliedDataset: ValidatedDataset | null = null,
): DashboardAnalyticsState {
  const [source, setSource] = useState<DashboardAnalyticsSource>({ status: "loading" });
  const suppliedSource = useMemo<DashboardAnalyticsSource | null>(() => {
    if (suppliedDataset === null) return null;
    const engine = createAnalyticsEngine(suppliedDataset);
    return {
      status: "source_ready",
      dataset: suppliedDataset,
      engine,
      filterOptions: createDashboardFilterOptions(suppliedDataset),
    };
  }, [suppliedDataset]);

  useEffect(() => {
    let active = true;
    if (suppliedDataset !== null)
      return () => {
        active = false;
      };
    loadDashboardSampleDataset()
      .then((loaded) => {
        if (!active) return;
        if (loaded.status === "error") {
          setSource(loaded);
          return;
        }
        const engine = createAnalyticsEngine(loaded.dataset);
        setSource({
          status: "source_ready",
          dataset: loaded.dataset,
          engine,
          filterOptions: createDashboardFilterOptions(loaded.dataset),
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSource({
          status: "error",
          message:
            error instanceof Error ? error.message : "The sample dataset could not be prepared.",
        });
      });
    return () => {
      active = false;
    };
  }, [suppliedDataset]);

  return useMemo<DashboardAnalyticsState>(() => {
    const activeSource = suppliedSource ?? source;
    if (activeSource.status !== "source_ready") return activeSource;
    return createDashboardViewModel(
      activeSource.engine,
      activeSource.dataset,
      filters,
      activeSource.filterOptions,
    );
  }, [filters, source, suppliedSource]);
}
