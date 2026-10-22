# ADVERSE Operations Center — redesign and delivery plan

## Product target

Keep the ADVERSE identity and turn the product into a public-source intelligence operations desk inspired by fictional investigative command centers: mission-oriented workspaces, a visible research trail, linked source-backed entities, timelines, and monitoring. The system must never imply access to private systems, communications, or restricted databases it does not actually have.

## Operating model

1. **Mission intake** — capture the question, scope, desired outcome, and boundaries in an investigation.
2. **Plan and search** — search configured public providers, deduplicate results, and derive a small bounded set of follow-up leads.
3. **Inspect and triage** — retrieve selected public pages, preserve source provenance, and label records unverified by default.
4. **Connect and reconstruct** — let researchers connect evidence-backed entities and events; relationships remain explicitly qualified and source-linked.
5. **Report and monitor** — preserve reports, timelines, and watchlists so investigations can be resumed and reviewed.
6. **Recover safely** — persist run state, prevent duplicate active runs, and surface interrupted work rather than leaving a false permanent “running” state.

## Delivery status

### Implemented in the current release
- Existing responsive ADVERSE frontend redesigned toward a mission-first operations desk.
- Search and investigation launch entry points preserved.
- Existing public-source provider federation, source records, entity/relationship graph, archive lookup, monitoring, and reports retained.
- Atomic MongoDB claim for a fresh agent run to reduce duplicate concurrent runs.
- Bounded agent trace retention increased to 60 entries.
- API startup marks orphaned running investigations as interrupted, preserving the run ID and trace so the user can restart without being told the old process is still active.
- Regression tests cover run lease freshness and interrupted-run recovery.

### Next engineering gates
- Move background investigation execution into a durable queue with worker leases, retries, and safe resumption. Current recovery marks work interrupted; it does not resume an in-flight provider request automatically.
- Add explicit pause/cancel controls backed by cooperative cancellation.
- Normalize event records into an append-only operation timeline instead of storing only the latest run trace in the investigation document.
- Improve entity/event extraction with provenance constraints and reviewable candidate links.
- Add multi-stage mission planning, configurable budgets, and a visible task board.
- Add integration tests for simultaneous start requests, API restart recovery, and real provider-backed runs.
- Run the complete CI and production smoke-test suite after each release.

## Verification boundaries

A reachable URL is not proof that a claim is true. Search ranking is not proof. The platform's coverage depends on public indexes, configured providers, their credentials, and rate limits. A deployment is not considered fully verified until build/tests and live checks pass for the exact deployed commit.
