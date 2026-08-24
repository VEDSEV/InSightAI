# Grounded AI explanation engine

Phase 7 treats AI as an optional, server-only communication layer. Deterministic analytics and
findings remain authoritative. The browser sends a minimized evidence packet: finding metadata,
period/filter context, aggregate support counts, and evidence IDs only. Raw CSV, source order IDs,
order-line IDs, customer IDs, and unrelated uploaded fields are excluded. Packets have a machine-
checked 18 KB maximum and are never logged as request bodies.

`POST /api/ai/explain` validates the packet, invokes the bounded explanation service, then runs an
independent output-shape, grounding, citation, causality, and recommendation-policy check. Generated
interpretation/action text cannot introduce unsupported numbers, causal certainty, unsupported action
patterns, or evidence IDs not present in the packet. The default provider is a visibly labelled
deterministic development mock; it is safe for offline tests and never represents a production model
call.

When `OPENAI_API_KEY` is configured, the server-only OpenAI provider calls the Responses API using
the official `openai` SDK. `OPENAI_MODEL` selects the model (the centralized fallback is
`gpt-5-mini`) and `AI_REQUEST_TIMEOUT_MS` bounds a request from 1–60 seconds. It sends versioned
application instructions separately from a clearly delimited untrusted evidence-data message, uses
strict JSON Schema structured output, disables response storage with `store: false`, and never uses
background mode. `store: false` is an application request setting, not a replacement for reviewing
the provider organization’s retention, regional-processing, or account settings.

For an uploaded dataset, the UI shows “View what will be sent” before an explanation. The user sees
the finding, period, deterministic summary, evidence strength, and bounded aggregate evidence; raw
CSV is explicitly excluded. Consent is scoped to the current browser session and component/dataset
context. Declining consent leaves deterministic analytics fully usable; switching or clearing the
dataset removes the related AI state.

The service keeps at most twelve in-memory entries keyed by dataset fingerprint, finding/evidence
packet, normalized filters, prompt/schema versions, provider, and model. The cache is not persisted,
uses oldest-entry eviction, and cannot cross a changed dataset/evidence packet. It retries only one
clearly transient provider failure; authentication, malformed output, refusal, and grounding failures
are never retried. Any unavailable or invalid AI result leaves deterministic findings usable.

The dashboard separately derives a complete immutable explanation-context identity from the minimized
packet and prompt/schema versions. When any packet input changes, including filters, deterministic
values, affected segments, evidence references, or the dataset fingerprint, the explanation state is
remounted immediately. This clears its result, error, and loading state. Any active request is aborted;
its response is also guarded by a request token, so it cannot render after its context is no longer
current. A fresh user action is required for the new context; valid cache reuse remains limited to an
exact service cache-key match.

The synthetic dataset uses its approved version as a stable source identity. An uploaded dataset gets
a browser-local FNV-1a identity derived from its validated metadata and canonical rows before the
packet is created, plus a new upload-session generation; the raw rows used to make that identity
never leave the browser. Replacing or clearing an upload remounts the explanation state and creates
a different context.

## Browser QA fixture for uploaded-data consent

`tests/fixtures/ingestion/phase7-ai-consent-qa.csv` is a 14-row synthetic-only CSV for manual
browser validation. It covers 15 January 2024 through 10 December 2025, maps directly through the
standard ingestion suggestions, and has no rejected rows. Twelve of its fourteen distinct orders
use the `Web` channel, so the normal findings engine produces the supported channel finding:
`Web accounts for 85.7% of revenue in the active selection.` The concentration threshold is 30.0%
and the finding has twelve supporting orders, exceeding the five-order minimum.

Use this fixture to complete the upload, confirm the ready state, open the dashboard, and select
**Explain with AI** on the Web concentration finding. Before consent, verify that the privacy review
states that raw CSV and rows are excluded and that only a minimized evidence summary may be sent.
Choose **Keep analytics local** once to confirm findings remain usable, then reopen the review,
provide session consent, and generate the visibly labelled development-mock explanation when no
`OPENAI_API_KEY` is configured. Finally, change a filter and replace or clear the upload to confirm
the explanation is removed; return to demo data to confirm no uploaded context remains.

## Manual browser QA completion

Manual browser QA completed on 2026-08-23 using the fixture above and the development-mock provider.
It passed the upload-readiness/dashboard handoff, uploaded-data privacy review, consent decline and
reopen flow, grounded finding/evidence/explanation consistency, stale-explanation invalidation after
filter changes, and uploaded-data-to-demo dataset isolation. This record covers the offline mock
flow only; no live-provider smoke test is implied.
