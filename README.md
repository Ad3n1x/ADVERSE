# ADVERSE

**Discover connections. Reconstruct history. Verify the evidence.**

ADVERSE is an evidence-first public-information research workspace. It helps researchers collect source records, map documented relationships, reconstruct website history, and export a traceable investigation report without presenting unverified claims as facts.

## Implemented

- Responsive React + TypeScript workspace with private researcher accounts.
- Express API with investigation CRUD, source records, entities, relationships, and ownership-scoped access.
- MongoDB persistence in production and explicit ephemeral in-memory storage for local evaluation.
- Federated public-source search across Wikipedia, Crossref scholarly works, and OpenAlex research metadata. Provider coverage is bounded and is not whole-web search.
- Internet Archive Wayback CDX capture lookup, timestamped snapshots, and heuristic archived-text comparison.
- Passive public DNS lookup through Google Public DNS-over-HTTPS plus Certificate Transparency history from crt.sh when available.
- Optional OpenCorporates lookup when a server-side API token and suitable provider access are configured.
- Evidence chronology that keeps publication, capture, and retrieval dates distinct.
- Searchable interactive entity graph with node inspection, linked relationship review, evidence references, and verification-status styling.
- Cross-source lexical-overlap analysis with publisher-domain clustering, shared terms, provenance cautions, and privacy-scoped API tests.
- Optional AI-assisted evidence review through an administrator-configured OpenAI-compatible chat-completions endpoint. It only receives stored titles/excerpts and validates returned evidence IDs; all output remains a provisional draft requiring human review.
- JSON and CSV exports plus a server-generated multi-page PDF investigation report with evidence, entities, relationships, source dates, and explicit limitations.
- Archive monitoring rules, alert review, acknowledgement, and deletion. An authenticated internal scheduler endpoint and a Render Cron runner/Blueprint are included; durable scheduled execution requires provisioning the cron service and configuring the same strong `MONITORING_CRON_SECRET` on both services. Manual owner-scoped checks remain available.
- Brevo transactional alerts track delivery attempts and retain failed sends as pending so later worker cycles can retry them. A Brevo API acceptance test passed; an end-to-end test that observes a genuinely newer archive capture and confirms delivery to the configured inbox is still required. The UI shows sent/pending/disabled status and the latest delivery error.
- Monitoring checks compare Internet Archive capture timestamps; they do not continuously inspect live pages or prove that page content changed. The in-process worker is only a fallback; the Render Cron runner is the durable scheduling path once provisioned.
- Input validation, URL safety checks, Helmet headers, bounded request bodies, timeouts, authentication rate limiting, scrypt password hashing, signed HttpOnly SameSite cookies, and owner-scoped investigation access.
- API unit/integration tests, Chromium browser workflow tests, and GitHub Actions CI for API checks, frontend production builds, and end-to-end registration/investigation/graph flows.

## Known limitations

- Federated search covers Wikipedia, Crossref, and OpenAlex only; it is not a general web index and provider failures may reduce coverage.
- AI review is disabled until `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, and `AI_PROVIDER_MODEL` are configured on the API service. Provider compatibility varies; AI review does not browse or independently verify original URLs.
- Cross-source lexical overlap is not semantic entailment or contradiction detection. Domain clustering cannot establish common ownership or editorial independence.
- Archived text comparison is heuristic and may contain extraction noise.
- Internet Archive coverage is incomplete; no capture does not prove a page never existed.
- DNS observations do not establish ownership, control, or intent.
- Monitoring depends on the Internet Archive provider, MongoDB, and a scheduled runner. The Render Cron runner/Blueprint is in source, but it is not active until the cron resource is provisioned and its secret is configured. Brevo email delivery is implemented when configured; push notifications are not implemented.
- The graph remains a lightweight SVG visualization. It highlights a shortest-connection spanning tree and provides accessible entity/relationship lists, but force-directed layout, pan/zoom, large-graph performance tuning, and saved layouts are not implemented. Historical graph view reconstructs which records were known by a date; it cannot prove objective historical state.
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
- `GET /api/v1/archives?url=...`
- `GET /api/v1/archives/compare?url=...&from=YYYYMMDDhhmmss&to=YYYYMMDDhhmmss`
- `GET /api/v1/domains?url=...`
- `GET /api/v1/investigations/:id/cross-source-review`
- `POST /api/v1/investigations/:id/ai-review`
- `GET /api/v1/investigations/:id/history/graph?asOf=ISO_DATE`
- `GET /api/v1/investigations/:id/timeline`
- `GET /api/v1/investigations/:id/export?format=json|csv|pdf`
- `POST /api/v1/internal/monitoring/run` (requires `x-monitoring-secret`)
- `GET/POST /api/v1/investigations/:id/monitoring`
- `DELETE /api/v1/monitoring/:id`
- `POST /api/v1/alerts/:id/acknowledge`
- `GET /api/v1/health`

Authenticated routes require a valid session.

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
