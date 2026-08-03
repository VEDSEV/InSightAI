import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { previewWorkspace } from "@/features/dashboard/preview-data";

export function RevenueTrendPreview() {
  const points = previewWorkspace.revenueTrend;
  const width = 760;
  const height = 250;
  const paddingX = 24;
  const paddingY = 20;
  const values = points.map((point) => point.value);
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const range = max - min;
  const x = (index: number) => paddingX + (index / (points.length - 1)) * (width - paddingX * 2);
  const y = (value: number) =>
    height - paddingY - ((value - min) / range) * (height - paddingY * 2);
  const polyline = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");

  return (
    <Card className="min-w-0 overflow-hidden shadow-card lg:col-span-2">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-muted-foreground text-[0.6875rem] font-bold tracking-[0.1em] uppercase">
            Trend preview
          </p>
          <h3 id="revenue-trend-title" className="mt-2 text-base font-semibold">
            How is revenue changing over time?
          </h3>
          <p
            id="revenue-trend-description"
            className="text-muted-foreground mt-1 text-xs leading-5"
          >
            Weekly demonstration revenue in thousands · Illustrative 90-day view
          </p>
        </div>
        <Badge variant="primary">Demonstration data</Badge>
      </CardHeader>
      <CardContent className="pt-4">
        <figure aria-labelledby="revenue-trend-title" aria-describedby="revenue-trend-description">
          <div className="relative h-64 w-full">
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
            >
              {[0.2, 0.5, 0.8].map((ratio) => (
                <line
                  key={ratio}
                  x1={paddingX}
                  x2={width - paddingX}
                  y1={height * ratio}
                  y2={height * ratio}
                  stroke="var(--border)"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <polyline
                points={polyline}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {points.map((point, index) => (
                <circle
                  key={point.period}
                  cx={x(index)}
                  cy={y(point.value)}
                  r={index === points.length - 1 ? 5 : 3}
                  fill="var(--surface)"
                  stroke="var(--primary)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          </div>
          <div
            aria-hidden="true"
            className="text-muted-foreground mt-3 flex justify-between text-[0.6875rem] tabular-nums"
          >
            <span>{points[0].period}</span>
            <span>{points[Math.floor(points.length / 2)].period}</span>
            <span>{points[points.length - 1].period}</span>
          </div>
          <ul className="sr-only">
            {points.map((point) => (
              <li key={point.period}>
                {point.period}: ${point.value.toFixed(1)} thousand demonstration revenue
              </li>
            ))}
          </ul>
        </figure>
      </CardContent>
    </Card>
  );
}
