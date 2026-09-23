# Guided AI Analyst

Phase 9 adds a founder-facing question experience without moving any authoritative calculation into
an AI model.

```text
question -> closed intent classifier -> typed analysis plan -> deterministic dashboard results
         -> grounded answer -> How we know / Explore
```

## Supported questions

The local classifier supports business overview, priorities, positive signals, sales change,
most/least money, best/worst product, channel and region performance, recent changes, unusual
activity, and improvement opportunities. Founders can use ordinary phrases such as “How is my
business doing?”, “What should I look at first?”, “Where am I losing money?”, and “Which way of
selling is working best?”

Ambiguous questions receive a short clarification. Requests for unsupported forecasting, ad budgets,
or high-stakes decisions receive a clear boundary plus supported suggestions.

## Deterministic plan boundary

`src/features/ai-analyst/intent-classifier.ts` emits only known typed intent identifiers.
`analysis-plans.ts` selects existing dashboard metrics, findings, comparisons, and breakdown entries;
it contains no financial formulas and cannot execute user-provided expressions, SQL, or code.

The response begins with a direct answer, then shows a supporting fact, a plain-language meaning,
and a cautious next investigation. Change questions identify measurable contributors, never proven
causes.

## Result states and suggestion safety

The response contract distinguishes a verified answer, a verified **no matches** result,
insufficient data, clarification, unsupported questions, a grounding rejection, and an internal
analysis failure. A valid result such as “no product is losing money in this selection” is never
presented as an error. The safety fallback (“I couldn't verify a safe answer”) is reserved for an
actual grounding rejection.

Suggested questions are preflighted against the active dashboard view before display. A suggestion
is shown only when its closed intent can produce a grounded deterministic response in the current
dataset and filter context. For the loss question, the plan checks negative gross profit first; if
none exists, it returns the verified no-match result and may point to the weakest gross-margin
product as a separate, clearly labeled next investigation.

## Follow-up and isolation

Only the most recent bounded answer is retained in browser session state. “Why?”, “Is that bad?”,
“What about Retail?”, and related supported follow-ups reference that answer. Dataset fingerprint and
normalized filter state reset the conversation immediately, preventing cross-filter or cross-dataset
reuse. A standalone question starts a new conversational analysis from the active dashboard filters;
it does not inherit an entity from the previous answer. An explicit product filter on the dashboard
still applies to every question until the user clears it. Referential follow-ups resolve their entity
and evidence against the current verified view, so channel advice cannot inherit product-loss copy.
The question field clears after submission; its neutral placeholder is not a submitted value. There
is no saved history or persistence.

## Grounding, privacy, and model use

Phase 9 classification and answer assembly are deterministic and local: the founder question, raw
CSV, rows, order IDs, and customer IDs are not sent to a provider for this flow. The response guard
accepts only active evidence IDs, active entity labels, and displayed deterministic value tokens; it
rejects unsupported causal or guaranteed-outcome language.

Phase 7’s optional per-finding explanation remains separate. If a user invokes that provider-backed
feature for an uploaded dataset, its existing privacy review, session consent, minimized evidence
packet, server-only provider boundary, and `store: false` configuration still apply.

## Known limits

The classifier is deliberately closed and English-language only. It does not forecast, recommend a
budget, calculate custom metrics, browse, run SQL, or retain conversations. A future optional model
paraphrase must preserve this plan/result packet and pass the same grounding validation.
