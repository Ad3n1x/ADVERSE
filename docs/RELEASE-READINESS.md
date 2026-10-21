# ADVERSE release readiness record

**Release posture:** Deployed beta; core CI and live smoke checks pass. A broad public launch is not yet independently cleared.

**Repository:** https://github.com/Ad3n1x/ADVERSE  
**Production web:** https://adverse-web.onrender.com/  
**Production API:** https://adverse-api-7yim.onrender.com/  
**Record updated:** 2026-10-21

**Verified main commit:** `e3159d5478c8c39b7cf7f49d1b26b0e84da33796`  
**CI run:** [Run 39673616692 — successful](https://github.com/Ad3n1x/ADVERSE/actions/runs/39673616692)  
**Render health-check workflow:** [Run 39673616808 — successful](https://github.com/Ad3n1x/ADVERSE/actions/runs/39673616808)  
**Live API deployment:** `dep-dbcict7b9u1s73bnl3m0` — Render reported status `live`.  
**Live health-check path:** `/api/v1/ready`, confirmed in Render service configuration.

## What this record means

GPT-6 assistance may have been used to inspect, change, and document this codebase. This is not an OpenAI-issued certificate, endorsement, security audit, or guarantee of correctness. OpenAI has not reviewed or certified ADVERSE through this document.

## Verified now

- API syntax checks and regression tests passed in the current-main CI run.
- Frontend type-check and production build passed in the current-main CI run.
- Playwright browser smoke tests passed in the current-main CI run.
- Live API liveness, readiness, and public-search response-contract checks passed in the current-main CI run.
- Render service configuration now reports `healthCheckPath: /api/v1/ready`; the configuration workflow verified the saved value and the resulting Render deployment is live.
- Render application logs show successful MongoDB connection and a completed automated discovery cycle that processed two jobs, saved 12 results, and recorded zero provider failures in that cycle.
- Scheduled archive and cyber-monitoring jobs both passed in [run 39657523314](https://github.com/Ad3n1x/ADVERSE/actions/runs/39657523314).
- Automated discovery workflow succeeded in [run 39671815718](https://github.com/Ad3n1x/ADVERSE/actions/runs/39671815718).

## Release gates

| Gate | Status | Remaining work |
|---|---|---|
| API deployment and health check | **Passed** | Continue monitoring live deployment events and readiness. |
| API tests, frontend build, browser smoke tests | **Passed** on the commit linked above | Require green CI for each subsequent change. |
| Live public-search contract | **Passed** | Expand ongoing representative-query and result-quality checks. |
| MongoDB connectivity | **Observed working** in production logs | Confirm provider backup policy and access/recovery ownership. |
| Scheduled monitoring | **Recent successful evidence** exists for archive and cyber-monitoring | Keep checking later scheduled runs; a single run is not a reliability guarantee. |
| Automated discovery | **Successful run observed** | Verify recurrence and result quality over time. |
| Database backup and restore | **Not verified** | Enable/confirm automated backups at the actual MongoDB provider and perform a restore drill. No backup should be claimed until tested. |
| Privacy and authorization | **Partially covered by automated tests** | Complete cross-account/ownership testing for all private resource families. |
| Operational resilience | **Partial** | Exercise provider outage, database outage, rate-limit, email-alert, and recovery scenarios. |
| Production secrets | **Partially evidenced** | Successful protected scheduled jobs prove their required secrets were available for that run; not every production secret/value has been independently audited. Never publish secret values. |
| Independent security review | **Not performed** | Have an independent reviewer assess the deployed application before claiming security certification or broad launch readiness. |

## Known security boundaries

- Public URL checks use private/special-use IP protections, DNS resolution checks, redirect refusal, bounded response reads, and timeouts. DNS rebinding and provider-specific edge cases remain residual risks.
- A reachable URL is not proof that a site is safe, genuine, or trustworthy. The interface should present verification as evidence signals, not a guarantee.
- Keep API keys, scheduler secrets, database credentials, session secrets, and email credentials in deployment secret stores.
- Only monitor websites and systems that the user owns or is explicitly authorized to monitor.

## Release decision

**Current recommendation: deployed beta / controlled public testing.** The core engineering and smoke checks pass, but full production readiness is not established until backup restoration, broader authorization and resilience tests, and independent security review are completed.

Do not advertise ADVERSE as “GPT-6 certified” or “OpenAI certified.” An accurate description is **“Built with GPT-6 assistance; verification evidence published in the repository.”**

## Reproducible evidence

1. [Current-main CI](https://github.com/Ad3n1x/ADVERSE/actions/runs/39673616692) — API tests, frontend build, browser smoke tests, and live API checks.
2. [Render health-check configuration workflow](https://github.com/Ad3n1x/ADVERSE/actions/runs/39673616808) — updates and verifies the live service path.
3. [Scheduled archive and cyber-monitoring run](https://github.com/Ad3n1x/ADVERSE/actions/runs/39657523314).
4. [Automated discovery run](https://github.com/Ad3n1x/ADVERSE/actions/runs/39671815718).
5. [Render API service](https://dashboard.render.com/web/srv-dbbqbq2fngtc73a716b0).
6. Operational recovery guidance: [docs/OPERATIONS.md](OPERATIONS.md).
