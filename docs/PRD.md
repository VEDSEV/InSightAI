# InsightAI Product Requirements Document

**Status:** Phase 0 baseline  
**Owner:** Repository owner  
**Last updated:** 2026-08-01  
**Initial audience:** Small e-commerce owners, operators, analysts, and managers

## Product vision

Give small e-commerce teams a fast, trustworthy way to understand what is driving sales and
profitability, identify where attention is needed, and make evidence-based operating decisions
without first becoming dashboard engineers.

InsightAI should feel like a capable analytical workspace: approachable enough for an owner, precise
enough for an analyst, and transparent enough that every claim can be checked.

## Problem statement

Small commerce teams often manage order data across exports and spreadsheets. Answering basic
questions—what changed, which products are actually profitable, where revenue is concentrated, or
whether marketing spend is producing contribution—requires manual cleanup and repeated formulas.
Existing BI tools can be expensive or require modeling expertise, while generic AI chat can produce
answers that are difficult to verify.

The product opportunity is to combine a guided data workflow, deterministic business calculations,
clear visual analysis, and eventually evidence-grounded explanations in one focused experience.

## Target users

### Primary persona: small e-commerce operator

- Owns or manages a growing online business.
- Works with CSV or spreadsheet exports from storefront, marketplace, payment, or marketing systems.
- Needs weekly or monthly answers about growth, margin, products, customers, regions, and channels.
- Has limited time and may not know SQL or BI modeling.

### Secondary personas

- **Business or data analyst:** wants a clean, inspectable starting point for analysis.
- **Functional manager:** needs a reliable operating view and understandable exceptions.
- **Founder or owner:** needs an executive summary without losing access to evidence.

## Core user needs

1. Bring order-level data into the product safely and understand whether it is usable.
2. See consistent KPI definitions and comparisons without rebuilding formulas.
3. Filter results by time, product, category, region, and sales channel.
4. Understand the evidence behind an automated finding.
5. Distinguish data-quality limitations from genuine business changes.
6. Ask natural-language questions only after reliable calculations exist.
7. Save or export a concise view for decisions and communication.

## Primary use cases

- Review sales and gross-profit performance for a selected period versus a comparable prior period.
- Find products or categories that generate revenue but dilute margin.
- Identify negative-margin items and declining segments.
- Understand revenue concentration by product, category, region, or channel.
- Assess customer repeat behavior and marketing contribution.
- Upload a new export, map unfamiliar columns, and resolve validation issues.
- Review rule-based findings, then later request a grounded explanation or recommendation.

## MVP scope

The first usable product increment covers:

- a synthetic order-line dataset and documented canonical schema;
- deterministic calculation of the approved KPI set;
- responsive dashboard with date and dimensional filters;
- period-over-period comparisons and transparent formula context;
- upload of CSV data, column mapping, validation, and actionable error reporting;
- rule-based findings for material risks and opportunities;
- automated tests for calculation and validation behavior.

AI explanation, chat, accounts, saved projects, and report export follow only after the deterministic
MVP passes its quality gates.

## Non-goals

- Replacing an accounting system, ERP, warehouse, or tax platform.
- Producing GAAP net income, tax advice, legal advice, or investment advice.
- Real-time operational synchronization in the initial release.
- Supporting every commerce platform or arbitrary analytical schema in the MVP.
- Forecasting, causal attribution, or automated business actions in early phases.
- Using a language model to calculate, correct, or silently infer authoritative metrics.
- Claiming marketing incrementality from attributed spend and revenue alone.

## User stories

- As an owner, I want to see revenue and profit changes versus the prior period so I know whether the
  business improved.
- As an operator, I want to filter by channel and region so I can isolate where a change occurred.
- As an analyst, I want every KPI to have a formula and grain so I can verify it.
- As a manager, I want risky products called out with their supporting values so I can prioritize a
  review.
- As a first-time user, I want a sample dataset so I can understand the product before uploading data.
- As a data uploader, I want invalid rows and mapping problems explained without losing my original
  file.
- As a privacy-conscious user, I want to know what data is stored, sent to AI, and removable.
- As a keyboard user, I want filters and evidence views to be operable without a mouse.
- As a user of future AI features, I want answers to cite calculated evidence and acknowledge when
  the data cannot support a conclusion.

## Functional requirements

### Data ingestion and quality

- Accept CSV initially; spreadsheet support may follow based on need.
- Preserve the original upload separately from normalized data when persistence is introduced.
- Support explicit column mapping into the canonical schema.
- Validate types, required fields, ranges, identifiers, and date parsing before calculations.
- Report rejected rows and warnings with row-level context; never silently drop or coerce material
  errors.
- Track dataset version, import time, mapping, row counts, and validation summary.

### Analytics

- Implement every approved metric in `ANALYTICS_SPEC.md` as deterministic code.
- Apply one filter context consistently to KPI cards, charts, comparisons, findings, and evidence.
- Make time range, prior-period definition, currency, and metric assumptions visible.
- Return explicit null or not-applicable states for undefined metrics rather than misleading zeros.
- Attach source dimensions and calculation metadata to automated findings.

### Dashboard and interaction

- Provide KPI summaries, time trends, categorical breakdowns, and prioritized findings.
- Support date, product, category, region, and channel filters.
- Provide accessible chart alternatives, tooltips, loading states, empty states, and error recovery.
- Make active filters discoverable and easy to reset.
- Avoid decorative charts that do not answer a defined user question.

### Responsible AI (later phases)

- Give models only validated, calculated metric objects and bounded supporting context when possible.
- Require citations to evidence identifiers for factual claims.
- Label AI-generated explanation separately from calculated business facts.
- Decline or qualify conclusions when evidence is absent, stale, low-quality, or causally insufficient.
- Log model, prompt version, evidence references, and user feedback without storing unnecessary raw
  business data.

### Persistence and export (later phases)

- Authenticate users and isolate their data by account and project.
- Save datasets, mappings, filters, and generated artifacts with version history.
- Export an executive report that preserves metric definitions, reporting period, filters, and
  caveats.

## Nonfunctional requirements

- **Correctness:** formulas have unit tests, fixtures, documented rounding, and independently checked
  expected results.
- **Performance:** common filter interactions should feel immediate; initial targets are p75 under
  200 ms for in-memory recalculation and under 2.5 seconds for first meaningful dashboard content on
  a representative dataset and mid-tier laptop. Targets must be measured and revised.
- **Accessibility:** conform to WCAG 2.2 AA for the supported workflows, including keyboard access,
  visible focus, contrast, semantics, and reduced motion.
- **Security:** validate at trust boundaries, keep secrets server-only, minimize stored data, and
  enforce project-level authorization when persistence arrives.
- **Privacy:** use synthetic sample data and document retention, deletion, and AI data flow before
  accepting customer data.
- **Reliability:** one invalid segment must not silently corrupt all results; surface partial failure
  and data-quality state.
- **Maintainability:** strict TypeScript, small pure analytics functions, shared contracts, no metric
  formulas in presentation components, and minimal dependencies.
- **Observability:** future production flows should capture performance and error events without
  exposing row-level sensitive data.
- **Compatibility:** support current stable versions of major Chromium, Firefox, and Safari browsers
  and responsive layouts from 320 px upward.

## Success criteria

### Product success for MVP validation

- A representative user can upload or select sample data and reach a valid dashboard without
  developer assistance.
- Users can correctly explain at least three business changes using the dashboard and linked
  evidence during usability tests.
- Metric results match independently calculated fixture expectations for all supported formulas.
- Validation catches the documented critical data errors with no silent row loss.
- All primary workflows pass accessibility, responsive-layout, and browser checks.

### Engineering release gates

- Lint, strict type checking, unit tests, relevant integration tests, and production build pass in CI.
- Analytics functions reach agreed branch coverage for critical formula and edge-case paths; the
  initial target is 90% for `src/analytics`, reviewed for meaningfulness rather than gamed globally.
- No unresolved severity-1 calculation, privacy, authorization, or accessibility defects.
- Documentation and a reproducible demo dataset match the released behavior.

Business adoption targets will be set only after a usable MVP and baseline user testing; inventing
retention or conversion targets in Phase 0 would create false precision.

## Risks and assumptions

| Risk or assumption                                                              | Impact                                       | Planned response                                                                   |
| ------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Source exports use inconsistent column names and grains                         | Incorrect mapping or double counting         | Explicit grain detection, mapping preview, validation, and reconciliation totals   |
| `cost` or marketing spend definitions vary                                      | Profit and ROI can be misleading             | Require semantic confirmation and display assumptions with results                 |
| Small datasets create noisy trends                                              | Overstated findings                          | Minimum support thresholds and materiality rules                                   |
| Refunds, returns, tax, discounts, and currency are absent from the first schema | Results may not reconcile to finance reports | State MVP exclusions and evolve the canonical schema deliberately                  |
| One currency per dataset is assumed initially                                   | Cross-currency totals would be invalid       | Reject or partition mixed-currency data when currency support is added             |
| AI may sound more certain than the evidence                                     | Trust and decision risk                      | Evidence contract, constrained prompts, claim validation, and visible caveats      |
| Browser-side analytics may not scale to future file sizes                       | Performance ceiling                          | Benchmark representative data; introduce workers/server compute only when measured |
| Portfolio polish could drive premature feature breadth                          | Lower correctness and maintainability        | Enforce phase gates and document non-goals                                         |

## Future features

- Platform-specific import templates and scheduled ingestion.
- Returns, refunds, discounts, tax, shipping, inventory, and multi-currency modeling.
- Cohort retention, customer lifetime value, inventory efficiency, and funnel analysis.
- Scenario planning and forecasts with uncertainty ranges.
- Team workspaces, comments, metric annotations, and change history.
- Custom metric definitions with validation and governance.
- Evidence-grounded recommendations and conversational analysis.
- Branded executive reports and scheduled summaries.
- Data-warehouse connectors when demand and security maturity justify them.

## Open decisions

- Maximum supported row count and acceptable processing target for the upload MVP.
- Whether `marketing_spend` is available at order-line grain or needs a separate allocation table.
- Currency and timezone input requirements for the first external dataset.
- Initial deployment region, retention period, and privacy terms.
- Whether customer identifiers must be hashed before upload or only before persistence.
