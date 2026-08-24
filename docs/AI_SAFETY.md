# InsightAI Responsible AI and Evidence Policy

**Status:** binding design policy; Phase 7 implementation is in progress and remains advisory-only

## Purpose

InsightAI will eventually use generative AI to explain verified analytical outputs and help users ask
follow-up questions. The model is an interpretation layer, not a calculator, database, accountant, or
autonomous decision-maker. This policy defines the boundary before AI code exists.

## Non-negotiable authority boundary

```text
Validated canonical data
  -> deterministic, tested analytics code
  -> versioned evidence objects
  -> optional AI explanation
```

- All numbers presented as business facts come from deterministic analytics code.
- The model may not calculate an authoritative KPI from raw rows, repair a failed calculation, invent
  missing values, or choose a different formula.
- If an evidence object is unavailable or non-computable, the model must state the limitation; it may
  not fill the gap from general knowledge.
- UI must visually distinguish calculated facts, deterministic findings, AI interpretation, and
  user-entered assumptions.

## Approved future AI capabilities

After Phase 6 quality gates pass, AI may:

- summarize a bounded set of calculated changes and findings;
- explain a documented metric in plain language;
- propose hypotheses explicitly labeled for investigation;
- suggest reversible next analyses or business actions, with evidence and caveats;
- answer questions by retrieving approved metric/evidence objects under the active project and filter
  context;
- help translate validation errors or analytical terminology.

AI must not be required to view core metrics or use the deterministic dashboard.

## Prohibited or restricted behavior

The product must not:

- present model-generated numbers as calculated results;
- claim causal impact from observational trends or marketing attribution fields alone;
- produce tax, legal, accounting, credit, employment, or investment decisions as professional advice;
- execute pricing, advertising, inventory, refund, or personnel actions without a separate reviewed
  product scope and explicit user confirmation;
- expose one user's data, prompts, evidence, or filenames to another user;
- send raw customer identifiers or full datasets to a model when aggregated evidence is sufficient;
- conceal uncertainty, rejected rows, incomplete comparison periods, or metric limitations;
- allow instructions embedded in uploaded data to change system policy or tool behavior.

## Evidence packet

The preferred model input is a minimal, typed packet containing:

- request/question and user-visible filter context;
- approved metric IDs, raw values, units, statuses, and formatted values;
- current and comparison periods, timezone, and currency;
- dataset/analysis/specification versions and quality warnings;
- deterministic finding IDs, rule versions, thresholds, support counts, and affected dimensions;
- safe glossary/formula text needed to explain the result;
- allowed evidence identifiers that the answer may cite.

Raw rows are excluded by default. When a row-level question genuinely requires examples, retrieve the
minimum authorized fields, exclude direct identifiers, cap the sample, and tell the user that the
answer is based on examples rather than the entire dataset.

## Claim and citation contract

Every factual model claim about the user's business must cite one or more evidence IDs. Before
display, a validator should verify that:

1. cited IDs exist in the supplied packet;
2. cited values, units, direction, period, filters, and dimension match the generated claim;
3. the answer does not introduce uncited business numbers;
4. the wording respects result status and data-quality warnings;
5. recommendations are separated from observations and do not claim unsupported causality.

If validation fails, the system should retry with bounded correction once or show a safe structured
fallback assembled from deterministic templates. It must not display the unvalidated answer as fact.

## Prompt-injection and untrusted content

Uploaded cells, column headers, product names, filenames, and user chat are untrusted data, not system
instructions. The model boundary must:

- delimit untrusted content and identify its role;
- avoid inserting raw files directly into privileged prompts;
- use allow-listed tools and schemas with server-side authorization;
- reject requests to reveal system prompts, secrets, other projects, or hidden chain-of-thought;
- validate tool parameters and evidence access independently of model intent;
- prevent retrieved text from changing the evidence/citation policy.

## Privacy and data governance

Before enabling AI with user data, document and surface:

- which provider/model receives which fields;
- processing region, retention period, deletion behavior, and training/data-use settings;
- lawful/contractual basis and user consent where applicable;
- redaction or pseudonymization of customer identifiers;
- encryption in transit/at rest and access controls;
- application retention for prompts, responses, evidence packets, and feedback;
- a deletion path covering provider and application data where supported.

Collect the minimum data needed. Logs should prefer evidence IDs, timings, token counts, model/prompt
versions, and validation outcomes over raw content.

## Transparency and user control

- Mark AI-generated sections in plain language.
- Keep the underlying calculated values and evidence available without opening AI content.
- Show the active period, filters, and key caveats near the answer.
- Let users provide feedback and report an unsupported claim.
- Provide a way to regenerate or dismiss an explanation without changing the underlying facts.
- Do not anthropomorphize confidence; use evidence status and concrete limitations.

## Recommendations policy

Recommendations must include:

- the observed evidence;
- why the action might help, framed as a hypothesis when causality is not established;
- key assumption or missing information;
- a low-risk validation step or measurement plan;
- potential tradeoff or guardrail when material.

Example structure: “Product A has high revenue and a lower gross margin than the configured threshold
in the selected period [evidence]. Review price, discount, and cost inputs; those drivers are not
available in this dataset. If you test a pricing change, monitor unit volume and gross profit.”

The system should prioritize reversible investigations over confident prescriptions.

## Failure behavior

- **No evidence:** decline the business-specific answer and suggest the exact dataset/filter needed.
- **Non-computable metric:** explain the denominator or data issue using deterministic status text.
- **Conflicting signals:** present both and avoid collapsing them into one confident narrative.
- **Stale analysis:** require recalculation or label the answer with the stale version.
- **Model/provider failure:** preserve the dashboard and provide deterministic findings; AI is an
  optional enhancement.
- **Citation validator failure:** show a safe structured fallback, not the invalid response.
- **Unsafe/high-stakes request:** state the product boundary and direct the user to appropriate expert
  review where warranted.

## Evaluation plan before release

Create a versioned evaluation set covering:

- exact numerical fidelity, units, signs, percentages, and percentage points;
- correct period/filter/dimension references;
- citation validity and completeness;
- refusal when evidence is missing or not applicable;
- separation of observation, hypothesis, and recommendation;
- robustness to prompt injection in chat, headers, and product/category text;
- privacy leakage and cross-project authorization attempts;
- conflicting evidence, noisy small samples, and incomplete periods;
- high-stakes or causally framed requests;
- clarity and usefulness assessed by representative users.

Release thresholds must be set before testing, include zero tolerance for cross-user leakage and
uncited business numbers, and be checked again after model, prompt, analytics-spec, or retrieval
changes.

## Human oversight and incident response

AI output is advisory. Users retain decision responsibility, but the product must not shift the burden
of detecting fabricated facts entirely to them.

Future production operations need:

- versioned prompts, models, evidence schemas, and validators;
- sampled quality monitoring that respects privacy;
- a fast feature flag/kill switch for explanations and chat;
- an incident path for data exposure, harmful advice, or systematic unsupported claims;
- audit records sufficient to reconstruct the evidence/model configuration without logging secrets;
- rollback to the last evaluated version.

## Phase gates for AI

AI work may begin only when:

1. the canonical schema and analytics engine are implemented and independently reconciled;
2. rule-based findings produce stable, inspectable evidence objects;
3. access control and data-flow design for the intended environment are reviewed;
4. an evaluation set and release thresholds exist;
5. the UI can display sources, caveats, and failures clearly;
6. provider retention/privacy terms for the chosen configuration are documented.

Phase 7 uses a server-only OpenAI Responses API adapter only when `OPENAI_API_KEY` is configured.
It sends a minimized evidence packet under strict structured output with `store: false`; this does
not replace the provider organization’s broader retention or data-use controls. Without a key, only
the clearly labeled deterministic mock is available. The browser never receives credentials, raw
provider exceptions, or full provider request/response payloads.
