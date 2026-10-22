# API architecture

ADVERSE uses Node.js, Express, and Mongoose. The source is organized by domain, with compatibility exports retained while the legacy application is migrated.

```text
src/
├── config/                         # runtime configuration (to be extracted)
├── controllers/                    # HTTP orchestration (to be extracted by resource)
├── middleware/                     # auth, validation and errors (to be extracted)
├── models/
│   ├── *.model.js                   # one Mongoose model per domain
│   └── index.js                     # barrel exports
├── routes/
│   └── health.routes.js             # liveness and readiness endpoints
├── services/
│   ├── agent/                       # agent run state
│   ├── discovery/                   # autonomous research discovery
│   ├── media/                       # image/video/people search
│   ├── monitoring/                  # scheduled archive monitoring
│   ├── reporting/                   # report generation
│   ├── research/                    # follow-up planning, claim analysis and gaps
│   └── search/                      # provider adapters and search orchestration
├── app.js                           # Express composition plus legacy routes
└── server.js                        # process entry point and worker startup
```

## Active conventions

- Each Mongoose model lives in its own file; `models/index.js` is the barrel and `models.js` is a compatibility export.
- Search, research, reporting, discovery, monitoring and agent logic lives under `services/`; old source paths re-export these modules for existing imports.
- Health and readiness endpoints are registered through `routes/health.routes.js`.
- Keep the existing `server.js` entry point, environment variable names, response envelopes, authentication, ownership checks, rate limits, and memory-mode fallbacks stable.
- `app.js` still contains most resource route handlers. The API is not yet fully MVC; extracting those into resource routers/controllers is still required.
- The API `check` script syntax-checks both compatibility exports and the new domain modules.

Run `npm run check -w @adverse/api` and `npm test -w @adverse/api` from the repository root.
