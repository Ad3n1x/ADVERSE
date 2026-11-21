# ADVERSE release readiness record

**Release posture:** Deployed beta / controlled testing. Phases 4–10 are implemented and deployed; the latest automated release checks are green. A broad public launch is **not** cleared because the production backup/restore drill, live alert-email delivery, full resilience exercise, Atlas network restriction, and independent security review still require owner-controlled configuration or external verification.

**Record updated:** 2026-11-21  
**Repository:** https://github.com/Ad3n1x/ADVERSE  
**Production web:** https://adverse-web.onrender.com/  
**Production API:** https://adverse-api-7yim.onrender.com/  
**Latest source commit:** `3c831c1b395828463996ee8452559a1870c99816` — Complete ADVERSE research and production hardening

**Render frontend deployment:** `dep-dc0keed9el5s73edm3c0` — confirmed `live` on commit `3c831c1b395828463996ee8452559a1870c99816`.  
**Render API deployment:** `dep-dc0kecrrjlhs73a1rsc0` — confirmed `live` on commit `3c831c1b395828463996ee8452559a1870c99816`.  
**CI:** [Run 44879870566 — successful, including post-deploy API check](https://github.com/Ad3n1x/ADVERSE/actions/runs/44879870566)  
**Quality gates:** [Run 44879870551 — successful](https://github.com/Ad3n1x/ADVERSE/actions/runs/44879870551)  
**Security:** [Run 44879870573 — successful](https://github.com/Ad3n1x/ADVERSE/actions/runs/44879870573), including CodeQL and the production dependency audit.

## What this record means

This record summarizes repository changes and observed deployment/test evidence. It is not an OpenAI-issued certificate, endorsement, security audit, or guarantee of correctness. OpenAI has not independently reviewed or certified ADVERSE through this document.

## Latest product milestone — deployed on Render

The primary `/experience` workspace now includes the public-event 3D globe, the evidence/claim constellation, on-demand public destination checks with redirect history, and cross-domain alternative-source candidates. Saved evidence capacity is 24 sources per workspace, with existing review state preserved on refresh. The globe uses attributed USGS earthquake and NASA EONET natural-event feeds plus public STAC metadata; it has a usable event-list fallback when WebGL is unavailable. These additions are bounded public-source research tools, not truth verification or personal tracking.

The backup workflow now uses streaming authenticated AES-256-GCM encryption and an isolated restore job. Brevo alert state distinguishes API acceptance from inbox delivery. These code-level changes do not mean a production backup/restore drill or real inbox delivery has been verified.

## Phases 4–10 — implemented and deployed

| Phase | Capability | Current state |
|---|---|---|
| 4 — Source triage | Owner-scoped review status, analyst notes, filters and counts for saved sources | Implemented; API tests pass |
| 5 — Claim ledger | Claims linked to sources in the same workspace as supporting, challenging or contextual evidence; human assessment and rationale | Implemented; owner/source validation tests pass |
| 6 — Research dossier | JSON and Markdown export with source metadata, notes, claims, limitations and a SHA-256 digest for the JSON payload | Implemented; browser export test passes. The digest is not a digital signature or trusted timestamp |
| 7 — Coverage and gaps | Counts, distinct hostnames, providers, provider spread and missing metadata indicators | Implemented; browser test passes; no automated credibility score |
| 8 — Source chronology | Separate publication, retrieval, workspace-save and recorded link-check times | Implemented; browser test passes |
| 9 — Run history | Owner-scoped recent run records, deduplication and a bounded history | Implemented; API and browser checks pass |
| 10 — Verification and usability | Browser coverage for the experience, triage, claims, export, coverage, chronology, run history, geospatial workflows and responsive layout | Implemented; 13 Playwright tests completed, with 12 passing on the first attempt and the geospatial test passing on its automatic retry; investigate the remaining timing flake |

The 3D relationship graph runtime was also stabilized by pinning Three.js to `0.187.0`, forcing one dependency version through npm overrides, and enabling Vite module deduplication. The geospatial browser test now explicitly fails if the previously observed `intersectsFrustum` renderer exception returns.

## Verified on the latest commit

- Render frontend deployment `dep-dc0keed9el5s73edm3c0` and API deployment `dep-dc0kecrrjlhs73a1rsc0` are both marked `live` on commit `3c831c1b395828463996ee8452559a1870c99816`.
- The API liveness/readiness, public-search contract, deployed fallback frontend and CORS checks passed after the new Render deployment.
- API syntax and regression tests passed, including the additional cross-account test for private evidence, alert actions and domain-monitoring assets.
- Frontend TypeScript type-check and production build passed.
- Playwright: 12 tests passed on the first attempt; the geospatial integration test exceeded its 30-second limit once, then passed on retry. The overall CI workflow passed, but the test remains a timing-flake follow-up.
- Quality-gate workflow passed.
- CodeQL and the production dependency audit passed.

These automated checks provide evidence for the tested code paths. They are not a complete production certification, a live provider-availability guarantee, or an independent penetration test.

## Release gates still open

| Gate | Status | What is needed to close it |
|---|---|---|
| Deployment and health | **Passed** | Continue reviewing Render events/logs and readiness after changes |
| Phase 4–10 functionality | **Implemented; latest checks passed** | Keep the same tests green on future commits and test with representative real research workspaces |
| Authorization coverage | **Expanded; automated tests passed** | Independent review of every private resource family, tenant boundary, admin path and direct-object reference |
| MongoDB backup | **Authenticated-encryption workflow and local tests added; production run still unverified** | Workflow now uses streaming AES-256-GCM with authenticated metadata and a separate isolated restore job. Repository owner must add the protected secrets `MONGODB_BACKUP_URI` and `BACKUP_ENCRYPTION_PASSPHRASE`, set Actions variable `ADVERSE_BACKUP_ENABLED=true`, confirm the target cluster, and run the workflow |
| Restore and off-site recovery | **Not verified** | Complete an isolated restore drill, verify representative collections/records, and establish an independent protected backup destination. A temporary GitHub Actions artifact (up to 90 days) is not a durable off-site backup |
| Brevo alert email | **Provider-acceptance tracking added; live inbox delivery not verified** | The UI now distinguishes Brevo API acceptance from recipient delivery and stores the provider message ID. Configure production sender/recipient settings, trigger a real archive-change alert, and confirm delivery at an approved inbox |
| Scheduled monitoring | **Workflow configured; continuing reliability not certified** | Confirm current scheduled workflow runs and delivery outcomes over time, including failure and retry handling |
| Operational resilience | **Partial / not completed** | Run controlled provider-timeout, rate-limit, database-disconnect, process-restart and recovery tests; document impact and recovery results |
| Atlas network access | **Needs production mapping** | Connected Atlas project shows a broad `0.0.0.0/0` access-list entry. The live Render service has no confirmed static egress address in the inspected configuration, and the production connection URI was not independently matched to this Atlas project. Confirm the actual production cluster and stable egress before narrowing the allowlist; changing it blindly could disconnect production |
| Independent security review | **Not performed** | Have an independent reviewer assess the deployed application, threat model, authorization boundaries, data handling and operational configuration before broad launch |

## Operational notes

### Backup workflow

The guarded workflow is `.github/workflows/database-backup.yml`. It is opt-in. Keep the MongoDB URI and encryption passphrase in GitHub Actions secrets only; never commit or paste them into chat or logs. The encryption passphrase must also be recoverable from a separate secure location. After enabling the workflow, verify a successful encrypted backup and isolated restore before treating recovery as operational.

See [docs/OPERATIONS.md](OPERATIONS.md) for the runbook.

### Alert delivery

The API integrates with Brevo and has automated tests for successful/rejected API responses and missing configuration. Production delivery is not complete until an approved test recipient confirms a real message. Keep the Brevo key, sender and recipient settings in the appropriate secret/configuration stores.

### Network access

Do not narrow the Atlas access list until the production database cluster and Render egress are conclusively mapped. Production availability takes priority over an unverified allowlist edit; plan a controlled network change with rollback.

## Known product boundaries

- ADVERSE is an evidence-led public-source research workspace, not a truth detector or a guarantee that a reachable URL is safe, genuine or reliable.
- A source/entity match is a research lead, not proof that the source supports a claim.
- User assessments such as “supported” or “conflicting” remain human review labels, not automated verification.
- Only monitor websites and systems the user owns or is explicitly authorized to monitor.
- Keep API keys, database credentials, session secrets, scheduler secrets and email credentials in secret stores, not source code, commits or issue reports.

## Release decision

**Current recommendation: deployed beta / controlled testing.** Phases 4–10 are implemented and live, and the latest build, API, browser, quality and automated security workflows passed. Broad production readiness remains blocked on the operational and independent-review gates above.

Do not describe ADVERSE as “GPT-6 certified” or “OpenAI certified.” A truthful description is: **“Built with GPT-6 assistance; verification evidence is published in the repository.”**

## Reproducible evidence

1. [CI — run 44879870566](https://github.com/Ad3n1x/ADVERSE/actions/runs/44879870566)
2. [Quality gates — run 44879870551](https://github.com/Ad3n1x/ADVERSE/actions/runs/44879870551)
3. [CodeQL and dependency audit — run 44879870573](https://github.com/Ad3n1x/ADVERSE/actions/runs/44879870573)
4. [Operations runbook](OPERATIONS.md)
5. [Backup workflow](../.github/workflows/database-backup.yml)
6. [Render API service](https://dashboard.render.com/web/srv-dbbqbq2fngtc73a716b0)
