# ADVERSE release readiness record

**Release posture:** GPT-6-assisted engineering; independent certification not claimed.

**Repository:** https://github.com/Ad3n1x/ADVERSE  
**Production web:** https://adverse-web.onrender.com/  
**Production API:** https://adverse-api-7yim.onrender.com/  
**Record updated:** 2026-10-21

**Last fully verified CI commit:** `8a40f2db2e6442e073f7f3ca21ffdea9220a9fcc`  
**CI run:** [Run 39670739177 — successful](https://github.com/Ad3n1x/ADVERSE/actions/runs/39670739177)  
**Current main commit:** `777be681c8718ead445153a98effd61d3030bd2d` (adds live public-search contract check; verification pending)

## What this record means

GPT-6 assistance may have been used to inspect, change, and document this codebase. This is not an OpenAI-issued certificate, endorsement, security audit, or guarantee of correctness. OpenAI has not reviewed or certified ADVERSE through this document.

## Implemented safeguards and engineering work

- API readiness and liveness endpoints with reduced public configuration disclosure.
- Production API startup runs JavaScript syntax checks before starting.
- Private research endpoints and internal scheduled tasks have authentication protections with regression-test coverage in the repository.
- Public URL verification includes private and special-use IP checks, DNS resolution checks, redirect refusal, bounded response reading, and timeouts. DNS rebinding and provider-specific edge cases remain residual risks; do not treat URL reachability as proof of safety or truth.
- GitHub Actions CI is configured to run API syntax/regression tests, frontend type-check/build, and Playwright browser smoke tests.
- A security reporting and responsible-use policy is documented in `SECURITY.md`.
- Scheduled monitoring is configured in `.github/workflows/monitoring-schedule.yml`; actual operation depends on repository secrets, Render configuration, MongoDB availability, and successful scheduled-run results.

## Release gates — evidence must be current

| Gate | Evidence required | Status in this record |
|---|---|---|
| API deploy | Render shows the target commit live and startup logs are healthy | A successful Render API deployment and MongoDB connection were observed on 2026-10-21 |
| CI API checks | Latest main-branch GitHub Actions API job passes | **Last passed** on commit `8a40f2d`; run 39670739177. Current main commit awaits CI. |
| Frontend build | Type-check and production build pass | **Last passed** on commit `8a40f2d`; current main commit awaits CI. |
| Browser smoke tests | Playwright run passes against the real frontend entry page | **Last passed** on commit `8a40f2d`; current main commit awaits CI. |
| Live API checks | Health/readiness endpoints and representative public-search request verified over HTTP | **Health and readiness passed** in run 39670739177. New public-search contract check was added on current commit and awaits CI. |
| Health-check configuration | Render service dashboard health path matches `/api/v1/ready` | Repository declares it; live Render service setting was observed empty |
| Scheduled monitoring | Recent successful archive and cyber-monitoring scheduled jobs, with no secrets exposed | **Passed** for both archive and cyber-monitoring jobs in scheduled run [39657523314](https://github.com/Ad3n1x/ADVERSE/actions/runs/39657523314). Automated discovery had older failures caused by a missing API URL in the workflow version used by those runs; the current workflow now specifies the production API URL, and its next scheduled run must be confirmed. |
| Privacy/authorization | Tests demonstrate cross-account access is denied for each private resource family | Needs ongoing review and complete regression coverage |
| Operational resilience | Rate limits, provider failures, database outages, alert delivery, and recovery tested | Partial controls/tests exist; full failure/recovery exercise remains outstanding. |
| Database backups and restore | Automated backups enabled and a restore drill completed | Not verified; confirm MongoDB backup policy and test restoring a backup before relying on user data. |\n| Environment configuration | Production `WEB_ORIGIN`, `JWT_SECRET`, `MONGODB_URI`, and all required scheduler secrets are present and correctly scoped | Presence of all values is not independently verified here; never share the values themselves. |\n| Independent security review | External reviewer documents findings and remediation | Not performed |

## How to make a release claim

Only mark a gate passed when the linked CI run, deployment record, or test evidence proves it. Record the exact commit SHA and timestamp with each release. Do not advertise ADVERSE as “GPT-6 certified” or “OpenAI certified.” An accurate description is **“Built with GPT-6 assistance; verification evidence published in the repository.”**

## Reproducible verification

1. The [last fully verified GitHub Actions run](https://github.com/Ad3n1x/ADVERSE/actions/runs/39670739177) passed API syntax/regression tests, frontend typecheck/build, Playwright browser smoke tests, and live API health/readiness checks for commit `8a40f2db2e6442e073f7f3ca21ffdea9220a9fcc`.
2. The current main commit `777be681c8718ead445153a98effd61d3030bd2d` adds a live public-search response-contract check. Do not call that change verified until its CI run passes.
3. Inspect [Render API service settings](https://dashboard.render.com/web/srv-dbbqbq2fngtc73a716b0) and configure the health-check path as `/api/v1/ready`. The latest Render service details still reported this field as empty, so this is not marked complete.
4. Confirm the live API is connected to persistent MongoDB and test public search from the deployed website.
5. Review the [scheduled monitoring run](https://github.com/Ad3n1x/ADVERSE/actions/runs/39657523314) and the next [automated discovery run](https://github.com/Ad3n1x/ADVERSE/actions). Confirm scheduler secrets match the Render service values. Never publish secret values.
6. Run an independent security review before making a security-certification claim.
