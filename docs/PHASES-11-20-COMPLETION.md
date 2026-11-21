# ADVERSE Phases 11–20 — completion register

**Baseline:** main at e7f64cf541feb14ea9ba54dc248d5767577f0dbf (2026-11-21).
**Target:** continue the existing deployed beta without changing the required Render hosting target.
**Rule:** a phase is complete only when implementation, automated tests, and required production evidence exist. A workflow file or green CI alone is not proof of an operational control.

## Phase register

| Phase | Scope | Baseline evidence | Status | Closure evidence still required |
|---|---|---|---|---|
| 11 — Encrypted backup and recovery | Encrypted MongoDB backup, integrity verification, isolated restore | .github/workflows/database-backup.yml; apps/api/scripts/backup-crypto.mjs | Implemented in code; production-gated | Configure protected backup secrets and opt-in variable, run a production backup, complete an isolated restore, and establish a durable independent backup destination. |
| 12 — Authorization and security | Account/session lifecycle, resource ownership, safe URL handling, security regression tests | Auth middleware, owner-scoped investigation/workspace routes, URL validation, CI security workflow | Partial | Expand cross-account tests to every private resource and mutation; review session expiry/rotation, CSRF, abuse controls, SSRF/DNS rebinding, and obtain an independent security review. |
| 13 — Monitoring, alerts, and email | Scheduled monitoring, persisted alerts, bounded retries, email provider integration | Monitoring routes/services, scheduled GitHub workflows, Brevo integration | Partial / provider-dependent | Confirm scheduled workflows continue to run, exercise a real authorized alert, verify Brevo acceptance and recipient inbox delivery, and confirm retry/idempotency behavior. |
| 14 — Provider resilience and recovery | Timeouts, provider isolation, fallback behavior, database/provider recovery | Bounded provider calls, Promise.allSettled research flow, AI planner provider fallback, monitoring backoff | Partial | Run and record controlled provider timeout/rate-limit, database disconnect/reconnect, process restart, and recovery exercises. |
| 15 — Privacy, retention, and account lifecycle | Minimize telemetry, delete account-owned data, control retention | Account deletion controller; user-linked telemetry; private ExperienceWorkspace records | Implemented in code; database verification pending | Test database-backed deletion and confirm the configured retention policy in production. The scheduled monitoring cycle now prunes SearchMetric telemetry using the PlatformConfig retentionDays value (default 90; bounded 1–3650 days). Other data classes still need explicit retention schedules. Preserve non-user-specific security audit records where accountability requires it. |
| 16 — Collaboration | Share workspaces with existing accounts, role boundaries, revocation, audit trail | Workspace members, viewer role, owner-only share/revoke endpoints, shared-workspace read API, bounded sharing event history | Implemented (read-only collaboration) | Add email invitations for accounts that do not yet exist, richer role permissions, UI controls, and full member-aware access to all workspace resource routes before claiming full collaboration. |
| 17 — Document ingestion | User-provided documents, bounded extraction, provenance, safe storage | Owner-scoped text/plain upload/list/read/delete API; 50 KB per file, 10 per workspace, SHA-256 hash, duplicate detection, filename normalization, control-character rejection | Implemented (plain-text only) | Add UI upload flow, isolated PDF/Office parsers, malware scanning where supported, storage quotas, and document-specific retention behavior before accepting binary formats. |
| 18 — Advanced 3D, accessibility, and mobile | 3D research graph/globe with accessible alternatives and responsive behavior | Three.js/ForceGraph3D and Cesium surfaces, reduced-motion/low-memory handling, event-list fallback, new keyboard-operable graph text alternative listing entities, sources, and relationships | Partial — graph list alternative added | Complete keyboard-only and screen-reader workflows across the entire app, contrast/touch testing, no-WebGL fallback coverage, and large-graph performance checks. |
| 19 — Relevance, source comparison, and claim analysis | Source diversity, claim candidates, contradictions, evidence mapping, cautious AI assistance | Deterministic claim analysis, source-type heuristics, possible-conflict flags, cross-domain near-identical excerpt signals, Groq follow-up planner | Partial | Improve semantic/paraphrase comparison and passage-level source lineage, verify configured AI provider behavior in production, and retain human review as the authority. |
| 20 — Production-readiness and release | Full requirement audit, end-to-end checks, operational evidence, release decision | CI, CodeQL/dependency checks, Render deployment and health checks, release-readiness runbook | Deployed beta; not broad-launch ready | Close production gates above, stabilize flaky browser coverage, verify provider workflows, complete operational drills, and obtain independent security review. |

## Work completed in this continuation

### Phases 16–19 — bounded feature additions

- Phase 16 now supports owner-controlled sharing with an existing active ADVERSE account, read-only shared workspace views, revocation, and a bounded sharing audit history. It does not yet provide pending email invitations, editor roles, or member writes across all workspace endpoints.
- Phase 17 now accepts plain-text documents only, with per-file and per-workspace limits, SHA-256 provenance, duplicate detection, owner-scoped retrieval/deletion, and safe filename/text validation. Binary formats are deliberately rejected until isolated parsers and scanning exist.
- Phase 18 now has a keyboard-operable text alternative for the 3D evidence graph, exposing entities, sources, and relationships.
- Phase 19 now flags highly similar stored excerpts on different hostnames as a possible shared-origin/syndication lead. This is a warning for human review, not a copying or independence verdict.

## Work completed in this continuation

### Phase 15 — account deletion completeness

The account deletion path now also removes owner-scoped ExperienceWorkspace records and user-linked SearchMetric telemetry. The in-memory fallback performs the same cleanup. A regression test verifies that the deleted account records are removed while another account records and anonymous telemetry remain. The scheduled monitoring cycle also applies the configured retentionDays setting to SearchMetric records, defaulting to 90 days and clamping the configured value to 1–3650 days; cleanup failures are logged without stopping archive monitoring.

This is a code-level correction. Database-backed deletion still needs its integration test against the configured MongoDB test environment.

## Execution order

1. Close Phase 15 account lifecycle and privacy tests.
2. Close Phase 12 authorization/security regression coverage.
3. Close Phase 14 provider and database fault-injection tests.
4. Close Phase 11 backup/restore operational gates.
5. Close Phase 13 monitoring-to-inbox verification.
6. Implement Phase 17 controlled document ingestion.
7. Implement Phase 16 collaboration only after the role and revocation model is tested.
8. Complete Phase 18 accessibility/mobile work.
9. Improve Phase 19 evidence comparison and production AI verification.
10. Re-run the Phase 20 release audit and keep the product in controlled beta until all launch gates are evidenced.

## Deployment policy

- ADVERSE production frontend and API remain on Render.
- All changes must pass repository CI and security checks before merge.
- A successful merge is not the same as a successful Render deployment.
- A live Render deployment is not proof that every provider, backup, email, or collaboration workflow works.
- Never store credentials, backup URIs, private evidence, or encryption passphrases in source control or issue text.
