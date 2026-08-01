import { SiteHeader } from "@/components/layout/site-header";

const principles = [
  {
    eyebrow: "Reliable",
    title: "Deterministic by design",
    description:
      "Authoritative business metrics will come from tested code, with assumptions and formulas documented before implementation.",
  },
  {
    eyebrow: "Traceable",
    title: "Evidence over assertion",
    description:
      "Every future finding will link back to a calculated metric, comparison period, filter context, and source data.",
  },
  {
    eyebrow: "Focused",
    title: "Built in reviewable phases",
    description:
      "The product foundation is intentionally separate from dashboards, uploads, persistence, and responsible AI features.",
  },
] as const;

export default function Home() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="text-accent mb-5 text-sm font-semibold tracking-wide uppercase">
              Evidence-first commerce intelligence
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-6xl">
              Business clarity, grounded in your data.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-8">
              InsightAI is being built to help small e-commerce teams understand sales and
              profitability without manually assembling a reporting stack.
            </p>
          </div>
          <aside className="border-border bg-surface shadow-card rounded-2xl border p-6 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="bg-success h-2 w-2 rounded-full" aria-hidden="true" />
              Foundation ready for review
            </div>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              Product requirements, analytics definitions, architecture boundaries, design tokens,
              responsible-AI rules, and engineering checks are established. No business metrics or
              AI features are presented in this phase.
            </p>
          </aside>
        </section>

        <section className="border-border border-y bg-white">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-18">
            <h2 className="text-sm font-semibold tracking-wide uppercase">Product principles</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {principles.map((principle) => (
                <article
                  key={principle.title}
                  className="border-border rounded-2xl border p-6 transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
                >
                  <p className="text-accent text-xs font-semibold tracking-wide uppercase">
                    {principle.eyebrow}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold">{principle.title}</h3>
                  <p className="text-muted-foreground mt-3 text-sm leading-6">
                    {principle.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>InsightAI · Phase 0</span>
        <span>Dashboard implementation begins only after foundation review.</span>
      </footer>
    </div>
  );
}
