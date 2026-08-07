# InsightAI

InsightAI is an evidence-first business intelligence platform for small e-commerce teams. The product
will turn order-level data into a trustworthy view of sales, profitability, customers, products,
regions, and channels—without requiring the user to build a reporting stack by hand.

> **Current status:** Phase 2 is approved and merged. Phase 3, the framework-independent
> deterministic analytics engine, is in progress on `feat/phase-3-analytics-engine`. The engine is
> not connected to the dashboard: the application still displays the separate Phase 1 preview
> workspace and contains no production charts, upload workflow, authentication, persistence, AI,
> forecasting, causal analysis, or deployment integration.

## Product principles

- **Deterministic facts:** authoritative metrics are calculated by tested code, never by a language
  model.
- **Visible evidence:** future findings and recommendations must preserve their metric, time range,
  filters, comparison baseline, and source provenance.
- **Progressive delivery:** each roadmap phase has acceptance criteria and is reviewed before the
  next layer adds complexity.
- **Responsible defaults:** data minimization, accessible interaction, honest uncertainty, and clear
  failure states are product requirements.

## Architecture

The web application uses Next.js App Router, React, strict TypeScript, and Tailwind CSS. Phase 1 adds
small owned UI primitives with controlled variants, Lucide icons, accessible application navigation,
and behavior-focused component tests. Preview visuals use local SVG/CSS and do not require a charting
runtime. Recharts remains deferred until real visualization behavior is in scope. Runtime-validation
dependencies are added only when they provide current value at the canonical boundary. Supabase is
deferred until authentication and persistence are in scope.

Phase 2 adds a framework-independent TypeScript generator under `scripts/sample-data`. Configuration,
catalog/customer rules, scenarios, serialization, generation-time validation, machine controls,
distribution profiling, and independent CSV verification are separate modules. No dataset code is
imported into the UI or `src/analytics`.

Analytics is a separate source boundary inside `src/analytics`. Its pure functions accept canonical
validated rows and return typed metrics, comparisons, breakdowns, diagnostics, and bounded evidence
references with context and data-quality metadata. Application code must import the supported public
surface from `src/analytics/index.ts`; reaching into analytics internals would make future refactoring
and formula review unsafe. A Python/FastAPI service remains an option only if measured workloads show
that the TypeScript boundary cannot meet a demonstrated performance or library requirement.

```text
Uploaded file (Phase 5)
  -> parse and map columns
  -> validate and normalize canonical rows
  -> deterministic analytics engine
  -> typed metric and finding results
  -> filters, charts, and evidence views
  -> grounded AI explanation (Phase 7+, never the source of truth)
```

See [Architecture](docs/ARCHITECTURE.md), [Analytics specification](docs/ANALYTICS_SPEC.md),
[engine reference](docs/ANALYTICS_ENGINE.md), [benchmark report](docs/ANALYTICS_BENCHMARKS.md), and
[AI safety](docs/AI_SAFETY.md) for the full boundaries.

## Phase 3 engine contract

The Phase 3 boundary separates raw CSV parsing, normalization, row validation, dataset-level
validation, and calculation. Raw values do not enter formulas merely because they have been assigned
a TypeScript type. Required fields, optional fields, identifiers, civil dates, categorical values,
quantities, money syntax, arithmetic reconciliation, duplicate line IDs, dataset coverage, currency,
and timezone assumptions are checked before a dataset becomes calculable. Invalid rows remain
explicit validation failures rather than disappearing into aggregates.

Authoritative monetary values are parsed from decimal strings into checked safe-integer cents. Sums
and monetary changes remain integer cents; margins, shares, ROI, and other rates retain safe-integer
numerator and denominator values. Percentage serialization derives integer basis points with
half-away-from-zero rounding; currency and percentage rounding occurs only at an explicit
serialization or presentation boundary. Interpolated statistics that can fall between cents use
rational values instead of pretending to be transactional money.

One immutable filter context controls every calculation. Optional `customer_segment` and `campaign`
nulls remain part of whole-dataset metrics and use the explicit `__missing__` key in filtering and
breakdowns. Repeat behavior has two named scopes: orders visible within the selected period and
filters, and customer status calculated across the full loaded dataset. A generic “repeat customer”
result must not conceal which scope was used.

Date filters use inclusive calendar-date boundaries. Previous equal-length comparisons use the same
non-date filters and the immediately preceding number of calendar days. Previous-calendar-month and
previous-calendar-quarter modes require a complete aligned current period; a partial or unaligned
period returns `invalid_filter`. Previous-year boundaries shift by one calendar year and clamp
February 29 to February 28 when required. Partial periods are never silently expanded or annualized.
Absolute change, relative percentage change, and percentage-point change remain distinct fields.

Every public result is an envelope rather than a bare number. It identifies the metric or method,
status, unit, period, filters, assumptions, quality state, engine version, calculation components, and
an evidence reference. Evidence keeps total matching counts while retaining at most 12
deterministically ordered sample source IDs by default. Daily and weekly anomaly analysis uses a
configurable trailing median/MAD baseline plus relative and absolute materiality requirements;
partial weekly buckets are excluded by default. This local baseline limits cadence artifacts but does
not model holiday seasonality, so results say “unusual versus the local baseline” and never imply that
an event was unexpected or causal. Insufficient history is different from a valid run with no
anomalies.

Phase 3 reconciliation passes all 26 exact checks against the approved Phase 2 CSV and independent
controls, including its SHA-256 checksum and cents-based dimensional totals. A private,
engine-scoped runtime shares immutable filtered aggregates, bounded evidence support, grouping, and
date indexes through an eight-entry LRU; it has no global or cross-dataset cache. The completed
benchmark measures parsing/validation, KPI, breakdown, comparison, and anomaly work on 6,909,
55,272, and 110,544 lines. All four 55,272-row internal performance targets pass while fresh engines
are constructed inside measured batches. Results remain local characterization rather than universal
performance claims; see the benchmark report for timings, equivalence evidence, and limitations.

## Repository structure

```text
InsightAI/
├── data/sample/             # Generated CSV, controls, checksum, and documentation
├── docs/                    # Product, architecture, analytics, design, and safety decisions
├── public/                  # Static brand assets
├── scripts/sample-data/     # Deterministic generator and independent verification modules
├── src/
│   ├── analytics/           # Pure deterministic business calculations (Phase 3)
│   ├── app/                 # Next.js App Router entry points
│   ├── components/          # Reusable application-shell and UI primitives
│   ├── features/dashboard/  # Overview composition and isolated demonstration content
│   └── lib/                 # Framework-independent shared configuration and utilities
├── tests/                   # Cross-cutting and contract tests
└── .env.example             # Documented environment variable names; no secrets
```

## Local development

### Prerequisites

- Node.js 22.x or 24.x; Node.js 24.18.0 LTS is the version recorded in `.nvmrc`
- pnpm 11.9.x; the exact project package-manager version is pinned in `package.json`

The project does not depend on Codex's bundled runtime. Install Node.js and pnpm on the development
machine before setup. With a version manager that supports `.nvmrc`, select the repository version;
otherwise install a supported Node.js release directly. On Windows, pnpm recommends npm or Corepack:

```powershell
node --version
npm install --global corepack@latest
corepack enable pnpm
pnpm --version
```

Corepack reads the `packageManager` field and activates the pinned pnpm release for this project.

### Setup

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

No environment variables are required for the Phase 3 analytics work. Open `http://localhost:3000`
after the development server starts to inspect the still-isolated Phase 1 preview workspace.

### OneDrive development note

This repository currently lives in a OneDrive-synchronized directory. If dependency installation,
file watching, native builds, or Git operations exhibit locking or synchronization delays, pause work
and clone or copy the repository into a normal local development directory outside OneDrive. Do not
move the working repository while development processes are running.

### Quality commands

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
pnpm generate:sample-data
pnpm verify:sample-data
pnpm reconcile:analytics
pnpm benchmark:analytics
```

`pnpm check` runs linting, type checking, tests, and formatting checks together. The production build
remains a separate explicit gate. The full analytics benchmark is intentionally long-running; use
`pnpm benchmark:analytics -- --quick` only as a harness smoke check, not as the recorded benchmark.

## Delivery roadmap

| Phase | Status      | Outcome                                                                            |
| ----- | ----------- | ---------------------------------------------------------------------------------- |
| 0     | Complete    | Product definition, documented contracts, toolchain, and minimal application shell |
| 1     | Complete    | Accessible dashboard shell and reusable design-system primitives                   |
| 2     | Complete    | Reproducible synthetic order-line dataset, controls, and scenarios                 |
| 3     | In progress | Tested deterministic analytics engine                                              |
| 4     | Planned     | Interactive filters and evidence-linked visualizations                             |
| 5     | Planned     | File upload, validation, cleaning, and column mapping                              |
| 6     | Planned     | Rule-based findings, risks, and opportunities                                      |
| 7     | Planned     | AI explanations and evidence-based recommendations                                 |
| 8     | Planned     | Grounded conversational analysis                                                   |
| 9     | Planned     | Authentication, saved projects, database, and file storage                         |
| 10    | Planned     | Report export, full testing, deployment, documentation, and portfolio polish       |

Detailed entry and exit criteria are in [the roadmap](docs/ROADMAP.md).

## Dataset and UI-preview boundary

All values shown in the Overview page are synthetic UI-preview content centralized in
`src/features/dashboard/preview-data.ts`. The page repeats “Sample workspace” and “Demonstration data”
labels at the shell, page, chart, and table levels. Preview modules do not import from or write to
`src/analytics`, and disabled filters explain which later phase will make them functional.

The generated Phase 2 CSV is documented in [the sample-data guide](data/sample/README.md), with a
[data dictionary](data/sample/DATA_DICTIONARY.md), [scenario guide](data/sample/SCENARIOS.md),
[control totals](data/sample/CONTROL_TOTALS.md),
[distribution profile](data/sample/DISTRIBUTION_PROFILE.md), and
[provenance statement](data/sample/PROVENANCE.md).
It is a development fixture for Phase 3 and is not wired into the dashboard.

## Portfolio relevance

InsightAI is intentionally designed to demonstrate a full analytical product workflow:

- data quality assessment, cleaning rules, and explicit schemas;
- KPI design with formulas, grains, time semantics, assumptions, and edge cases;
- business analysis that separates observations from recommendations;
- responsive dashboard and data-visualization design;
- product requirements, staged scope, acceptance criteria, and risk management;
- unit, contract, interaction, and end-to-end testing;
- responsible AI grounded in deterministic calculations and auditable evidence.

The project is relevant to Data Analyst, Business Analyst, Product Analyst, MIS, and Product
Management internship portfolios because the artifacts make both technical execution and product
judgment reviewable.

## Documentation

- [Product requirements](docs/PRD.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Analytics specification](docs/ANALYTICS_SPEC.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [AI safety](docs/AI_SAFETY.md)

## Scope guardrails

Phase 3 implements analytics contracts and calculations only. It does not connect results to the
dashboard or replace Phase 1 preview values. Production charts, functioning dashboard filters,
uploads, authentication, persistence, external services, generative AI, chat, forecasting, causal
claims, and deployment remain out of scope. Synthetic source rows, validated canonical rows,
authoritative analytics results, UI presentation, and future AI outputs remain distinct boundaries.

## License

No license has been selected. All rights are reserved until the repository owner chooses one.
