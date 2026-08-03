import { CircleDollarSign, Gauge, PackageCheck, WalletCards } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { SelectControl } from "@/components/ui/select-control";
import { BusinessHealthPreview } from "@/features/dashboard/business-health-preview";
import { CategoryPerformancePreview } from "@/features/dashboard/category-performance-preview";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { MarketingReturnPreview } from "@/features/dashboard/marketing-return-preview";
import { PerformanceTablePreview } from "@/features/dashboard/performance-table-preview";
import { previewWorkspace } from "@/features/dashboard/preview-data";
import { RevenueTrendPreview } from "@/features/dashboard/revenue-trend-preview";
import { SampleDataBanner } from "@/features/dashboard/sample-data-banner";
import { StateGallery } from "@/features/dashboard/state-gallery";

const kpiIcons = {
  revenue: CircleDollarSign,
  "gross-profit": WalletCards,
  "gross-margin": Gauge,
  orders: PackageCheck,
} as const;

export function OverviewDashboard() {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-[100rem] space-y-9 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9">
        <SampleDataBanner />

        <section aria-labelledby="filter-preview-title">
          <Card className="p-4 shadow-control sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 id="filter-preview-title" className="text-sm font-semibold">
                  Explore the sample view
                </h2>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  Controls are intentionally disabled until the deterministic filter layer arrives
                  in Phase 4.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <SelectControl id="category-filter" label="Category" value="All categories" />
                <SelectControl id="region-filter" label="Region" value="All regions" />
                <SelectControl id="channel-filter" label="Channel" value="All channels" />
              </div>
            </div>
          </Card>
        </section>

        <section aria-labelledby="kpi-preview-title">
          <SectionHeader
            eyebrow="Performance summary"
            title="A decision-ready view of business momentum"
            titleId="kpi-preview-title"
            description={`${previewWorkspace.periodLabel}. Values are centralized demonstration content, not calculated results.`}
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {previewWorkspace.kpis.map((kpi) => (
              <KpiCard key={kpi.id} {...kpi} icon={kpiIcons[kpi.id]} />
            ))}
          </div>
        </section>

        <section aria-labelledby="primary-visualization-title">
          <SectionHeader
            eyebrow="Performance movement"
            title="How is the business changing?"
            titleId="primary-visualization-title"
            description="Question-led visual containers establish the future analytical hierarchy without connecting production calculations."
          />
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <RevenueTrendPreview />
          </div>
        </section>

        <BusinessHealthPreview />

        <section aria-labelledby="secondary-analysis-title">
          <SectionHeader
            eyebrow="Driver analysis"
            title="Which parts of the business explain the picture?"
            titleId="secondary-analysis-title"
            description="Compact comparison previews show the intended category and channel analysis patterns."
          />
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <CategoryPerformancePreview />
            <MarketingReturnPreview />
          </div>
        </section>

        <section aria-labelledby="detail-table-title">
          <PerformanceTablePreview />
        </section>

        <section aria-label="Feedback state previews">
          <StateGallery />
        </section>

        <footer className="border-border text-muted-foreground flex flex-col gap-2 border-t pt-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>InsightAI · Phase 1 dashboard shell</span>
          <span>{previewWorkspace.generatedLabel}</span>
        </footer>
      </div>
    </>
  );
}
