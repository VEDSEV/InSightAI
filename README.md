# InsightAI

InsightAI is an evidence-first business intelligence platform for small e-commerce teams. The product
will turn order-level data into a trustworthy view of sales, profitability, customers, products,
regions, and channels—without requiring the user to build a reporting stack by hand.

> **Current status:** Phase 2 synthetic order-line dataset realism revision complete and awaiting
> review. The repository now includes a reproducible, documented, independently verified synthetic
> CSV plus machine-readable and human-readable distribution profiles. The
> application still displays the separate Phase 1 preview workspace and contains no production
> analytics, uploaded business data, or AI features.

## Product principles

- **Deterministic facts:** authoritative metrics are calculated by tested code, never by a language
  model.
- **Visible evidence:** future findings and recommendations must preserve their metric, time range,
  filters, comparison baseline, and source provenance.
- **Progressive delivery:** each roadmap phase has acceptance criteria and is reviewed before the
  next layer adds complexity.
- **Responsible defaults:** data minimization, accessible interaction, honest uncertainty, and clear
  failure states are product requirements.

## Planned architecture

The web application uses Next.js App Router, React, strict TypeScript, and Tailwind CSS. Phase 1 adds
small owned UI primitives with controlled variants, Lucide icons, accessible application navigation,
and behavior-focused component tests. Preview visuals use local SVG/CSS and do not require a charting
runtime. Recharts remains deferred until real visualization behavior is in scope; Zod will enter with
dataset validation. Supabase is deferred until authentication and persistence are in scope.

Phase 2 adds a framework-independent TypeScript generator under `scripts/sample-data`. Configuration,
catalog/customer rules, scenarios, serialization, generation-time validation, machine controls,
distribution profiling, and independent CSV verification are separate modules. No dataset code is
imported into the UI or `src/analytics`.

Analytics is a separate source boundary inside `src/analytics`. Its future pure functions will accept
canonical validated rows and return typed metric results with context and quality metadata. A
Python/FastAPI service is an option only if later workloads demonstrate that the TypeScript boundary
cannot meet measured performance or library requirements.

```text
Uploaded file (Phase 5)
  -> parse and map columns
  -> validate and normalize canonical rows
  -> deterministic analytics engine
  -> typed metric and finding results
  -> filters, charts, and evidence views
  -> grounded AI explanation (Phase 7+, never the source of truth)
```

See [Architecture](docs/ARCHITECTURE.md), [Analytics specification](docs/ANALYTICS_SPEC.md), and
[AI safety](docs/AI_SAFETY.md) for the full boundaries.

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

No environment variables are required in Phase 2. Open `http://localhost:3000` after the development
server starts.

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
```

`pnpm check` runs linting, type checking, tests, and formatting checks together. The production build
remains a separate explicit gate.

## Delivery roadmap

| Phase | Status   | Outcome                                                                            |
| ----- | -------- | ---------------------------------------------------------------------------------- |
| 0     | Complete | Product definition, documented contracts, toolchain, and minimal application shell |
| 1     | Complete | Accessible dashboard shell and reusable design-system primitives                   |
| 2     | Complete | Reproducible synthetic order-line dataset, controls, and scenarios                 |
| 3     | Next     | Tested deterministic analytics engine                                              |
| 4     | Planned  | Interactive filters and evidence-linked visualizations                             |
| 5     | Planned  | File upload, validation, cleaning, and column mapping                              |
| 6     | Planned  | Rule-based findings, risks, and opportunities                                      |
| 7     | Planned  | AI explanations and evidence-based recommendations                                 |
| 8     | Planned  | Grounded conversational analysis                                                   |
| 9     | Planned  | Authentication, saved projects, database, and file storage                         |
| 10    | Planned  | Report export, full testing, deployment, documentation, and portfolio polish       |

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

Phase 2 deliberately excludes the deterministic analytics engine, production charts, functioning
filters, uploaded data, authoritative findings, persistence, authentication, external services, and
AI. Synthetic source rows, calculated dataset fields, future analytics outputs, and future AI outputs
remain distinct. No dependencies were added for Phase 2.

## License

No license has been selected. All rights are reserved until the repository owner chooses one.
