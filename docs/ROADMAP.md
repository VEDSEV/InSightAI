# InsightAI Delivery Roadmap

This roadmap protects correctness by making each phase earn the next. A phase is complete only when
its acceptance criteria are demonstrated and blocking decisions are recorded. Dates are intentionally
omitted until capacity and review cadence are known.

## Cross-phase definition of done

- Scope matches the current phase and non-goals remain intact.
- Relevant documentation reflects actual behavior.
- Lint, strict type checking, tests, formatting, and production build pass.
- New user-facing interaction is keyboard accessible, responsive, and checked with reduced motion.
- New calculations include formula, grain, edge-case, and fixture tests.
- New dependencies have a clear current use and acceptable maintenance/security posture.
- No secrets, personal data, or proprietary datasets are committed.

## Phase 0 — Product definition and repository setup

**Goal:** establish a reviewable product and engineering foundation without implying that analytics
features already exist.

**Deliverables**

- PRD, roadmap, architecture, analytics specification, design system, AI safety policy, and README.
- Minimal Next.js App Router shell using strict TypeScript and Tailwind CSS.
- ESLint, Prettier, Vitest, environment template, Git hygiene, and source boundaries.
- Placeholder areas for analytics, UI primitives, sample data, and tests.

**Acceptance criteria**

- Every requested document exists and agrees on scope and terminology.
- The application shell contains no fake business metrics or AI behavior.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, and `pnpm build` pass.
- Repository audit and architecture decisions are included in the handoff.
- A human reviews Phase 0 before Phase 1 begins.

## Phase 1 — Dashboard shell and design system

**Goal:** create the accessible visual and interaction framework that later receives real analytics.

**Deliverables**

- App navigation, dashboard layout, filter region, content grid, and responsive behavior.
- Token-backed UI primitives for buttons, inputs, cards, badges, alerts, skeletons, and tooltips.
- Loading, empty, error, and reduced-motion variants.
- Story/demo states using clearly labeled structural placeholders, not business results.

**Acceptance criteria**

- Layout works at 320 px, 768 px, 1024 px, and wide desktop sizes without horizontal overflow.
- Primary controls are keyboard operable with visible focus and suitable accessible names.
- Color contrast meets WCAG 2.2 AA and motion honors `prefers-reduced-motion`.
- Components use shared tokens and variants rather than one-off styling.
- No hard-coded values can be mistaken for calculated business performance.

## Phase 2 — Realistic order-level sample dataset

**Goal:** provide a safe, documented dataset with enough variation to exercise real analytical cases.

**Deliverables**

- Synthetic order-line CSV using the canonical schema.
- Generator or reproducible creation process, data dictionary, provenance note, and checksum.
- Known scenarios: repeat customers, seasonality, multiple channels/regions, negative-margin products,
  high-revenue low-margin products, declines, missing optional dimensions, and controlled anomalies.

**Acceptance criteria**

- Dataset contains no real personal or company data.
- Expected aggregate control totals are independently documented and tested.
- Each designed scenario is traceable to specific fixture rows without making the dashboard outcome
  a hidden hard-coded constant.
- Grain, date range, currency assumption, and marketing-spend semantics are explicit.

## Phase 3 — Deterministic analytics engine

**Goal:** implement the analytics specification as framework-independent, tested functions.

**Deliverables**

- Canonical row types and validation contract.
- Filters, aggregation helpers, KPI calculations, comparison logic, breakdowns, concentration,
  segment rules, and anomaly detection.
- Typed result envelopes with value, unit, period, filter context, status, and evidence references.
- Unit and property-oriented edge-case tests.

**Acceptance criteria**

- Every formula in `ANALYTICS_SPEC.md` has normal, boundary, and invalid-input tests.
- Fixture outputs reconcile to independently calculated control totals.
- Divide-by-zero and insufficient-history cases return explicit non-computable states.
- Presentation code contains no duplicate formulas.
- Performance is benchmarked on the Phase 2 dataset and representative larger fixtures.

## Phase 4 — Interactive filters and visualizations

**Goal:** turn tested analytics outputs into an explorable business view.

**Deliverables**

- KPI cards, trend charts, dimensional breakdowns, comparison treatments, and evidence details.
- Date, product, category, region, and channel filters with shareable internal state.
- Accessible chart summaries, polished tooltips, transitions, reset behavior, and responsive layouts.

**Acceptance criteria**

- One filter context is applied consistently across every visible result.
- Charts answer named analytical questions and use appropriate scales, labels, and zero baselines.
- Table/text alternatives expose essential values to non-visual users.
- Filter updates meet the measured performance target on representative hardware.
- Visual results match engine outputs in integration tests.

## Phase 5 — Data upload, validation, cleaning, and column mapping

**Goal:** let a user safely transform a familiar export into the canonical schema.

**Deliverables**

- CSV upload, preview, encoding/size guardrails, mapping UI, validation summary, and remediation path.
- Explicit transformations for dates, numbers, whitespace, categories, and identifiers.
- Reconciliation report showing input, accepted, rejected, and warning row counts plus control totals.

**Acceptance criteria**

- Critical invalid data cannot enter analytics silently.
- Users can download or inspect actionable row-level errors.
- Original values remain available for audit during the session.
- Formula results on imported fixtures equal results on equivalent canonical fixtures.
- File handling passes security, privacy, large-file, and malformed-input tests.

## Phase 6 — Automated findings, risks, and opportunities

**Goal:** prioritize deterministic observations without using generative AI.

**Deliverables**

- Rule engine using documented thresholds, materiality, evidence IDs, and severity.
- Findings for declines, concentration, negative margins, high-revenue low-margin items, and anomalies.
- Deduplication, ranking, and insufficient-evidence suppression.

**Acceptance criteria**

- Every finding can be reproduced from its evidence and rule version.
- Tests cover triggering, non-triggering, threshold boundary, and contradictory-signal cases.
- Findings use observational language and do not imply causality.
- Users can see why a finding appeared and which filters/periods produced it.

## Phase 7 — AI explanations and evidence-based recommendations

**Goal:** add useful narrative while retaining deterministic facts and visible uncertainty.

**Deliverables**

- Grounded explanation service consuming typed evidence packets, not raw unrestricted datasets.
- Citation validation, claim/evidence checks, prompt versioning, safety fallback, and user feedback.
- Clear separation of calculated facts, model interpretation, and proposed actions.

**Acceptance criteria**

- Numerical claims resolve to valid evidence IDs and match deterministic values.
- Unsupported claims are rejected or rewritten before display.
- Adversarial, missing-context, stale-data, and prompt-injection evaluations pass agreed thresholds.
- Users can inspect supporting evidence and see that content is AI-generated.
- No customer data is sent to a model without documented consent, retention, and provider settings.

## Phase 8 — AI chat grounded in calculated metrics

**Goal:** support follow-up questions within the available analytical evidence.

**Deliverables**

- Intent routing, metric/evidence retrieval, constrained answer generation, citations, and conversation
  context controls.
- Clear handling for unsupported questions, causal requests, missing metrics, and ambiguous filters.

**Acceptance criteria**

- Golden-question evaluations verify factual and citation correctness.
- Chat cannot alter authoritative calculations or bypass project authorization.
- Each answer displays period/filter context and distinguishes data from inference.
- Cost, latency, privacy, and failure behavior meet documented service targets.

## Phase 9 — Authentication, saved projects, and storage

**Goal:** make user data durable and isolated using Supabase if it remains the best fit.

**Deliverables**

- Authentication, project ownership, PostgreSQL schema, row-level security, storage, deletion, and
  migration strategy.
- Dataset, mapping, metric-run, finding, and report version records.

**Acceptance criteria**

- Authorization tests prove one user cannot access another user's objects or storage paths.
- Service-role credentials remain server-only and secrets are managed outside source control.
- Data retention and deletion are documented and tested.
- Migrations are reproducible and a backup/restore exercise succeeds.

## Phase 10 — Executive report export, testing, deployment, documentation, and portfolio polish

**Goal:** ship a credible, demonstrable product with an honest case study.

**Deliverables**

- Accessible executive report export with evidence and caveats.
- End-to-end suite, performance/accessibility/security review, deployment, monitoring, runbook, demo,
  and portfolio case study.

**Acceptance criteria**

- Production smoke tests and critical end-to-end journeys pass.
- Exported values and context match the interactive dashboard.
- Deployment, rollback, monitoring, privacy, and incident procedures are documented.
- The portfolio narrative identifies the problem, decisions, tradeoffs, validation, outcomes, and
  remaining limitations without overstating adoption or AI capability.

## Review gates

At the end of each phase, review:

1. acceptance evidence and automated checks;
2. documentation changes and unresolved decisions;
3. user or evaluator feedback relevant to the next phase;
4. risks introduced, retired, or re-ranked;
5. whether the proposed next-phase dependency and architecture choices still hold.

Phase 1 must not begin until the repository owner approves the Phase 0 foundation.
