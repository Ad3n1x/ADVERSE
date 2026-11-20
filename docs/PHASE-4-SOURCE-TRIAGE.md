# Phase 4 — evidence triage

**Status:** Implemented in source; production deployment and CI verification are tracked separately.

Phase 4 adds a review layer to the intent-first `/experience` public-source discovery workflow.

## Source review

Each discovered source can be marked as:

- `unreviewed` — no analyst triage has been recorded.
- `useful` — the analyst considers the source relevant to the current research task.
- `not_relevant` — the analyst considers the source out of scope for the current task.

A workspace owner can also save an analyst note of up to 1,000 characters. Notes are intended for context, follow-up questions, and review rationale; they are not a substitute for source verification.

## Review controls

The source list can be filtered by all, unreviewed, useful, and not relevant. Counts reflect only the sources in the current workspace. A source can be reset to unreviewed or moved between review states.

## Persistence and ownership

Review state and notes are stored inside the existing owner-scoped experience workspace source records. Updates use the existing authenticated workspace endpoint and retain prior review information when a fresh provider search refreshes the same URL. URL normalization and the 12-source workspace limit remain in force.

## Trust boundary

A review label is an analyst triage decision, not a fact-check, trust score, safety verdict, or proof that a source supports a claim. Search results remain leads until an analyst opens and evaluates the original source. Workspace records remain private to the authenticated account under the existing owner-scoped routes.

## Verification required

- API tests cover review-state persistence across refresh, note persistence, invalid states, note length limits, and owner isolation.
- The release must pass API tests, frontend type-check/build, browser smoke tests, and the production Render deployment check before Phase 4 is called live.
- This phase does not close the broader release gates in `docs/RELEASE-READINESS.md`, including backup restoration, resilience testing, broader authorization review, and independent security review.
