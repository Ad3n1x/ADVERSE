# ADVERSE

**Discover connections. Reconstruct history. Verify the evidence.**

ADVERSE is an evidence-first public-information research workspace. It helps researchers collect source records, map documented relationships, reconstruct website history, and export a traceable investigation report without presenting unverified claims as facts.

## Implemented

- Responsive React + TypeScript workspace with private researcher accounts.
- Express API with investigation CRUD, source records, entities, relationships, and ownership-scoped access.
- MongoDB persistence in production and explicit ephemeral in-memory storage for local evaluation.
- Public search through Wikipedia's MediaWiki API (not a whole-web search engine).
- Internet Archive Wayback CDX capture lookup, timestamped snapshots, and heuristic archived-text comparison.
- Passive public DNS lookup through Google Public DNS-over-HTTPS.
- Optional OpenCorporates lookup when a server-side API token and suitable provider access are configured.
- Evidence chronology that keeps publication, capture, and retrieval dates distinct.
- Searchable interactive entity graph with node inspection, linked relationship review, evidence references, and verification-status styling.
- Cross-source lexical-overlap analysis with publisher-domain clustering, shared terms, provenance cautions, and privacy-scoped API tests.
- Optional AI-assisted evidence review through an administrator-configured OpenAI-compatible chat-completions endpoint. It only receives stored titles/excerpts and validates returned evidence IDs; all output remains a provisional draft requiring human review.
- JSON investigation export, CSV evidence export, and a print-friendly report that can be saved as PDF from the browser print dialog.
- Archive monitoring rules, alert review, acknowledgement, and deletion. The worker checks for new Internet Archive captures; it is not a live-page change detector and needs MongoDB plus an awake, running API worker.
- Optional opt-in transactional email alerts through Resend, with event-based idempotency, bounded retries, and graceful failure when email configuration is absent.
- Input validation, URL safety checks, Helmet headers, bounded request bodies, timeouts, authentication rate limiting, scrypt password hashing, signed HttpOnly SameSite cookies, and owner-scoped investigation access.
- API unit/integration tests, Chromium browser workflow tests, and GitHub Actions CI for API checks, frontend production builds, and end-to-end registration/investigation/graph flows.

## Known limitations

- Wikipedia results cover Wikipedia only.
- AI review is disabled until `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, and `AI_PROVIDER_MODEL` are configured on the API service. Provider compatibility varies; AI review does not browse or independently verify original URLs.
- Cross-source lexical overlap is not semantic entailment or contradiction detection. Domain clustering cannot establish common ownership or editorial independence.
- Archived text comparison is heuristic and may contain extraction noise.
- Internet Archive coverage is incomplete; no capture does not prove a page never existed.
- DNS observations do not establish ownership, control, or intent.
- Monitoring depends on the Internet Archive provider, MongoDB, and a running worker. Free hosting can sleep, so checks may be delayed. Alerts are in-app records; email/push notifications are not implemented.
- The graph remains a lightweight SVG visualization; force-directed layout, path highlighting, large-graph performance tuning, and saved layouts are not implemented.
- Browser end-to-end testing is not yet comprehensive.
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
- `GET /api/v1/investigations/:id/timeline`
- `GET /api/v1/investigations/:id/export?format=json|csv`
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

Never commit real credentials. Keep MongoDB and provider tokens on the API service only. AI review uses `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, and `AI_PROVIDER_MODEL` on the API service only; never expose the API key in the frontend. Optional email alerts use `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, and `ALERT_EMAIL_TO` and send only when all three are configured.

## Evidence principles

- Preserve original source URLs and source-attributed dates.
- Treat source excerpts and researcher-entered notes as records, not independent verification.
- A documented relationship is not proof of causation or wrongdoing.
- Read original sources and review limitations before drawing conclusions.
