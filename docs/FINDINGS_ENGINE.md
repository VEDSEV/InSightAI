# Deterministic findings engine

Phase 6 adds `src/findings/index.ts`, the supported public entry point for ranked deterministic
business observations. It accepts a dataset-bound public analytics engine and validated dataset; it
never parses CSV, reads raw upload state, or recalculates KPIs.

## Rule policy

Rules are versioned as `findings-rules-v1`. Project defaults are visible in
`src/findings/configuration.ts`: material changes require at least $100 absolute exposure or 10%
movement; segment movement requires $75; concentration is reported from a 30% top-one revenue share;
and weak marketing contribution requires at least $50 measured spend with non-positive descriptive
ROI. These are project defaults, not universal industry standards.

The engine evaluates revenue, profit, gross-margin, marketing-ROI, and repeat-rate comparisons;
category/region/channel/product change and concentration; margin diagnostics; consecutive regional
revenue decline; top regional contributors; revenue anomalies; marketing efficiency; and downstream
validation caveats. A result is suppressed for insufficient comparison history, invalid denominators,
immaterial exposure, a minimum supporting-order requirement (including concentration), or a stronger
equivalent finding. This prevents a very small uploaded selection from being labelled concentrated
solely because it has few rows.

## Ranking and evidence

Priority is explicit: severity base weight plus capped exposure, movement, evidence-strength, and
persistence contributions. `Strong`, `Moderate`, and `Limited` evidence are deterministic support
labels based on complete comparisons and bounded row/order support; they are not statistical
confidence intervals. Stable tie-breaking uses the deterministic finding ID.

Every public finding retains the analytics engine's bounded `EvidenceReference` objects, filter
context, active period, rule/version, thresholds, and materiality. Templates describe observations
only: they do not claim causes, forecasts, or prescribe actions.

## Dashboard behavior and limits

The dashboard requests the top six ranked findings from the same canonical filter context as KPIs,
charts, and tables. The public API can return the full ranked set. Uploaded session datasets use the
same path; switching datasets clears incompatible filters and selection state.

Each findings-engine instance keeps at most eight immutable filter-and-limit result entries in a
private LRU cache. The cache belongs to one validated dataset-bound engine, has no global scope, and
cannot return a result from a different dataset or filter context.

`pnpm benchmark:findings` warms a dataset-bound engine once, runs seven measurements, and reports
median and maximum generation time for the full Phase 2 dataset, a West-region filter, and the
Phase 5 uploaded fixture. Results are local observations rather than a service-level guarantee.
