# ADVERSE feature audit

Audit basis: repository source on main inspected during the 2026-10-20 implementation pass. This is a source review, not a claim that every live provider workflow was exercised in production.

## Status legend
- **Implemented (bounded):** working implementation exists, but scope is narrower than the master prompt.
- **Partial:** useful behavior exists, with named requirements missing.
- **Provider-dependent:** requires credentials, permissions, or external provider availability.
- **Not implemented / unverified:** source review does not support a completion claim.

## Requirement-to-code matrix

| Requirement | Current implementation / evidence | Status | Remaining work |
|---|---|---|---|
| Repository foundation, MERN-style app, CI | npm workspaces; React + TypeScript/Vite; Express/Mongoose; GitHub Actions API check/test, frontend build, Playwright | Implemented (bounded) | Add lint/format jobs and broaden tests; CI green does not prove all requirements |
| Auth and private investigations | apps/api/src/app.js, models.js, app.test.js; scrypt hashes, signed HttpOnly cookie, owner-scoped investigation routes | Implemented (bounded) | Review session expiry/rotation, registration abuse controls, CSRF posture and account lifecycle |
| Public intelligence search | providers.js: federated Wikipedia, Crossref and OpenAlex queries with per-provider fault tolerance and result deduplication | Implemented (bounded) | Not a whole-web index; no saved search history, suggestions, or advanced query filters; provider failures and rate limits reduce coverage |
| Evidence vault and provenance | Evidence model includes URL, publisher, published/retrieved dates, excerpt, status, capture timestamp and content hash field | Partial | Verify hash population/deduplication, evidence reuse across investigations, claim links, retention controls and richer extraction errors |
| Entities and relationships | Investigation-scoped entity/relationship models; relationship requires evidence IDs; overview APIs/UI | Partial | Verify referenced evidence/entities belong to the same investigation on every mutation; richer provenance/edge details and path traversal needed |
| Interactive evidence graph | Searchable SVG graph with node selection, relationship/evidence details, keyboard node activation, accessible entity/relationship lists, and a shortest-connection spanning tree highlighted from the selected entity | Partial | Force-directed layout, pan/zoom, direct edge selection/filtering, graph-size handling and saved/restored layouts are not implemented; path highlight is a navigation aid, not a claim of evidentiary strength |
| Wayback history | CDX lookup, archived URLs/timestamps, normalized-text comparison | Implemented (bounded) | No Common Crawl; no pixel-level diff; validate edge cases/rate limiting and test live provider failures |
| Temporal evidence graph | Evidence chronology plus `/history/graph?asOf=` and Time Machine UI for records known by a chosen date | Partial | This reconstructs knowledge/record availability, not objective historical reality; explicit event-occurrence dates and date-range graph filtering remain absent |
| Cross-source comparison | Lexical overlap and publisher-domain clustering; source caveats | Partial | Not semantic agreement/disagreement detection; no robust syndication/independence analysis or passage-level claim mapping |
| Public organization records | Optional OpenCorporates search in providers.js | Provider-dependent | Token, licence, API quota and production response path need confirmation; no broad filing/officer coverage guarantee |
| Passive domain intelligence | Google Public DNS-over-HTTPS A/AAAA/MX/TXT observations and crt.sh Certificate Transparency entries with issuer and validity windows | Implemented (bounded) | No live TLS handshake inspection, certificate-chain validation, or technology fingerprinting; certificate/DNS records must not imply ownership |
| AI evidence analyst | Optional configured OpenAI-compatible endpoint; stored evidence titles/excerpts and evidence-ID validation | Provider-dependent | No configured-provider E2E proof in this audit; no browsing/independent verification; test citation integrity, prompt-injection resistance, timeout/size limits and empty/conflicting evidence |
| Monitoring and alerts | Wayback timestamp polling, in-app alerts, manual owner-scoped check, Brevo send status, bounded retry backoff, secret-authenticated scheduler endpoint and runner; GitHub Actions schedule workflows are configured; alert sender falls back to `BREVO_FROM_EMAIL`; unit tests cover provider acceptance/rejection and sender fallback | Partial | Scheduled execution is not fully verified: the discovery workflow failed because `ADVERSE_API_URL` and `DISCOVERY_CRON_SECRET` were missing from Actions secrets; the API URL is now configured directly in the workflow, but `DISCOVERY_CRON_SECRET`, `CYBER_MONITORING_CRON_SECRET`, and `MONITORING_CRON_SECRET` must be added to GitHub Actions and match the corresponding Render API secrets. Full archived-text diff alerts and true new-capture-to-email end-to-end proof remain outstanding; CDX digest comparison is not semantic analysis |
| Workspaces, notes, saved state | Investigation CRUD and notes/status fields | Partial | No collaboration/team permissions, server-synced pinned relationships, unresolved-question workflow, or comprehensive audit trail |
| Reports and exports | Owner-scoped JSON, CSV with formula neutralization, and server-generated multi-page PDF containing evidence, entities, relationships, dates and limitations | Implemented (bounded) | PDF layout uses built-in Helvetica/ASCII-safe fallback; verify report content and large-case pagination under production load |
| SSRF / unsafe URLs | HTTP(S)-only URL validator, credential/localhost/private-range blocks; DNS lookup rejects restricted answers | Partial | No generic arbitrary-URL content fetcher exists; full SSRF/DNS-rebinding/redirect-chain/IPv6 regression coverage remains necessary before adding one |
| XSS, injection and API limits | Helmet, bounded JSON body, Zod validation, timeouts, auth rate limit and output escaping for Brevo HTML | Partial | Dedicated security test suite and review of every input/render/export/provider boundary still required |
| Accessibility and responsive UI | Responsive app styles and browser test on desktop Chromium | Partial | Keyboard-only, screen reader, contrast, touch/mobile layout and graph list-alternative testing are not verified |
| Deployments and docs | Render Blueprint, Vercel rewrite, .env.example, README, live deployments previously reported | Implemented (bounded) | Verify current deployment after latest commits; production secrets/provider settings and archive-to-email delivery are external runtime dependencies |

## Security review notes

- Provider integrations call Wikipedia, Internet Archive CDX, Google Public DNS-over-HTTPS, and optionally OpenCorporates. The app does not currently expose a generic arbitrary-URL content fetcher; do not add one without a dedicated safe-fetch layer.
- URL validation now explicitly rejects common reserved IPv4 ranges and IPv4-mapped IPv6 addresses that map to private/reserved IPv4 space. This is defense-in-depth, not a complete network security certification.
- Continue validating ownership server-side for all investigation resources. A client-side hidden button is not authorization.
- Retrieved excerpts and AI output remain untrusted. Render as text, escape HTML in emails, and never execute embedded source instructions.
- Public-domain observations are evidence of observations at a timestamp, not proof of shared ownership, intent, wrongdoing, or a private person's identity.

## Verification still required before calling the master prompt complete

1. Run current API tests, syntax/type checks, frontend production build and browser tests against the exact audited commit.
2. Test a true new Wayback capture end to end: alert created, email provider accepts it, status persists as sent, failed sends retry without duplicates.
3. Add authorization tests for every entity/evidence/relationship mutation, including foreign IDs from another investigation.
4. Add focused graph tests for filters, relationship selection, keyboard/list alternative, historical graph date boundaries, and graph states after reload.
5. Add archive tests for missing captures, invalid timestamps, same-capture comparisons, provider timeout and malformed responses.
6. Add report tests for PDF validity/content/pagination, citations, limitations, CSV formula injection, and authorization.
7. Add Playwright checks for mobile and desktop Find Anything layout, narrow-viewport overflow, and the recent-search interaction; keyboard-only, screen-reader, contrast, and full accessible-label audits remain outstanding.
8. Run a security review covering session lifecycle, CSRF, rate limiting, URL validation, outbound network behavior, XSS, injection and dependency vulnerabilities.
9. Verify AI and OpenCorporates with explicitly configured credentials if those provider workflows are to be advertised as active.
10. Keep GitHub repository secrets `CYBER_MONITORING_CRON_SECRET` and `MONITORING_CRON_SECRET` synchronized with the matching Render API secrets. The `.github/workflows/monitoring-schedule.yml` workflow has completed successfully for both jobs on 2026-10-21. Still verify a real new Wayback capture through alert persistence and email delivery.

## Completion rule

ADVERSE should not be labelled fully compliant with the master prompt until the remaining items are implemented or explicitly scoped out and the relevant end-to-end tests pass. The product can be deployed and useful while still being incomplete against the broader specification.