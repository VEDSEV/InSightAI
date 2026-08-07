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

export function useDashboardAnalytics(filters: DashboardFilterState): DashboardAnalyticsState {
  const [source, setSource] = useState<DashboardAnalyticsSource>({ status: "loading" });

  useEffect(() => {
    let active = true;
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
  }, []);

  return useMemo<DashboardAnalyticsState>(() => {
    if (source.status !== "source_ready") return source;
    return createDashboardViewModel(source.engine, source.dataset, filters, source.filterOptions);
  }, [filters, source]);
}
