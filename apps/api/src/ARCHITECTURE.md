# API architecture (MVC-oriented)

The API is being reorganized incrementally into a conventional Express/Mongoose structure. This first pass moves domain models and side-effect-free research logic into their owning folders while keeping compatibility exports at the old paths so existing routes, workers, and tests keep working during migration.

## Target structure

```text
src/
├── config/                 # environment and database configuration
├── controllers/             # HTTP request/response orchestration
├── middleware/              # authentication, validation, error handling
├── models/                  # Mongoose schemas and model exports
│   └── index.js
├── routes/                  # Express routers grouped by resource
├── services/
│   ├── agent/               # autonomous run state and orchestration
│   │   └── agent-run-state.js
│   ├── media/               # image, video, and people search
│   │   └── media-search.js
│   └── research/            # lead planning, claim triage, research gaps
│       ├── agent-planner.js
│       ├── claim-analysis.js
│       └── research-gaps.js
├── utils/                   # reusable, side-effect-free helpers
├── validators/              # request schemas
├── app.js                   # Express app composition (routes are extracted next)
└── server.js                # process entry point and worker startup
```

## Current migration rules

- `models/index.js` is the canonical Mongoose model module.
- New research logic belongs under `services/research/`; media search belongs under `services/media/`; agent run-state logic belongs under `services/agent/`.
- Root-level files for the moved modules are compatibility exports, not duplicate implementations. Existing imports can be migrated gradually without breaking production paths.
- `app.js` currently still contains route handlers. The next safe phase is to extract one resource router/controller at a time, keeping response shapes, authentication checks, ownership filters, and status codes unchanged.
- Do not split or rename deployment entry points casually: Render starts `src/server.js`, which composes `src/app.js`.

## Validation

Run from the repository root:

```bash
npm test
npm run build
npm run test:e2e
```
