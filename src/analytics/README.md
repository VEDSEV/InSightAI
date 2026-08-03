# Analytics module

This directory is reserved for Phase 3's deterministic analytics engine. Business formulas belong
here as small, pure, tested functions. UI components may consume computed results but must not
reimplement calculations.

No analytics calculations are implemented through Phase 2. The generated dataset and its control
checks live under `data/sample` and `scripts/sample-data`; they do not implement production metrics.
See `docs/ANALYTICS_SPEC.md` for the approved data contract, formulas, edge cases, and Phase 3 test
strategy.
