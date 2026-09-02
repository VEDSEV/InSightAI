# Founder experience

## Purpose

Phase 8 makes InsightAI useful before a business owner understands analytics terminology. Founder
Home is the default workspace. It answers three questions in order: how the business is doing, what
deserves attention, and where to look next. It is a presentation layer over the same approved
analytics and findings outputs used by Explore.

## Progressive disclosure

| Founder Home                           | Explore                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Four business-snapshot metrics         | Global date and dimensional filters                                    |
| Up to three prioritized Insights       | KPI comparisons, trends, charts, and detailed breakdowns               |
| Plain-language context and next checks | Product performance table and customer/marketing context               |
| Suggested guidance shortcuts           | Findings rule details, evidence, data-quality context, and methodology |
| Upload sales data entry point          | Full data workspace controls                                           |

The two views never calculate metrics separately. `DashboardViewModel`, the deterministic findings
engine, and the Phase 3 public analytics API remain the only sources for authoritative values.
Selecting **Explore details** can carry a finding's affected category, region, channel, or product
into the shared filter context. The `view=advanced` URL parameter selects Explore; the existing
filter query parameters remain intact when the view changes.

## Language policy

Founder Home uses **Insights**, **Data check**, **How we know**, and **Analyzed sales rows**. These
labels describe the user outcome rather than the engineering mechanism. Terms such as canonical
order lines, reconciliation, evidence references, engine version, and rule version remain available
inside advanced details where they support review and auditability.

## Grounded AI entry points

The founder shortcuts are not chat. They take a user to an existing, filtered deterministic Insight
and its detail. The optional **Explain with AI** control retains the Phase 7 evidence packet,
privacy review, consent, grounding, provider, and cache-isolation behavior. It remains clearly
labeled as AI-generated and never owns authoritative calculations.

## Accessibility and motion

Founder Home uses semantic headings, buttons with explicit labels, status-safe empty states, and
the existing evidence drawers/dialogs. The design system honors `prefers-reduced-motion`; the
founder shortcut scroll does not force smooth motion. The view is built as a one-column mobile
experience that expands into snapshot and insight grids only at available widths.

## Current limitations

- Founder Home intentionally does not add conversational AI, saved preferences, onboarding
  persistence, or export.
- Suggested questions are safe routes to deterministic insights, not free-form answers.
- The dashboard begins with the current demo or session upload; persistent projects require a later
  authorized storage phase.

## Usability-test guide

Use synthetic data only. Give a participant a synthetic sales CSV and this neutral prompt: “Upload
this file and tell me how the business is doing and what you would investigate first.” Do not teach
the interface first. Observe, without fabricating outcomes:

- where the participant hesitates or abandons a step;
- whether they find upload and understand the Data check;
- whether they can name an Insight and a plausible next investigation;
- whether they notice the grounded AI entry point and understand that it is optional;
- whether they can reach Explore when they want more detail;
- whether privacy wording is understood as raw data staying local while a reviewed, minimized
  summary may be sent only after explicit consent.

Record task completion, observed terminology confusion, navigation path, and direct quotes only
with appropriate participant consent. Treat this guide as a method for future research, not evidence
of completed user research.
