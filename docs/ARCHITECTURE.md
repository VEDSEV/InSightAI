# InsightAI Architecture

**Status:** Phase 3 deterministic-analytics implementation
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

## Phase 0–3 technology decisions

| Area               | Decision                                                       | Reason                                                                                   |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Web framework      | Next.js 16 App Router                                          | Cohesive React application, server/client boundaries, routing, and production build path |
| Language           | TypeScript with `strict: true`                                 | Safer data contracts and refactoring for formula-heavy code                              |
| Styling            | Tailwind CSS 4 with semantic CSS tokens                        | Fast responsive implementation while retaining a controlled design language              |
| UI components      | Small owned primitives using CVA, clsx, and tailwind-merge     | Keeps variants explicit and accessible without bulk-generated component code             |
| Charts/icons       | Lucide icons; local SVG/CSS preview visuals                    | Establishes a coherent icon language and honest visual hierarchy without adding Recharts |
| Validation         | Owned runtime validators; no new schema dependency in Phase 3  | Exact-money and cross-row rules still require explicit validation; revisit at ingestion  |
| Testing            | Vitest, Testing Library, user-event, and jsdom                 | Covers component semantics and critical mobile behavior without superficial snapshots    |
| Formatting/linting | Prettier and ESLint flat config                                | Explicit, scriptable quality gates compatible with current Next.js conventions           |
| Persistence        | Supabase deferred to Phase 9                                   | Avoid infrastructure before user/project persistence is required                         |
| Analytics service  | In-process TypeScript first                                    | Lowest operational complexity and shared types; preserve a boundary for later extraction |
| AI                 | Deferred to Phase 7                                            | Calculations and evidence contracts must be reliable first                               |
| Sample generation  | Native TypeScript executed by Node                             | Keeps the fixture deterministic and dependency-free within the existing toolchain        |
| Dataset validation | Generator checks plus an independent serialized-CSV verifier   | Separates output verification from the generation/control-total implementation           |
| Analytics money    | Checked integer cents plus exact numerator/denominator rates   | Prevents uncontrolled floating-point monetary totals and premature percentage rounding   |
| Analytics API      | `src/analytics/index.ts` is the only supported public boundary | Prevents application code from coupling to calculation internals                         |

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

## Phase 3 analytics boundaries

- CSV parsing, normalization, row validation, dataset validation, filtering, and calculations are
  separate stages. A dataset is accepted all-or-nothing; invalid rows never enter calculations.
- Raw, normalized, canonical, validated-dataset, and result types are distinct. Canonical money is
  checked integer cents, while rates and fractional derived money retain exact numerators and
  denominators until serialization or display.
- Generic analytics code receives categorical vocabularies, ID policies, timezone, currency, and
  date coverage as configuration. It does not import the Phase 2 generator, controls, scenario
  manifest, or known product IDs.
- Application and dashboard modules may eventually import only the public analytics entry point.
  During Phase 3 they import neither the engine nor the Phase 2 CSV, and preview values remain
  isolated. A static boundary test enforces both directions.
- No decimal or schema library is added for Phase 3: lexical cents parsing, safe-integer guards, and
  cross-row reconciliation require small owned validators. This decision can be revisited when the
  Phase 5 upload/mapping surface creates a concrete schema-composition need.

## Repository boundaries

```text
src/
├── app/                  # Routes, layouts, route-specific composition, global styles
├── components/
│   ├── layout/           # Application chrome and layout components
│   └── ui/               # Reusable accessible primitives
├── features/
│   └── dashboard/        # Overview composition, public adapter, filters, charts, and evidence UI
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
public/                   # Static assets and the approved browser-fetched synthetic dashboard CSV
```

Create planned directories when they have code to own; empty abstractions are not an architecture.

## Phase 4 dashboard boundaries

- `components/layout` owns the desktop sidebar, focus-contained mobile navigation, skip link, shared
  application shell, and top header.
- `components/ui` owns reusable variants and state primitives such as buttons, cards, badges, select
  presentations, tooltips, section headers, skeletons, feedback states, and table overflow behavior.
- `features/dashboard/dashboard-sample-dataset.ts` fetches the approved synthetic CSV and passes it
  through public `ingestCanonicalCsv`; it owns source metadata and validation configuration, not
  business totals.
- `features/dashboard/analytics-adapter.ts` is the only dashboard boundary that turns public engine
  envelopes into view models. It contains no source-row aggregation or KPI formulas.
- `features/dashboard/dashboard-filter-state.ts` owns URL-search-state parsing and serialization for
  date/category/region/channel/product selections. It produces one public `FilterContextInput`.
- `features/dashboard` presentation components consume adapter values, centralized formatters, and
  bounded engine evidence. Components do not import analytics internals, Phase 2 generator tooling,
  or the source dataset.
- `analytics` remains framework-independent. Its new public performance-trend output provides
  revenue and gross-profit time buckets; React never derives those series itself.

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
- Phase 2 scripts are development tooling. They do not live in or import `src/analytics`. Phase 4
  reads the approved serialized CSV only through its browser data-source adapter and public API.

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

Phase 3 implements a supported public entry point at `src/analytics/index.ts`. Consumers use the
dataset-bound engine factory or the exported standalone functions and never import analytics
internals. Results follow a discriminated envelope rather than exposing context-free numbers:

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

The concrete contract also carries exact numerator/denominator components, comparison context,
quality state, bounded evidence, assumptions, precision, and engine version. This prevents the UI or
a future model from receiving a context-free number and is protected by contract and golden tests.

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
- Phase 4 filter controls persist compact shareable URL-search state. The adapter validates the
  resulting dates through the public API and passes the normalized filter to every engine call.
  Empty selections mean all values, matching the engine contract; no component filters raw rows.
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

### Phase 5 ingestion boundary

`src/features/ingestion/ingestion-core.ts` is a framework-independent, client-session preparation
boundary. It parses generic UTF-8 CSV as inert strings, applies file/shape guardrails, makes only
deterministic header-alias suggestions, records original-to-canonical field audits, and sends
accepted candidates through the existing public Phase 3 normalization and validation API. It does
not calculate dashboard KPIs or loosen canonical validation.

The browser workflow retains a file only long enough to read it and keeps parsed rows, mapping,
issues, and the validated dataset in React session memory. It creates no object URLs, writes no raw
rows to logs, makes no network request, and has no persistence or AI integration. Rejected rows are
inspectable. They cannot enter analytics unless the user explicitly approves their exclusion; their
audit and issue records remain visible for the session. Switching datasets clears incompatible
dashboard filters and replaces the engine-bound dataset rather than combining demo and upload rows.

### Phase 6 findings boundary

`src/findings/index.ts` is the supported public deterministic findings facade. It consumes only a
dataset-bound Phase 3 public analytics engine and validated metadata, then applies versioned,
visible rule configuration for materiality, suppression, evidence strength, deduplication, and
stable ranking. It neither parses raw CSV nor imports dashboard presentation code. The Phase 4
adapter asks it for a bounded top-six view using the same filter context, and the findings drawer
reveals the original engine evidence plus rule metadata.

### Phase 7 grounded-AI boundary

`src/app/api/ai/explain/route.ts` is the only dashboard-facing AI invocation boundary. Client
components create a minimized, typed evidence packet and receive only sanitized result/error objects;
they do not import the provider, SDK, or environment configuration. `src/ai/provider.ts` owns the
server-side OpenAI Responses API integration, strict JSON Schema output, `store: false`, timeout, and
bounded retry policy. `src/ai/service.ts` owns cache isolation and the final local validation pass.
Deterministic findings remain available when a provider is absent, refuses a request, times out, is
rate limited, or fails grounding.

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

The Phase 3 performance revision applies this approach inside each immutable dataset-bound engine.
A private runtime normalizes exact filter keys, pre-indexes dataset vocabulary and repeat status,
and retains at most eight immutable analysis contexts in an LRU. Each context shares selected rows,
base totals, bounded-evidence support, all-six-dimension grouping, and daily date indexes on demand.
Current and prior comparison periods use separate exact contexts in the same runtime.

The cache is neither global nor unbounded, carries a private runtime identity, and stores no
cross-engine final results. A new engine therefore cannot observe stale state from another dataset
or configuration. Standalone calls use an ephemeral runtime. Evidence-equivalence, LRU-eviction,
immutability, and cross-runtime-rejection tests guard this boundary.

The recorded 55,272-row medians meet the internal targets for KPIs, breakdowns, comparisons, and
anomalies, and a 110,544-row fixture provides descriptive scaling evidence. The protocol and
limitations are documented in `docs/ANALYTICS_BENCHMARKS.md`; local measurements are not universal
production service-level claims.

## Architecture decision process

Material changes should be recorded in this document or a future ADR directory with: context,
decision, alternatives, consequences, reversal plan, and date. The next decisions expected are the
canonical runtime validation schema, Phase 3 decimal representation, dashboard state model,
representative dataset ceiling, and upload compute location.
