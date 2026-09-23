import type { DashboardFilterState } from "@/features/dashboard/dashboard-filter-state";

/** Immutable session identity. A changed dataset or canonical filter selection must remount/clear chat. */
export function createAnalystConversationContextKey(
  datasetFingerprint: string,
  filter: DashboardFilterState,
): string {
  return `${datasetFingerprint}:${JSON.stringify({
    start: filter.start,
    end: filter.end,
    category: filter.category,
    region: filter.region,
    channel: filter.channel,
    productId: filter.productId,
  })}`;
}
