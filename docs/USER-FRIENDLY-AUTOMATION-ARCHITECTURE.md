# ADVERSE user-friendly automation architecture

**Status:** implementation blueprint; not a claim that every automation described below is already live.  
**Deployment target:** Render only.  
**Primary experience:** one natural-language request, one understandable investigation, one reusable evidence trail.

## Product structure

ADVERSE should expose five primary areas, not a catalogue of internal tools:

1. **Home / Ask ADVERSE** — one request field, a few examples, recent investigations, and clear account status.
2. **Investigation** — the request interpreted in plain language, a short editable plan, progress, sources, and the recommended next action.
3. **Evidence** — saved sources, original URLs, excerpts, retrieval times, provider provenance, link checks, review state, claims and conflicts.
4. **Brief / Export** — a report assembled from reviewed evidence, with citations, gaps, conflicts, dates and limitations.
5. **Monitor** — optional recurring checks on a saved public-source question or page, with user-defined frequency, pause/resume and alert preferences.

Advanced tools (graph, geospatial views, archive comparison, specialist lookups) should live under an **Explore tools** area or be offered contextually. They should not compete with the main investigation path.

## Default user journey

`Describe → Understand → Confirm scope when ambiguous → Research → Review → Brief → Optional monitor`

- Accept natural language, including goals such as applying to a named institution, finding an official process, comparing alternatives or understanding a topic.
- Preserve the complete original request throughout planning and search. Never reduce a request to a single extracted keyword.
- Show the interpreted action, target, constraints and expected outcome in normal language. Let the user correct a mistaken interpretation before broad or expensive work begins.
- Run read-only public research automatically within a bounded budget.
- Save useful source records and progress as the work happens.
- Mark AI-extracted claims and relationships as **suggested / unreviewed** until a person reviews them.
- Prepare a draft brief from evidence records, not from unsupported model recollection.
- Offer monitoring only after the user chooses a schedule and scope.

## Automation engine — required target architecture

### Durable job lifecycle

Use a persisted MongoDB research-job record and worker lease, rather than relying on a browser request or process memory.

States: `queued → planning → searching → inspecting → extracting → synthesizing → completed`; terminal/exception states: `needs_input`, `paused`, `failed`, `cancelled`, `interrupted`.

Each job should contain:
- owner and workspace IDs;
- idempotency key and normalized request hash;
- original request, resolved intent and versioned plan;
- current stage, progress counters and append-only event history;
- provider/model attempts, latency, quota and sanitized error codes;
- bounded search rounds, source cap, time budget and retry count;
- worker lease owner, lease expiry and heartbeat;
- cancellation/pause flags and resumable checkpoints;
- output references (source IDs, claim IDs, report ID) rather than duplicated large payloads.

### Worker behavior

1. Validate ownership, request size, policy and budget.
2. Resolve intent with Groq and Gemini where configured; compare provider interpretations and arbitrate disagreements. Use a deterministic fallback and disclose it when AI providers fail.
3. Expand the request into a small, ranked set of targeted searches. Include named entities and the user's requested outcome in every relevant query.
4. Search configured public providers in parallel with per-provider timeouts and bounded concurrency.
5. Normalize, deduplicate and rank candidates against the full task; retain provider provenance and explain relevance.
6. Inspect selected public pages, preserve source metadata and check destination availability separately from factual support.
7. Extract candidate claims, entities, dates and conflicts only with source references. Never auto-promote suggestions to verified facts.
8. Draft a report only from persisted evidence, including unsupported questions and coverage gaps.
9. Persist a checkpoint after each stage. On worker restart, resume from the last safe checkpoint; do not restart successful provider calls unnecessarily.
10. Emit a final event and a concise user-facing completion summary.

### Reliability and automatic recovery

- At-least-once queue delivery with idempotent stage writes.
- Atomic lease acquisition and heartbeat renewal.
- Exponential backoff with jitter for transient provider/database errors; no retry for invalid requests or policy denials.
- Dead-letter state after bounded attempts, with a readable reason and manual retry.
- Cooperative cancellation; already saved evidence remains intact.
- Startup recovery for expired leases and interrupted jobs.
- Duplicate-run suppression per owner/workspace/request.
- Per-user and global concurrency, token, request and time budgets.

### Monitoring automation

Monitoring is opt-in and separate from a one-off investigation. Users choose the target, cadence, change types, quiet hours and notification channel. The worker compares a new observation with the last successful snapshot, deduplicates alerts, includes the changed evidence and offers pause/delete controls. A failed check must not be reported as a confirmed change or a dead website.

## Human-control and safety boundaries

Automate public-source discovery, metadata normalization, deduplication, link checks, evidence organization, draft synthesis, scheduled rechecks and operational recovery.

Require fresh user approval before any external side effect such as submitting an application, creating an account, sending a message, making a payment, publishing, deleting, changing access or deploying. Approval must show the exact action, target, data, consequences and whether it can be undone. A changed target or payload invalidates the old approval.

Retrieved webpages and documents are untrusted data, never instructions to the agent. Do not bypass access controls or login walls. Keep private-person data out of broad identity inference. Keep secrets out of browser storage, logs and model prompts.

## User-facing progress and recovery

Show only the current stage, a short explanation, source count, provider coverage and the next recommended step by default. Put detailed traces, model names, query expansions and technical errors behind an expandable diagnostics view.

Every failure state should answer:
- What failed?
- What was saved successfully?
- What will be retried automatically?
- What requires the user's input?
- Can the user safely resume or cancel?

Never show a permanent spinner. Never say “complete” when the job only queued or a provider returned partial results.

## Delivery sequence

- **A — Experience clarity:** simplify navigation and labels; add a visible progress journey, meaningful empty/error states and contextual next actions. (A first progress-journey UI slice is included with this document.)
- **B — Durable orchestration:** implement the research-job model, queue, worker, leases, checkpoints, cancellation and recovery.
- **C — End-to-end research:** connect multi-round discovery, page inspection, source persistence, candidate extraction and evidence-grounded report drafting.
- **D — Monitoring:** opt-in schedules, snapshot comparison, deduplicated alerts and pause/resume.
- **E — Production hardening:** authorization tests, load/rate-limit tests, provider outage tests, worker crash/restart tests, restore drills, mobile accessibility and production smoke tests.

## Release acceptance gates

A feature is not complete because it compiles. Verify:
- the exact user request and target survive every stage;
- named entities are present in search queries and relevant results;
- a provider outage degrades gracefully and is visible;
- a worker crash resumes without duplicate records or lost evidence;
- cancel, pause and retry are idempotent;
- all workspace/job/source/claim/report reads and writes enforce owner scope;
- report statements cite saved evidence IDs;
- conflicting or missing evidence remains visible;
- mobile layouts remain usable at narrow widths;
- Render production health and authenticated end-to-end behavior pass for the deployed commit.

## Implemented in this delivery

The Experience flow now has a MongoDB-backed research-job collection, authenticated create/status/list/pause/resume/cancel endpoints, an API-started background worker, atomic job claiming, worker leases and heartbeats, bounded automatic retries, and persisted discovery/checking checkpoints. The worker reuses ADVERSE's existing public search providers and the user's encrypted provider credentials, checks a bounded set of public destinations, and saves sources plus a deduplicated research-run record into the owner-scoped workspace. The UI queues signed-in investigations, polls progress, and exposes pause/resume/cancel controls. Guests or environments without persistent database storage retain the existing direct-search fallback.

A worker restart can reclaim an expired lease and continue from saved candidate/checking checkpoints. A failure before a checkpoint may repeat the current stage; source writes and research-run IDs are idempotent. This is not a distributed workflow engine with provider-level cursor continuation, and the worker is hosted in the existing Render API service rather than a separately scaled worker service. Search coverage remains bounded by configured providers. AI-extracted claims and reports still require their own evidence-grounding and review workflow; this worker does not automatically certify facts or perform external account actions.
