# Test strategy

- Unit tests validate pure analytics and validation functions.
- Contract tests validate input schemas and canonical transformations.
- Component tests cover important accessible interactions when UI behavior begins in Phase 1.
- End-to-end tests are added for upload-to-dashboard journeys in Phase 5.

Tests must assert derived results from fixture inputs; snapshots of unexplained business output are
not an acceptable substitute for formula-level assertions.

Phase 1 tests use Testing Library and jsdom to verify shell/navigation semantics, mobile-menu focus
and Escape behavior, KPI comparison labeling, reduced-motion classes, feedback-state roles, sample
workspace labeling, and intentionally disabled preview filters. Snapshot-only tests are avoided.

Phase 2 adds Node-environment tests for fixed-seed reproducibility, byte-level checksum stability,
order-line grain, schema completeness, arithmetic, allowed dimensions, synthetic customer privacy,
marketing allocation, independent control totals, repeat-customer rules, and all ten directional
scenarios. Profile guardrails cover order shape, quantity, customer frequency, order revenue,
discounts, marketing coverage, normalized dimension shares, and optional-field missingness. Margin
scenario tests prove the aggregate-loss, promotional-row-loss, and positive low-margin cases remain
distinct. The generated CSV verifier follows a separate calculation path from the generator.

## Phase 3 verification groups

The Phase 3 suite is being added on `feat/phase-3-analytics-engine`. Its acceptance results are not
claimed until the complete repository gate runs. Tests are organized by behavior rather than broad
snapshots:

- **Money and rates:** decimal-string parsing, fractional-cent rejection, negative constraints, safe
  large accumulation, rational values, half-away-from-zero basis-point rounding, zero denominators,
  negative margins, ROI boundaries, and repeated aggregation without floating-point drift.
- **Parsing and validation:** raw CSV structure, normalization, required/optional fields, IDs, civil
  dates, dimension values, quantity, money syntax, arithmetic reconciliation, duplicate line IDs,
  dataset date coverage, currency, timezone, and explicit rejection paths.
- **Golden fixtures:** independently written expectations for multi-line orders, repeat behavior,
  zero revenue and prior revenue, negative margin, discounts, optional-dimension nulls, single-line
  marketing allocation, empty data, insufficient history, mixed dimensions, and leap/month
  boundaries.
- **Filters and KPIs:** immutable composable filters, one shared filtered row set, missing-value
  selection, within-selection and full-dataset repeat scope, all core formulas, context-preserving
  result envelopes, and non-computable variants.
- **Comparisons:** equal-length boundaries; aligned full calendar month/quarter rules and
  `invalid_filter` partial behavior; previous-year February 29 clamping; same non-date filters;
  unequal month lengths; zero prior values; insufficient coverage; and separation of absolute,
  relative, and percentage-point change.
- **Breakdowns and concentration:** requested dimensions and measures, explicit missing keys,
  deterministic tie-breaking, exact reconciliation, revenue/profit shares, top-one/top-three/top-five
  shares, HHI, and zero-total behavior.
- **Diagnostics and trends:** negative-row/product/aggregate margins, configurable high-revenue
  low-margin rules, promotional-loss evidence, period trends, consecutive declines, and segment
  contributions that reconcile to the total change without causal claims.
- **Anomalies and evidence:** daily/weekly aggregation, trailing median/MAD baselines, configurable
  history and threshold, relative/absolute materiality, zero-MAD fallback, default exclusion of
  partial weekly buckets, known Phase 2 spike/drop detection, the documented holiday-seasonality
  limitation, insufficient-history versus no-anomaly states, the default 12-ID deterministic sample
  cap, and total evidence support counts.
- **Analysis-context lifecycle:** canonical-equivalent filter reuse, immutable/frozen contexts,
  eight-entry LRU eviction, lazy all-dimension grouping, and rejection of contexts from another
  runtime even when dataset metadata matches.
- **Evidence equivalence:** representative legacy fingerprint literals (including Unicode), exact
  equality between prepared and direct evidence, and equality between engine/runtime and standalone
  public metric paths.
- **Phase 2 reconciliation:** exact row, order, customer, quantity, cents-based monetary, repeat, and
  category/region/channel controls computed through the public engine API rather than copied from
  fixture reports.
- **Invariant and mutation checks:** revenue equals cost plus gross profit; exhaustive partitions
  reconcile; shares sum within documented precision; filtering never creates or mutates rows; order
  counts do not exceed line counts; repeat counts do not exceed customer counts; margins agree with
  their rational components; and sorting remains stable.
- **Dashboard boundary:** the Phase 3 static check proved dashboard components did not import
  analytics internals, consume Phase 2 data, or independently implement business formulas. Phase 4
  now permits the public analytics barrel through its adapter while retaining the no-internals and
  no-formula rules.

## Benchmarks

Performance tests measure, separately, parsing/validation, core KPIs, breakdowns, comparisons, and
anomalies on the 6,909-line Phase 2 CSV and deterministic 55,272- and 110,544-line fixtures. The
completed full run uses two warm-ups and seven serial measurements. Each analytics measurement
constructs a fresh engine; only calls within that batch share its bounded contexts.

The benchmark-contract test validates fixture scale, CLI selection, cache methodology, complete
public-output/evidence digests, preservation of the original baseline artifact, and all four x8
target assessments. Runtime, hardware, construction rules, exact before/after medians, and
limitations live in `docs/ANALYTICS_BENCHMARKS.md`,
`benchmarks/phase3-analytics-before-optimization.json`,
`benchmarks/phase3-analytics-profile.json`, and `benchmarks/phase3-analytics.json`. These local
measurements are not universal production guarantees.

## Phase 4 verification groups

- **Dashboard adapter:** the approved Phase 2 CSV is loaded through the public ingestion API, the
  dashboard view model reconciles to headline controls, and its KPI, trend, and four visible
  breakdowns preserve the same normalized filter context.
- **Filter state and comparisons:** date/category/region/channel/product selections serialize to
  shareable URL parameters, complete 2025 prior-year comparisons are exposed, and valid no-row
  selections use typed empty/non-computable states.
- **Presentation and evidence:** currency/rate/count formatting is tested independently; KPI cards,
  active controls, reset behavior, evidence disclosure, and bounded identifiers have accessible
  component coverage.
- **Boundary and accessibility:** static architecture checks allow dashboard imports only from the
  public analytics barrel, reject dashboard business arithmetic and Phase 2 tooling imports, confirm
  preview code was removed, and preserve mobile navigation/reduced-motion checks.

## Phase 5 verification groups

- **Ingestion core:** file guards, UTF-8 decoding, CSV syntax and header safety, deterministic
  aliases, editable mappings, date ambiguity, currency cleanup, leading-zero IDs, optional values,
  invalid-row disposition, explicit exclusion approval, reconciliation totals, and canonical-engine
  handoff.
- **Safety:** formula-like cell text remains inert and visible only as source data; no parsing path
  evaluates HTML, spreadsheet formulas, or uploaded code.
- **Workspace switching:** the dashboard retains the demo dataset, exposes the upload entry point,
  and resets filters when an uploaded session dataset replaces it.

## Phase 6 verification groups

- **Findings engine:** deterministic rule outputs, bounded evidence, materiality suppression,
  ranking, filter propagation, scenario detection, and non-causal/non-prescriptive language.

## Phase 7 verification groups

- **Provider contract:** minimized packet size and identifier exclusion, strict output-shape checks,
  mock-only deterministic tests, cache isolation by immutable packet/provider identity, numerical and
  citation grounding, causal-claim rejection, and safe recommendation policy checks.
- **Secret boundary:** client presentation code may call the sanitized API route only; the OpenAI SDK
  and `OPENAI_API_KEY` remain in server-side provider code.

## Phase 8 verification groups

- **Founder experience:** the default Home maps authoritative `DashboardViewModel` values into a
  plain-language snapshot and Insights without exposing advanced filters by default; Explore still
  exposes the existing shared advanced workspace.
- **Progressive disclosure:** founder navigation, advanced-view switching, upload entry, and
  evidence/detail actions remain keyboard-operable and preserve the public analytics boundary.
