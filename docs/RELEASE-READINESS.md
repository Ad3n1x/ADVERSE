# ADVERSE release readiness record

**Release posture:** GPT-6-assisted engineering; independent certification not claimed.

**Repository:** https://github.com/Ad3n1x/ADVERSE  
**Production web:** https://adverse-web.onrender.com/  
**Production API:** https://adverse-api-7yim.onrender.com/  
**Record updated:** 2026-10-21

**Verified CI commit:** `0fddd7b1d82461766d7aa546569139242b569abd`  
**CI run:** [Run 39670265665 — successful](https://github.com/Ad3n1x/ADVERSE/actions/runs/39670265665)

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
| CI API checks | Latest main-branch GitHub Actions API job passes | **Passed** on commit `0fddd7b`; run 39670265665 completed successfully |
| Frontend build | Type-check and production build pass | **Passed** on commit `0fddd7b`; type-check and production build steps succeeded |
| Browser smoke tests | Playwright run passes against the real frontend entry page | **Passed** on commit `0fddd7b`; both public search smoke tests succeeded |
| Live API checks | Health/readiness endpoints and representative public-search request verified over HTTP | **Health and readiness passed** in production-smoke job in run 39670265665; public-search response is not covered by this check |
| Health-check configuration | Render service dashboard health path matches `/api/v1/ready` | Repository declares it; live Render service setting was observed empty |
| Scheduled monitoring | Recent successful archive and cyber-monitoring scheduled jobs, with no secrets exposed | Must be checked in GitHub Actions and Render |
| Privacy/authorization | Tests demonstrate cross-account access is denied for each private resource family | Needs ongoing review and complete regression coverage |
| Operational resilience | Rate limits, provider failures, database outages, alert delivery, and recovery tested | Not certified by this record |
| Independent security review | External reviewer documents findings and remediation | Not performed |

## How to make a release claim

Only mark a gate passed when the linked CI run, deployment record, or test evidence proves it. Record the exact commit SHA and timestamp with each release. Do not advertise ADVERSE as “GPT-6 certified” or “OpenAI certified.” An accurate description is **“Built with GPT-6 assistance; verification evidence published in the repository.”**

## Reproducible verification

1. The [verified GitHub Actions run](https://github.com/Ad3n1x/ADVERSE/actions/runs/39670265665) passed API syntax/regression tests, frontend typecheck/build, Playwright browser smoke tests, and live API health/readiness checks for `main` commit `0fddd7b1d82461766d7aa546569139242b569abd`.
2. Recheck GitHub Actions after any new commit; a passing run only verifies the exact commit tested.
3. Inspect [Render API service settings](https://dashboard.render.com/web/srv-dbbqbq2fngtc73a716b0) and configure the health-check path as `/api/v1/ready`.
4. Confirm the live API is connected to persistent MongoDB and test public search from the deployed website.
5. Review the scheduled monitoring workflow runs and confirm both monitoring secrets exist in GitHub Actions and match the Render service values. Never publish secret values.
6. Run an independent security review before making a security-certification claim.
