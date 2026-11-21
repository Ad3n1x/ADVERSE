# ADVERSE feature audit

Audit basis: repository source on main inspected after the 2026-11-21 Render release. This is a source and deployment review, not a claim that every live provider workflow was exercised in production.

## Status legend
- **Implemented (bounded):** working implementation exists, but scope is narrower than the master prompt.
- **Partial:** useful behavior exists, with named requirements missing.
- **Provider-dependent:** requires credentials, permissions, or external provider availability.
- **Not implemented / unverified:** source review does not support a completion claim.

## Requirement-to-code matrix

| Requirement | Current implementation / evidence | Status | Remaining work |
|---|---|---|---|
| Repository foundation, MERN-style app, CI | npm workspaces; React + TypeScript/Vite; Express/Mongoose; GitHub Actions API check/test, frontend build, Playwright | Implemented (bounded) | Add lint/format jobs and broaden tests; CI green does not prove all requirements |
| Auth and private investigations | apps/api/src/app.js, models.js, auth controllers; scrypt hashes, signed HttpOnly cookie, owner-scoped investigation/workspace routes | Implemented (bounded) | Review session expiry/rotation, registration abuse controls, CSRF posture, and verify full account deletion against MongoDB; this continuation also closes owner ExperienceWorkspace and user-linked SearchMetric cleanup in memory and database code |
| Public intelligence search | providers.js: federated Wikipedia, Crossref and OpenAlex queries with per-provider fault tolerance and result deduplication | Implemented (bounded) | Not a whole-web index; no saved search history, suggestions, or advanced query filters; provider failures and rate limits reduce coverage |
| Evidence vault and provenance | Evidence model includes URL, publisher, published/retrieved dates, excerpt, status, capture timestamp and content hash; research workspaces now support bounded plain-text document records with SHA-256 hashes and owner-scoped CRUD | Partial | Binary formats remain unsupported; add isolated parsers, scanning, document-to-claim linking, quotas and retention controls |
| Entities and relationships | Investigation-scoped entity/relationship models; relationship requires evidence IDs; overview APIs/UI | Partial | Verify referenced evidence/entities belong to the same investigation on every mutation; richer provenance/edge details and path traversal needed |
| Interactive evidence graph | Primary `/experience` WebGL 3D source/claim network connects discovered sources to analyst-authored claims and labels supports/challenges/context edges; source and claim lists remain available on mobile and reduced-motion settings | Partial | Entity-level relationship graph migration, keyboard-only graph navigation, large-graph performance profiling, and a no-WebGL fallback remain open; analyst link roles are not truth scores |
| Wayback history | CDX lookup, archived URLs/timestamps, normalized-text comparison | Implemented (bounded) | No Common Crawl; no pixel-level diff; validate edge cases/rate limiting and test live provider failures |
| Temporal evidence graph | Evidence chronology plus `/history/graph?asOf=` and Time Machine UI for records known by a chosen date | Partial | This reconstructs knowledge/record availability, not objective historical reality; explicit event-occurrence dates and date-range graph filtering remain absent |
| Destination availability and alternatives | Public HTTP(S) checks with DNS-pinned redirect validation; saved HTTP status, final URL and redirect chain; cross-domain alternative search when a destination is not confirmed | Deployed on Render; API regression and production health checks passed | Search automatically checks a bounded subset; other results can be checked manually. A failed check may reflect bot blocking, login requirements or temporary outages, not proof a destination is dead; alternatives are candidates, not endorsements |
| Public-event geospatial globe | Cesium 3D globe surfaced in the primary `/experience` workspace; attributed USGS earthquake and NASA EONET natural-event feeds plus public STAC collection metadata; users can save observations as source records; accessible event-list fallback remains available when WebGL cannot initialize | Deployed on Render; frontend build and browser integration test passed on retry | Feeds are bounded and may be delayed; some event coordinates are representative/approximate; this is not personal-location tracking or an independent incident assessment |
| Cross-source comparison | Lexical overlap and publisher-domain clustering; source caveats | Partial | Not semantic agreement/disagreement detection; no robust syndication/independence analysis or passage-level claim mapping |
| Public organization records | Optional OpenCorporates search in providers.js | Provider-dependent | Token, licence, API quota and production response path need confirmation; no broad filing/officer coverage guarantee |
| Passive domain intelligence | Google Public DNS-over-HTTPS A/AAAA/MX/TXT observations and crt.sh Certificate Transparency entries with issuer and validity windows | Implemented (bounded) | No live TLS handshake inspection, certificate-chain validation, or technology fingerprinting; certificate/DNS records must not imply ownership |
| AI evidence analyst | Optional configured OpenAI-compatible endpoint; stored evidence titles/excerpts and evidence-ID validation | Provider-dependent | No configured-provider E2E proof in this audit; no browsing/independent verification; test citation integrity, prompt-injection resistance, timeout/size limits and empty/conflicting evidence |
| Monitoring and alerts | Wayback timestamp polling, in-app alerts, manual owner-scoped check, Brevo provider-acceptance status (not inbox-delivery confirmation), bounded retry backoff, secret-authenticated scheduler endpoints; discovery workflow timeout increased from 30 to 120 seconds to tolerate Render cold starts | Partial | A scheduled discovery run timed out under the previous 30-second limit; verify the next scheduled run after the timeout change. Confirm that owned/authorized watches are configured, a new Wayback capture creates a persisted alert, and a real approved recipient receives the Brevo email. API acceptance is not inbox delivery |
| Workspaces, notes, saved state | Investigation CRUD and notes/status fields; owner-controlled read-only sharing with existing active accounts, revocation and bounded sharing audit events; UI controls for sharing/revocation; text/plain upload/list/download/delete UI | Partial | Pending email invitations, editor roles, member writes across all resource endpoints, server-synced pinned relationships, unresolved-question workflow, and comprehensive audit trail |
| Reports and exports | Owner-scoped JSON, CSV with formula neutralization, and server-generated multi-page PDF containing evidence, entities, relationships, dates and limitations | Implemented (bounded) | PDF layout uses built-in Helvetica/ASCII-safe fallback; verify report content and large-case pagination under production load |
| SSRF / unsafe URLs | HTTP(S)-only URL validator, credential/localhost/private-range blocks; DNS lookup rejects restricted answers | Partial | No generic arbitrary-URL content fetcher exists; full SSRF/DNS-rebinding/redirect-chain/IPv6 regression coverage remains necessary before adding one |
| XSS, injection and API limits | Helmet, bounded JSON body, Zod validation, timeouts, auth rate limit and output escaping for Brevo HTML | Partial | Dedicated security test suite and review of every input/render/export/provider boundary still required |
| Accessibility and responsive UI | Responsive app styles and browser test on desktop Chromium | Partial | Keyboard-only, screen reader, contrast, touch/mobile layout and graph list-alternative testing are not verified |
| Deployments and docs | Render frontend and API are live on commit `3c831c1b395828463996ee8452559a1870c99816`; latest CI, quality and CodeQL/dependency workflows passed | Implemented (bounded) | Production secrets/provider settings, backup/restore proof, live archive-to-email delivery and independent security review remain external runtime dependencies |

## Security review notes

- Provider integrations call Wikipedia, Internet Archive CDX, Google Public DNS-over-HTTPS, and optionally OpenCorporates. The app does not currently expose a generic arbitrary-URL content fetcher; do not add one without a dedicated safe-fetch layer.
- URL validation now explicitly rejects common reserved IPv4 ranges and IPv4-mapped IPv6 addresses that map to private/reserved IPv4 space. This is defense-in-depth, not a complete network security certification.
- Continue validating ownership server-side for all investigation resources. A client-side hidden button is not authorization.
- Retrieved excerpts and AI output remain untrusted. Render as text, escape HTML in emails, and never execute embedded source instructions.
- Public-domain observations are evidence of observations at a timestamp, not proof of shared ownership, intent, wrongdoing, or a private person's identity.

## Verification still required before calling the master prompt complete

1. Keep API regression tests, API syntax checks, frontend typecheck/build and browser smoke tests green on every release. The 2026-11-21 release passed these gates; one geospatial Playwright test exceeded its timeout once and passed on retry, so its timing should be stabilized.
2. Test a true new Wayback capture end to end: alert created, email provider accepts it, status persists as sent, failed sends retry without duplicates.
3. Add authorization tests for every entity/evidence/relationship mutation, including foreign IDs from another investigation.
4. Add focused graph tests for filters, relationship selection, keyboard/list alternative, historical graph date boundaries, and graph states after reload.
5. Add archive tests for missing captures, invalid timestamps, same-capture comparisons, provider timeout and malformed responses.
6. Add report tests for PDF validity/content/pagination, citations, limitations, CSV formula injection, and authorization.
7. Existing Playwright checks cover narrow mobile landing/authentication and desktop landing layout. Add dedicated mobile workspace/Find Anything coverage; keyboard-only, screen-reader, contrast, touch interaction, and full accessible-label audits remain outstanding.
8. Run a security review covering session lifecycle, CSRF, rate limiting, URL validation, outbound network behavior, XSS, injection and dependency vulnerabilities.
9. Verify AI and OpenCorporates with explicitly configured credentials if those provider workflows are to be advertised as active.
10. Keep GitHub repository secrets `CYBER_MONITORING_CRON_SECRET` and `MONITORING_CRON_SECRET` synchronized with the matching Render API secrets. The discovery workflow now allows 120 seconds for Render cold starts; verify the next scheduled run and a real Wayback-capture-to-inbox path.

## Completion rule

ADVERSE should not be labelled fully compliant with the master prompt until the remaining items are implemented or explicitly scoped out and the relevant end-to-end tests pass. The product can be deployed and useful while still being incomplete against the broader specification.

## Phases 11–20 continuation

The detailed status and closure criteria for the proposed extension are tracked in [PHASES-11-20-COMPLETION.md](PHASES-11-20-COMPLETION.md). The extension is not represented as complete: backup/restore and monitoring require owner-controlled production exercises; collaboration is not implemented; document ingestion is currently limited to bounded public-page retrieval; accessibility and provider resilience remain partial. Phase 15 account deletion was found to omit owner ExperienceWorkspace records and user-linked telemetry; the correction and regression test are included in the continuation branch.


## Additional Phase 16–19 work in progress

- Workspace sharing is currently read-only and limited to existing active accounts. Owners can share from the Experience workspace UI, list members, and revoke access; membership changes are retained in a bounded workspace audit list. This is not full team collaboration.
- Research workspaces accept text/plain documents only (50 KB per file, maximum 10 per workspace) with SHA-256 provenance and duplicate detection. The Experience workspace UI supports upload, list, download, and deletion. PDF and Office files are rejected until isolated parsing and scanning are available.
- The 3D evidence graph now exposes an expandable keyboard-operable text alternative for entities, sources, and relationships.
- Claim analysis now flags highly similar stored excerpts across different hostnames as possible syndication/shared-origin leads. It does not declare copying or source independence.
