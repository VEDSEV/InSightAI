# InsightAI Architecture

**Status:** Phase 2 synthetic-data baseline
**Architecture style:** modular Next.js application with a framework-independent analytics core

## Goals and constraints

The architecture must make analytical correctness easier to review than visual presentation. It
should start simple enough for one developer, keep future service boundaries possible, and avoid
committing to cloud infrastructure before persistence is needed.

Key constraints:

- strict TypeScript and explicit contracts at boundaries;
- deterministic calculations independent of React and transport code;
- one canonical data grain and documented time/currency semantics;
- no language model in the authoritative calculation path;
- browser and server responsibilities chosen from measured privacy/performance needs;
- Windows-compatible local workflow;
- dependencies added only with an active use case.

## Phase 0–2 technology decisions

| Area               | Decision                                                     | Reason                                                                                   |
| ------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Web framework      | Next.js 16 App Router                                        | Cohesive React application, server/client boundaries, routing, and production build path |
| Language           | TypeScript with `strict: true`                               | Safer data contracts and refactoring for formula-heavy code                              |
| Styling            | Tailwind CSS 4 with semantic CSS tokens                      | Fast responsive implementation while retaining a controlled design language              |
| UI components      | Small owned primitives using CVA, clsx, and tailwind-merge   | Keeps variants explicit and accessible without bulk-generated component code             |
| Charts/icons       | Lucide icons; local SVG/CSS preview visuals                  | Establishes a coherent icon language and honest visual hierarchy without adding Recharts |
| Validation         | Zod planned for ingestion boundary, not installed            | Runtime parsing will be required in Phase 3/5; types alone do not validate uploads       |
| Testing            | Vitest, Testing Library, user-event, and jsdom               | Covers component semantics and critical mobile behavior without superficial snapshots    |
| Formatting/linting | Prettier and ESLint flat config                              | Explicit, scriptable quality gates compatible with current Next.js conventions           |
| Persistence        | Supabase deferred to Phase 9                                 | Avoid infrastructure before user/project persistence is required                         |
| Analytics service  | In-process TypeScript first                                  | Lowest operational complexity and shared types; preserve a boundary for later extraction |
| AI                 | Deferred to Phase 7                                          | Calculations and evidence contracts must be reliable first                               |
| Sample generation  | Native TypeScript executed by Node                           | Keeps the fixture deterministic and dependency-free within the existing toolchain        |
| Dataset validation | Generator checks plus an independent serialized-CSV verifier | Separates output verification from the generation/control-total implementation           |

The initial shell uses no remote font request so local and CI production builds do not depend on a
font CDN.

## System context and data flow

```text
User
  -> Next.js presentation and interaction layer
  -> import/mapping boundary (Phase 5)
  -> canonical validation and normalization
  -> deterministic analytics core
  -> typed metrics, comparisons, breakdowns, quality state, and evidence IDs
  -> dashboard and rule-based findings
  -> bounded AI explanation/chat adapter (Phase 7+, optional)

Future persistence:
  Next.js server boundary -> Supabase Auth / PostgreSQL / Storage
```

The UI may request calculations but cannot define them. The AI adapter may explain calculation
outputs but cannot modify or replace them.

## Repository boundaries

```text
src/
├── app/                  # Routes, layouts, route-specific composition, global styles
├── components/
│   ├── layout/           # Application chrome and layout components
│   └── ui/               # Reusable accessible primitives
├── features/
│   └── dashboard/        # Overview composition, previews, and isolated synthetic UI data
├── analytics/            # Pure formulas, grouping, comparison, anomaly, finding rules
├── lib/                  # Cross-cutting framework-independent utilities/configuration
├── schemas/              # Runtime input schemas and canonical transforms (planned)
├── types/                # Shared domain contracts when they outgrow owning modules (planned)
└── server/               # Server-only adapters for storage/external services (planned)

data/sample/              # Synthetic data, dictionary, generator, control totals
scripts/sample-data/      # Config, catalog/customer rules, scenarios, generation, validation
scripts/*.ts              # Generate/verify entry points; no production analytics
tests/                    # Contract/integration tests spanning modules
docs/                     # Durable product and engineering decisions
public/                   # Static assets only
```

Create planned directories when they have code to own; empty abstractions are not an architecture.

## Phase 1 presentation boundaries

- `components/layout` owns the desktop sidebar, focus-contained mobile navigation, skip link, shared
  application shell, and top header.
- `components/ui` owns reusable variants and state primitives such as buttons, cards, badges, select
  presentations, tooltips, section headers, skeletons, feedback states, and table overflow behavior.
- `features/dashboard` owns Overview-specific composition, KPI cards, question-led preview visuals,
  the performance-table preview, and the component state gallery.
- `features/dashboard/preview-data.ts` is the only source of displayed synthetic business values.
  It is presentation fixture content, not a dataset and not an analytics input.
- `analytics` remains unchanged and contains no Phase 1 metrics.

The shell uses Server Components by default. The tooltip and mobile navigation are client boundaries
because they require focus, keyboard, and disclosure state. Future routes should reuse the shell and
navigation model rather than duplicate application chrome.

## Phase 2 synthetic-data boundaries

- `data/sample/generator-config.json` owns the fixed seed, versions, period, customer propensities,
  optional-dimension missingness, and order shape. The generated CSV, checksum, control totals,
  scenario manifest, and machine/human distribution profiles are reviewable artifacts.
- `scripts/sample-data/catalog.ts` owns fictional product definitions; `customers.ts` owns opaque
  customer generation/assignment rules; `scenarios.ts` owns seasonal, regional, channel, discount,
  margin, concentration, decline, anomaly, and marketing-spend behavior.
- `generator.ts` creates order shells and reconciled lines using integer cents. `csv.ts` only
  serializes stable column order. `validation.ts` checks the typed in-memory dataset before output.
- `scripts/verify-sample-data.ts` deliberately does not import the generator's control calculation.
  It reparses the CSV and independently reconciles arithmetic, grain, required-field completeness,
  optional-field missingness, controls, the distribution profile, scenario evidence, customer
  privacy patterns, marketing allocation, and SHA-256.
- Phase 2 scripts are development tooling. They do not live in or import `src/analytics`, and the
  Phase 1 dashboard continues to use only `features/dashboard/preview-data.ts`.

## Canonical data contract

The initial canonical grain is one order line. An `order_id` may appear on multiple rows, while each
row has a unique `order_line_id` and describes one product line, quantity, unit values, explicit
discount, revenue, cost, optional campaign context, and uniquely allocated marketing spend.
The required fields and precise constraints are defined in `ANALYTICS_SPEC.md`.

The pipeline must keep three representations distinct:

1. **Raw input:** unchanged user-provided values and headers, session-scoped until persistence exists.
2. **Canonical rows:** parsed, mapped, validated values with normalized dimensions and dates.
3. **Analytical outputs:** typed derived values plus period, filters, quality status, and evidence.

Transformations must be auditable. Rejected rows never disappear silently, and raw strings must not
flow into calculations merely because TypeScript assigns them a type.

## Analytics API shape

The detailed types will be implemented in Phase 3, but results should follow this conceptual envelope:

```ts
type MetricResult = {
  metricId: string;
  value: number | null;
  status: "ok" | "not_applicable" | "insufficient_data";
  unit: "currency" | "count" | "percent" | "ratio";
  period: { start: string; end: string; timezone: string };
  filters: Record<string, readonly string[]>;
  evidence: { datasetVersion: string; rowCount: number };
  assumptions: readonly string[];
};
```

This envelope prevents the UI or a future model from receiving a context-free number. Exact types
will be refined before implementation and validated with contract tests.

## Computation placement

Start with pure TypeScript functions callable on the server or, for safe sample/local data, in a Web
Worker or client boundary. Do not couple the analytics core to Next.js request objects, React state,
database clients, or chart props.

A Python/FastAPI service should be proposed only when one or more measured conditions hold:

- supported datasets exceed practical memory/latency targets in the chosen TypeScript execution
  environment;
- a necessary, mature statistical/data-processing library has no reliable TypeScript equivalent;
- independent scaling or scheduled workloads justify the operational boundary;
- the team can support deployment, versioned contracts, authentication, observability, and retries.

Extraction would use versioned request/response schemas and golden fixture parity tests. Language
preference alone is not a sufficient reason.

## State and filter model

- URL-search state should own shareable dashboard filters where feasible.
- One normalized filter object is passed to all calculations for a view.
- UI-only state such as open panels remains local.
- Server/cache state should use framework primitives first; add a data-fetching library only when
  synchronization needs justify it.
- The selected timezone, inclusive/exclusive date semantics, and comparison mode are part of filter
  context, not hidden globals.
- Phase 1 filter controls are visibly labeled preview controls and remain disabled. They must not
  acquire local mock filtering logic that could drift from the Phase 3 analytics engine.
- Mobile-navigation disclosure state is local UI state. Opening the dialog moves focus inside, traps
  keyboard focus, locks body scroll, supports Escape, and restores focus to the trigger on close.

## Future persistence model

Phase 9 will validate the design before implementation. Expected entities include user, workspace,
project, dataset, dataset version, upload object, column mapping, validation run, analysis run,
finding, and report. PostgreSQL row-level security should enforce ownership, while storage paths are
scoped by account/project identifiers.

Raw uploads, normalized data, and derived runs need different retention policies. Service-role access
must remain server-only. Database types should be generated, migrations versioned, and authorization
tested from the perspective of a hostile authenticated user.

## Security and privacy boundaries

- Treat file content, headers, filenames, and future chat text as untrusted input.
- Enforce file type, size, encoding, and parsing limits before expensive work.
- Escape spreadsheet-formula-like content in exported CSVs.
- Avoid collecting direct customer attributes; the initial schema uses an opaque customer ID.
- Never log raw rows, secret values, or full model prompts containing customer data by default.
- Keep secrets in environment-specific secret stores and `.env.local`, which is ignored by Git.
- Apply content-security and secure response headers when third-party integrations are introduced.
- Document model-provider retention and training settings before any customer data reaches AI.

## Error and quality model

Expected error categories are input validation, unsupported semantics, insufficient data,
non-computable metric, service failure, authorization failure, and unexpected defect. UI messages
should state what happened, which data is affected, and the next safe action.

Analytical results carry quality state. A value can be arithmetically valid but unsuitable for a
finding because of insufficient support, missing prior history, unknown spend semantics, or rejected
rows. Warnings must remain visible downstream.

## Testing strategy

- **Unit:** pure formulas, filters, grouping, thresholds, rounding, and edge cases.
- **Contract:** raw-to-canonical parsing and typed result envelopes.
- **Golden fixture:** independently calculated control totals for a small readable dataset.
- **Synthetic dataset:** byte-level reproducibility, serialized-CSV controls, schema/grain/privacy
  invariants, and directional scenario thresholds for the representative Phase 2 fixture.
- **Property-oriented:** invariants such as segment revenue summing to total when dimensions are
  exhaustive.
- **Component:** keyboard behavior, state transitions, accessible names, and data display.
- **End-to-end:** sample and upload journeys, filter consistency, evidence drill-down, and export.
- **AI evaluation:** citation correctness, unsupported-claim refusal, injection resistance, and
  numerical fidelity after Phase 7.

CI should run formatting check, lint, type checking, tests, and build. Analytics coverage is measured
separately so broad UI files cannot hide weak formula coverage.

## Performance approach

Measure before distributing the system. Track parse time, normalization time, calculation time,
render time, memory, and row count with synthetic fixtures. Prefer pre-indexing repeated dimensions,
memoizing by immutable filter/dataset version, and moving CPU work off the main thread before adding
a network service. Performance optimizations must preserve golden-fixture parity.

## Architecture decision process

Material changes should be recorded in this document or a future ADR directory with: context,
decision, alternatives, consequences, reversal plan, and date. The next decisions expected are the
canonical runtime validation schema, Phase 3 decimal representation, dashboard state model,
representative dataset ceiling, and upload compute location.
