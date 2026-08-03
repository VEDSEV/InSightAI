import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { previewWorkspace } from "@/features/dashboard/preview-data";

export function CategoryPerformancePreview() {
  return (
    <Card className="min-w-0 shadow-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-[0.6875rem] font-bold tracking-[0.1em] uppercase">
              Category mix
            </p>
            <h3 className="mt-2 text-base font-semibold">
              Which categories are driving performance?
            </h3>
          </div>
          <Badge>Demo</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs leading-5">
          Demonstration revenue · sorted high to low
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {previewWorkspace.categories.map((category) => (
          <div key={category.name}>
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium">{category.name}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                <span className="font-semibold">{category.revenue}</span>
                <span className="text-muted-foreground w-11 text-right">{category.change}</span>
              </span>
            </div>
            <div className="bg-surface-subtle h-2.5 overflow-hidden rounded-full">
              <div
                aria-hidden="true"
                className="bg-chart-1 h-full rounded-full"
                style={{ width: `${category.share}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
