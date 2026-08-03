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
