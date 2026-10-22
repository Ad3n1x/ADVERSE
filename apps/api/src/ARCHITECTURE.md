# API architecture

ADVERSE uses Node.js, Express, and Mongoose. Routes are grouped by resource; business/domain helpers are grouped under services; Mongoose schemas are split by model. Compatibility exports remain in place so the production entry point and existing imports continue to work during migration.

```text
src/
├── models/
│   ├── *.model.js                       # one Mongoose model per domain
│   └── index.js                         # model barrel exports
├── routes/
│   ├── admin.routes.js                  # admin authentication and operations
│   ├── auth.routes.js                   # account auth, recovery and sessions
│   ├── cyber.routes.js                  # explicitly authorized asset monitoring
│   ├── health.routes.js                 # liveness and readiness
│   ├── internal.routes.js               # secret-protected scheduled jobs
│   ├── investigations.routes.js         # collections, evidence and relationships
│   ├── monitoring.routes.js             # archive watches and alerts
│   ├── public-search.routes.js           # public web/media/visual search
│   ├── research.routes.js               # saved search and autonomous research
│   ├── search.routes.js                 # provider credentials and authenticated search
│   └── utility.routes.js                # archives, domains, timelines and exports
├── services/
│   ├── agent/                           # agent run state
│   ├── discovery/                       # autonomous discovery
│   ├── media/                           # image/video/people search
│   ├── monitoring/                      # archive monitoring worker
│   ├── reporting/                       # report generation
│   ├── research/                        # follow-up planning, claim analysis, gaps and source assessment
│   └── search/                          # provider adapters and search orchestration
├── app.js                               # Express setup, shared middleware and route composition
└── server.js                            # process entry point and worker startup
```

## Conventions

- Each Mongoose model lives in its own file; `models/index.js` is the barrel and `models.js` remains a compatibility export.
- Route modules receive shared dependencies explicitly from `app.js`; preserve authentication, owner scoping, status codes, response envelopes, rate limits and memory-mode behavior.
- Search, research, reporting, discovery and monitoring logic belongs in `services/`; old source paths re-export the moved implementations.
- The API `check` script syntax-checks the new route/service/model files as well as compatibility exports.
- The current route modules still contain some request-handler logic inline. A further controller/service split is a separate refactor; avoid changing behavior while extracting controllers.

Run `npm run check -w @adverse/api` and `npm test -w @adverse/api` from the repository root.
