# Phase 5 CSV ingestion

The ingestion core accepts UTF-8 CSV only and deliberately operates in the browser session. Its
8 MB, 50,000-row, and 100-column limits are guardrails for local client processing. It supports
comma, semicolon, and tab delimiters; malformed CSV, duplicate/empty headers, inconsistent widths,
invalid encoding, and empty files are rejected before a dataset reaches analytics.

The canonical target list is the analytics order-line schema. Suggestions are deterministic header
normalization and aliases, never AI. Mapping remains editable and one source column may map to only
one target. The preparation report preserves `original value -> explicit transformation -> canonical
value`, classifies issues as blocking errors, warnings, or informational transformations, and shows
bounded row-level inspection.

Dates support ISO and user-selected numeric interpretations; ambiguous numeric dates are rejected
until the interpretation is selected. Money cleanup optionally removes currency symbols and grouping
separators before the analytics engine parses integer cents. Identifier values stay strings, so
leading zeros survive. Required values are never fabricated. Optional segment/campaign blanks become
null during canonical normalization; an absent optional discount is explicitly defaulted to zero.

The resulting rows use the supported public normalization and validation boundary, then create the
same dataset-bound engine and dashboard adapter as the demo. Invalid rows require an explicit
exclusion approval before analytics; no source row is silently dropped. There is no upload storage,
telemetry of raw CSV contents, object URL retention, or direct AI call in Phase 5. Phase 7 can send
only a minimized evidence packet after a user explicitly requests an explanation and completes the
privacy review; raw files and rows are not included in that packet.

One readiness state controls the full handoff: required mappings must be complete, rejected rows
must be corrected or explicitly excluded, and the resulting candidate dataset must pass analytics
validation. Extra unmapped source columns are informational only. The same readiness state controls
the reconciliation status, navigation to dashboard opening, and whether the dashboard button is
enabled.

`pnpm benchmark:ingestion` measures a small 24-row fixture, the approved 6,909-row fixture, and a
50,000-row shape fixture. On the recorded local run, parse/mapping/preparation were respectively
3.63/0.80/35.44 ms, 128.46/0.42/205.43 ms, and 1024.47/0.14/956.67 ms. The 50k fixture deliberately
repeats source IDs to measure client-side shape work and therefore does not claim a valid engine
handoff. These are local observations, not universal browser performance guarantees.
