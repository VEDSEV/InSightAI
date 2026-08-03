import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TableShell } from "@/components/ui/table-shell";
import { previewWorkspace } from "@/features/dashboard/preview-data";

const statusVariant = {
  Healthy: "success",
  Monitor: "neutral",
  Review: "warning",
} as const;

export function PerformanceTablePreview() {
  return (
    <Card className="min-w-0 overflow-hidden shadow-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-muted-foreground text-[0.6875rem] font-bold tracking-[0.1em] uppercase">
            Detailed performance
          </p>
          <h2 id="detail-table-title" className="mt-2 text-base font-semibold">
            Which products merit a closer look?
          </h2>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            Demonstration product rows · values do not come from the analytics engine
          </p>
        </div>
        <Badge variant="primary">Sample workspace</Badge>
      </CardHeader>
      <CardContent className="pt-4">
        <TableShell caption="Demonstration product performance preview">
          <thead className="bg-surface-subtle text-muted-foreground text-[0.6875rem] font-bold tracking-[0.04em] uppercase">
            <tr>
              <th scope="col" className="px-4 py-3.5">
                Product
              </th>
              <th scope="col" className="px-4 py-3.5">
                Category
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Revenue
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Gross margin
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Orders
              </th>
              <th scope="col" className="px-4 py-3.5">
                Preview status
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {previewWorkspace.products.map((product) => (
              <tr
                key={product.product}
                className="hover:bg-surface-subtle/70 transition-colors duration-fast motion-reduce:transition-none"
              >
                <th scope="row" className="px-4 py-4 text-sm font-semibold whitespace-nowrap">
                  {product.product}
                </th>
                <td className="text-muted-foreground px-4 py-4 text-xs whitespace-nowrap">
                  {product.category}
                </td>
                <td className="px-4 py-4 text-right text-sm font-medium whitespace-nowrap tabular-nums">
                  {product.revenue}
                </td>
                <td className="px-4 py-4 text-right text-sm whitespace-nowrap tabular-nums">
                  {product.margin}
                </td>
                <td className="px-4 py-4 text-right text-sm whitespace-nowrap tabular-nums">
                  {product.orders}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <Badge variant={statusVariant[product.status]}>{product.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
        <p className="text-muted-foreground mt-3 text-[0.6875rem] leading-5 sm:hidden">
          Swipe horizontally to inspect all demonstration columns.
        </p>
      </CardContent>
    </Card>
  );
}
