# API architecture

ADVERSE uses Node.js, Express, and Mongoose. Routes are grouped by resource; business/domain helpers are grouped under services; Mongoose schemas are split by model. Compatibility exports remain in place so the production entry point and existing imports continue to work during migration.

```text
src/
├── controllers/
│   └── auth/
│       └── password-reset.controller.js # password reset request handlers
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
│   ├── auth/                            # password reset email delivery
│   ├── agent/                           # agent run state
│   ├── discovery/                       # autonomous discovery
│   ├── media/                           # image/video/people search
│   ├── monitoring/                      # archive monitoring worker
│   ├── reporting/                       # report generation
│   ├── research/                        # orchestration, evidence ingestion, provenance graph, analysis and planning
│   └── search/                          # provider adapters and search orchestration
├── app.js                               # Express setup, shared middleware and route composition
└── server.js                            # process entry point and worker startup
```

## Conventions

- Each Mongoose model lives in its own file; `models/index.js` is the barrel and `models.js` remains a compatibility export.
- Route modules receive shared dependencies explicitly from `app.js`; preserve authentication, owner scoping, status codes, response envelopes, rate limits and memory-mode behavior.
- Search, research, reporting, discovery and monitoring logic belongs in `services/`; password-reset email delivery is isolated from the request handlers.
- Authentication and password-reset handlers live in `controllers/auth/`; `routes/auth.routes.js` owns endpoint wiring, rate limiting and async error wrapping.
- The web workspace uses `app/hooks/useWorkspaceNotifications.ts` for toast/error lifecycle and `features/public-search/visual-file.ts` for browser media preprocessing.
- The API `check` script syntax-checks the new route/service/model files as well as compatibility exports.
- Utility routes now delegate to `controllers/utility.controller.js`; auth routes delegate to the auth controllers. The remaining resource route modules are still being migrated incrementally so their existing authorization, owner scoping, response envelopes and memory-mode behavior stay intact.

Run `npm run check -w @adverse/api` and `npm test -w @adverse/api` from the repository root.


## Investigation route boundaries

The former monolithic `investigations.routes.js` registered 24 endpoints in one large module. It now delegates registration to three focused route groups:

- `investigation-core.routes.js`: investigation collection CRUD, overview, and autonomous agent run lifecycle.
- `investigation-analysis.routes.js`: AI review, cross-source comparison, research-gap analysis, and claim mapping.
- `investigation-records.routes.js`: evidence, entity, and relationship records.

All groups receive the same dependency object from the composition entry point. This keeps authentication, persistence adapters, validation schemas, and domain services wired centrally in `app.js`, while route registration is split by responsibility. The split is intentionally behavior-preserving: endpoint paths and handlers are moved rather than redesigned. Run the API syntax check and regression suite before merging any route changes.
