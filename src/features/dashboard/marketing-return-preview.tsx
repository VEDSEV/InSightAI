import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { previewWorkspace } from "@/features/dashboard/preview-data";

export function MarketingReturnPreview() {
  return (
    <Card className="min-w-0 shadow-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-[0.6875rem] font-bold tracking-[0.1em] uppercase">
              Channel efficiency
            </p>
            <h3 className="mt-2 text-base font-semibold">
              Where is marketing producing the strongest return?
            </h3>
          </div>
          <Badge>Demo</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs leading-5">
          Illustrative contribution ROI · not causal attribution
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {previewWorkspace.marketing.map((channel) => (
          <div
            key={channel.channel}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4"
          >
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="truncate text-xs font-medium">{channel.channel}</span>
                <span className="text-muted-foreground text-[0.6875rem]">{channel.note}</span>
              </div>
              <div className="bg-surface-subtle h-2.5 overflow-hidden rounded-full">
                <div
                  aria-hidden="true"
                  className="bg-chart-2 h-full rounded-full"
                  style={{ width: `${channel.score}%` }}
                />
              </div>
            </div>
            <span className="w-10 text-right text-sm font-semibold tabular-nums">
              {channel.roi}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
