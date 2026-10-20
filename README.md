# ADVERSE

**Discover connections. Reconstruct history. Verify the evidence.**

ADVERSE is an evidence-first public-information research workspace. It is designed to keep original sources and uncertainty visible while researchers build investigations, map documented relationships, and examine website history.

## Current implementation

- React + TypeScript responsive workspace.
- Express API with investigation, evidence, entity, and relationship endpoints.
- MongoDB models for investigation records, evidence, entities, and relationships; an explicit in-memory fallback is available for local evaluation and is lost on process restart.
- Public search via the Wikipedia MediaWiki API (limited coverage, not a whole-web index).
- Internet Archive Wayback CDX capture lookup and timestamped archive links.
- Heuristic archived-text comparison endpoint, with size limits and explicit limitations.
- Passive DNS record lookup through Google Public DNS-over-HTTPS.
- Evidence timeline and source records with separate publication, retrieval, and capture timestamps.
- JSON investigation export and CSV evidence export.
- API input validation, Helmet headers, URL scheme checks, private-address checks for DNS lookups, bounded request bodies and timeouts.
- API tests and GitHub Actions CI workflow.

## Not complete

Authentication and server-side per-user authorization, teams, PDF export, background monitoring/notifications, automated claim comparison, AI analysis, full company-record provider, and comprehensive browser/e2e testing are not implemented. Do not expose this build publicly for sensitive data until authentication and authorization exist. The graph is a lightweight SVG view of saved entities/relationships; advanced graph layout, large-graph filtering, path highlighting and saved layouts remain future work.

## Requirements

- Node.js 20+
- npm
- MongoDB (local or Atlas) for durable persistence. Without `MONGODB_URI`, the API falls back to in-memory storage and records disappear on restart.

## Local development

1. Copy `.env.example` to `.env` and set `MONGODB_URI` if persistence is desired.
2. Install dependencies from the repository root: `npm install`.
3. Start both apps: `npm run dev`.
4. Web app: `http://localhost:5173`; API health: `http://localhost:4000/api/v1/health`.
5. Run API tests: `npm test`; API syntax check: `npm run check -w @adverse/api`; production frontend build: `npm run build -w @adverse/web`.

The Vite dev server proxies `/api` to `http://localhost:4000`.

## API routes

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
- `GET /api/v1/investigations/:id/timeline`
- `GET /api/v1/investigations/:id/export?format=json|csv`
- `GET /api/v1/health`

## Deploying

### Render API

A `render.yaml` blueprint is included. Create the web service from the repository blueprint and configure `MONGODB_URI` and `WEB_ORIGIN` in Render's environment settings. Set `WEB_ORIGIN` to the deployed frontend origin. The service health check is `/api/v1/health`.

### Vercel frontend

Import the GitHub repository in Vercel. Set the root directory to the repository root and use the included `vercel.json`. After Render creates the API service, update the rewrite destination in `vercel.json` to the exact assigned Render hostname. The rewrite template must be verified against the actual service URL before deployment.

### Secrets

Never commit actual credentials. Configure `MONGODB_URI` only on the backend service. Provider tokens, if added in later work, must remain server-side.

## Research and safety limitations

- Wikipedia search results cover Wikipedia only.
- Wayback captures are incomplete; no capture does not prove a page never existed.
- Text diffs are heuristic and may include extraction noise.
- DNS records show observed DNS answers, not ownership or intent.
- Relationship records require a source evidence reference but remain unverified until a researcher reviews them.
- The API currently has no authentication. Keep it private until access control is implemented.
