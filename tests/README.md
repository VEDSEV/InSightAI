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
