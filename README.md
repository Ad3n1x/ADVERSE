# ADVERSE

**ADVERSE — Find Anything. In Minutes.**

ADVERSE is a public-first search product that helps people find useful webpages, official resources, tools, guides, and answers faster. It searches available public sources, deduplicates results, and checks a selection of destinations for readable public-page access. Reachability is not a guarantee that content is true, safe, current, or endorsed. The private research workspace remains available for users who want to save and analyze sources.

## Public search experience\n\n- Public search without an account through `/api/v1/public-search`.\n- Federated search across configured and keyless public providers; coverage is bounded and is not the entire web.\n- Duplicate URL removal and a limited live accessibility check for selected result links.\n- Clear status for reachable, unconfirmed, and unchecked links. Redirects, bot restrictions, and transient outages can prevent confirmation without proving a URL is fake.\n- No invented URLs or false claims of verification; the interface explains what each check does and does not establish.\n- Existing private research tools remain behind authentication.\n\n## Existing private research workspace

- Responsive React + TypeScript workspace with private researcher accounts.
- Express API with investigation CRUD, source records, entities, relationships, and ownership-scoped access.
- MongoDB persistence in production and explicit ephemeral in-memory storage for local evaluation.
- Federated public-source search across Wikipedia, Crossref scholarly works, OpenAlex research metadata, GDELT Global News, Google News RSS, Wikidata, plus optional adapters for Brave Search, Bing Web Search, Google Programmable Search, SerpAPI, Tavily, Exa, NewsAPI, Reddit Search, and YouTube Data API. Optional adapters activate when their server-side credentials are configured. Provider runs are isolated; coverage remains bounded and is not whole-web search or a universal web crawler.
- Internet Archive Wayback CDX capture lookup, timestamped snapshots, and heuristic archived-text comparison.
- Passive public DNS lookup through Google Public DNS-over-HTTPS plus Certificate Transparency history from crt.sh when available.
- Optional OpenCorporates lookup when a server-side API token and suitable provider access are configured.
- Evidence chronology that keeps publication, capture, and retrieval dates distinct.
- Searchable interactive force-directed entity graph with draggable nodes, pan/zoom, fit-to-view, local layout save/restore/reset, relationship-type filters, node inspection, relationship details, evidence references, and verification-status styling. Graph edges are investigative navigation aids, not proof.
- Cross-source lexical-overlap analysis with publisher-domain clustering, shared terms, provenance cautions, and privacy-scoped API tests.
- Evidence-linked claim triage: extracts candidate factual sentences from stored titles/excerpts, groups lexically similar statements, flags selected numeric or negation differences for human review, and links every candidate back to source records. It is deliberately a triage aid, not a truth detector.
- AI-assisted evidence review through server-side Google Gemini configuration (`GEMINI_API_KEY`, optional `GEMINI_MODEL`) with an OpenAI-compatible fallback. Reviews use only stored evidence metadata and excerpts, validate referenced evidence IDs, preserve a bounded history of the latest 10 reviews per investigation, and remain provisional drafts requiring human review.
- JSON and CSV exports plus a server-generated multi-page PDF investigation report with evidence, entities, relationships, source dates, and explicit limitations.
- Archive monitoring rules, alert review, acknowledgement, and deletion. An authenticated internal scheduler endpoint and a Node cron-runner script are included.
- **Authorized cyber-intelligence monitoring:** register public HTTP(S) assets only after explicitly confirming ownership or permission; collect timestamped public DNS records, bounded HTML/text retrieval snapshots, response status, and Certificate Transparency observations; hash observations and emit provenance-labeled baseline, content-change, DNS-change, certificate-observation, and failed-check events.
- Cyber monitoring records are private to the investigation owner, capped at 25 assets per investigation, and checked against public-only URL/DNS safeguards. The feature does not scan private networks, inspect packets, install endpoint agents, or infer compromise from an anomaly.
- Manual cyber checks are available from the Cyber Intelligence workspace. A protected `/api/v1/internal/cyber-monitoring/run` endpoint and `apps/api/scripts/cyber-monitoring-cron.js` support scheduled checks when MongoDB is configured and a Render Cron service is provisioned. Durable scheduled execution requires a scheduler such as a Render Cron service plus the same strong `MONITORING_CRON_SECRET` on both services. A billable cron resource is not provisioned automatically. Manual owner-scoped checks remain available.
- Brevo transactional alerts track delivery attempts and retain failed sends as pending with bounded exponential retry backoff. A Brevo API acceptance test passed; an end-to-end test that observes a genuinely newer archive capture and confirms delivery to the configured inbox is still required. The UI shows sent/pending/disabled status and the latest delivery error.
- Monitoring checks compare Internet Archive capture timestamps and, when available, CDX content digests to avoid alerting on identical-content recaptures. They do not fetch/compare full page text or continuously inspect live pages; a digest change does not explain why content changed. The in-process worker is only a fallback; the Render Cron runner is the durable scheduling path once provisioned.
- Input validation, URL safety checks, Helmet headers, bounded request bodies, timeouts, authentication rate limiting, scrypt password hashing, signed HttpOnly SameSite cookies, and owner-scoped investigation access.
- API unit/integration tests, Chromium browser workflow tests, and GitHub Actions CI for API checks, frontend production builds, and end-to-end registration/investigation/graph flows.

## Known limitations

- Federated search covers the providers listed above when reachable; it is not a general web index, does not crawl the entire internet, and provider failures may reduce coverage.
- AI review uses Google Gemini when `GEMINI_API_KEY` is configured on the API service; `GEMINI_MODEL` defaults to `gemini-2.5-flash`. An OpenAI-compatible chat-completions provider remains available through `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, and `AI_PROVIDER_MODEL` as a fallback. The public health endpoint reports only whether configuration is present and does not expose credentials. A configured provider is not proof of successful end-to-end review; verify with an authenticated investigation containing at least two evidence records. AI review does not browse or independently verify original URLs.
- Cross-source lexical overlap and extractive claim triage are not semantic entailment, comprehensive contradiction detection, or fact-checking. Similarity can group unrelated claims; numeric differences can reflect units or context. Domain clustering cannot establish common ownership or editorial independence.
- Archived text comparison is heuristic and may contain extraction noise.
- Internet Archive coverage is incomplete; no capture does not prove a page never existed.
- DNS observations do not establish ownership, control, or intent.
- Monitoring depends on the Internet Archive provider, MongoDB, and a scheduled runner. Cyber monitoring additionally depends on public DNS/HTTP and Certificate Transparency provider availability; the scheduled Cron service is optional and must be provisioned/configured separately. The scheduler endpoint and runner script are in source, but scheduled execution is not active until an external cron resource is provisioned and its secret is configured. Brevo email delivery is implemented when configured; push notifications are not implemented.
- The graph uses a lightweight force-directed 2D layout with pan/zoom and locally saved node positions. Very large graph performance still needs profiling; saved positions remain browser-local rather than synced across devices. Historical graph view reconstructs which records were known by a date; it cannot prove objective historical state.
- Browser end-to-end testing is not yet comprehensive. Security tests cover representative URL restrictions and cross-user access, but do not constitute a full SSRF/DNS-rebinding, redirect-chain, CSP, accessibility, or penetration audit.
- Registration is open. Do not treat this research build as a substitute for legal, journalistic, or security review before storing sensitive investigations.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB for durable persistence

Without `MONGODB_URI`, local development uses in-memory storage and records are lost when the API process restarts. Production startup requires both `MONGODB_URI` and `JWT_SECRET`.

## Local development

1. Copy `.env.example` to `.env` and set the required environment values.
2. From the repository root, run `npm install`.
3. Run `npm run dev` to start the web app and API.
4. Open `http://localhost:5173`; API health is available at `http://localhost:4000/api/v1/health`.
5. Run `npm test`, `npm run check -w @adverse/api`, and `npm run build -w @adverse/web`.
6. Run `npx playwright install chromium` once, then `npm run test:e2e` for browser workflow checks.

The Vite development server proxies `/api` to `http://localhost:4000`.

## Key API routes

- `GET/POST /api/v1/investigations`
- `GET/PATCH/DELETE /api/v1/investigations/:id`
- `GET /api/v1/investigations/:id/overview`
- `GET/POST /api/v1/investigations/:id/evidence`
- `GET/POST /api/v1/investigations/:id/entities`
- `GET/POST /api/v1/investigations/:id/relationships`
- `GET /api/v1/search?q=...`
- `GET /api/v1/search/providers` (authenticated provider availability and configuration catalog)
- `GET /api/v1/archives?url=...`
- `GET /api/v1/archives/compare?url=...&from=YYYYMMDDhhmmss&to=YYYYMMDDhhmmss`
- `GET /api/v1/domains?url=...`
- `GET /api/v1/investigations/:id/cross-source-review`
- `GET /api/v1/investigations/:id/claim-map`
- `POST /api/v1/investigations/:id/ai-review`
- `GET /api/v1/investigations/:id/history/graph?asOf=ISO_DATE`
- `GET /api/v1/investigations/:id/timeline`
- `GET /api/v1/investigations/:id/export?format=json|csv|pdf`
- `POST /api/v1/internal/monitoring/run` (requires `x-monitoring-secret`)
- `GET/POST /api/v1/investigations/:id/monitoring`
- `GET/POST /api/v1/investigations/:id/cyber-assets`
- `POST /api/v1/cyber-assets/:id/check`
- `DELETE /api/v1/cyber-assets/:id`
- `POST /api/v1/internal/cyber-monitoring/run` (requires `x-cyber-monitoring-secret`)
- `DELETE /api/v1/monitoring/:id`
- `POST /api/v1/alerts/:id/acknowledge`
- `GET /api/v1/health`

Authenticated routes require a valid session.

## Broad keyword search

The authenticated `GET /api/v1/search?q=...` endpoint expands a search into a bounded query plan: exact phrase, natural-language wording, core terms, individual input tokens, and related wording variants. For example, `MovieBox old version` is searched as a phrase and broader variants including individual terms and alternative wording such as older/previous/earlier/legacy. Results from each available provider are merged by normalized URL, with matched query variants retained for transparency and relevance ranking.

Search providers include the saved ADVERSE evidence index, Wikipedia, Crossref, OpenAlex, GDELT Global News, Google News, Wikidata, and optional adapters for Brave Search, Bing Web Search, Google Programmable Search, SerpAPI, Tavily, Exa, NewsAPI, Reddit, and YouTube. Configure only the providers you have permission to use with server-side environment variables: `BRAVE_SEARCH_API_KEY`, `BING_SEARCH_API_KEY`, `GOOGLE_CSE_API_KEY` plus `GOOGLE_CSE_CX`, `SERPAPI_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, `NEWSAPI_API_KEY`, and `YOUTUBE_API_KEY`. Do not expose these keys in frontend variables or commit them to Git. `GET /api/v1/search/providers` lists configured and unconfigured connectors. The plan is intentionally bounded to reduce request fan-out and provider overload. It cannot guarantee every page on the internet: providers index different material, may rate-limit or fail, and do not provide exhaustive crawling. The UI reports the query plan and available provider failures so researchers can see how coverage was attempted.

## Deployment

### Render API

The repository includes a Render Blueprint at `render.yaml`. Configure `MONGODB_URI` and `WEB_ORIGIN` in the Render environment settings. The Blueprint generates a `JWT_SECRET`. Set `WEB_ORIGIN` to the deployed frontend origin. Health check: `/api/v1/health`.

### Vercel frontend

The Vercel project builds from the repository root using `vercel.json`. The rewrite forwards `/api/*` requests to the current Render service at `https://adverse-api-7yim.onrender.com`. Update that hostname if the Render service URL changes.

### Secrets

Never commit real credentials. Keep MongoDB and provider tokens on the API service only. AI review uses `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, and `AI_PROVIDER_MODEL` on the API service only; never expose the API key in the frontend. Optional email alerts use Brevo's transactional email API and require `BREVO_API_KEY`, `ALERT_EMAIL_FROM` (a verified sender email), and `ALERT_EMAIL_TO`. Keep the API key on the Render API service only. Missing or rejected email configuration leaves alert delivery pending, and subsequent monitoring cycles retry pending alerts. The authenticated `POST /api/v1/monitoring/:id/check` endpoint lets an investigation owner request an immediate archive check.

## Requirements audit

See [`docs/FEATURE_AUDIT.md`](docs/FEATURE_AUDIT.md) for the requirement-by-requirement status, evidence, and remaining verification work. Status labels distinguish implemented behavior from partial, provider-dependent, and unverified requirements.

## Evidence principles

- Preserve original source URLs and source-attributed dates.
- Treat source excerpts and researcher-entered notes as records, not independent verification.
- A documented relationship is not proof of causation or wrongdoing.
- Read original sources and review limitations before drawing conclusions.


### Password recovery

- The sign-in screen includes a Forgot password flow. Reset tokens are generated with cryptographic randomness, stored only as SHA-256 hashes, expire after 30 minutes, and are consumed once. Reset requests use a generic response to avoid revealing whether an email address has an account.
- Configure `BREVO_API_KEY` on the Render API service. `BREVO_FROM_EMAIL` defaults to the verified `adenix271@gmail.com` sender and `BREVO_FROM_NAME` defaults to `ADVERSE`; the sender must remain active in Brevo. Set `WEB_ORIGIN` to the exact HTTPS origin of the deployed frontend so reset links return to ADVERSE. Never expose the Resend key in frontend variables or source control.
- Without a valid Brevo API key and active sender, the UI still returns the generic response but no email is delivered; check server logs for the `password_reset_delivery_failed` event and configure the sender before relying on recovery in production.
