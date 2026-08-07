import { Badge } from "@/components/ui/badge";

export function SiteHeader() {
  return (
    <header className="border-border bg-surface border-b">
      <div className="mx-auto flex max-w-[100rem] flex-col gap-5 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[1.75rem]">
              Business overview
            </h1>
            <Badge variant="primary">Commerce performance</Badge>
          </div>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-6">
            See what is changing across revenue, profit, orders, and customer behavior.
          </p>
        </div>
      </div>
    </header>
  );
}
