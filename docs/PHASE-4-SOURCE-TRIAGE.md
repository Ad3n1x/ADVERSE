# Phase 4 — evidence triage

**Status:** Implemented and deployed to the ADVERSE Render frontend and API.

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

## Verification evidence

- Source review fields are saved on the workspace source records; the API preserves existing analyst decisions when provider search refreshes the same source.
- Frontend and API deployments were confirmed live on Render for the Phase 4 source-triage release.
- API regression tests verify persistence across refresh, invalid state rejection, note length limits, and account isolation.
- Dedicated browser E2E coverage exercises source triage, note persistence, filtering, responsive layout, and export workflows in CI.

## Remaining release gates

Passing the feature tests does not close broader release-readiness items such as isolated backup restoration, complete authorization coverage for legacy resource families, operational recovery drills, or independent security review. ADVERSE remains a deployed beta pending those separate gates.
