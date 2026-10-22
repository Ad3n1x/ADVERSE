# API architecture

The API uses Node.js, Express, and Mongoose. Its source is organized around an incremental MVC migration:

```text
src/
├── config/                     # runtime configuration (next extraction)
├── controllers/                # HTTP response orchestration (next extraction)
├── middleware/                 # auth, validation and error handling (next extraction)
├── models/
│   ├── *.model.js               # one Mongoose model per domain
│   └── index.js                 # model barrel exports
├── routes/                     # resource routers (next extraction from app.js)
├── services/
│   ├── agent/                  # agent run state
│   ├── media/                  # image/video/people search
│   └── research/               # follow-up planning, claim analysis, research gaps
├── utils/                      # shared pure helpers (next extraction)
├── app.js                      # Express app composition and legacy route registration
└── server.js                   # process entry point and worker startup
```

## Active conventions

- Each Mongoose model lives in its own file; `models/index.js` is the public model barrel and `models.js` remains a compatibility export for older imports.
- Research and agent domain logic lives under `services/`; old source paths are compatibility exports while callers migrate gradually.
- Keep the existing `server.js` entry point, environment variable names, response envelopes, authentication and ownership checks stable.
- Route/controller extraction is the next API phase. It must preserve status codes, response shapes, rate limits, authorization, and memory-mode fallbacks.
- The current API composition file is still large; it must not be considered fully MVC until resource routers and controllers are extracted and regression tests pass.

Run `npm run check -w @adverse/api` and `npm test -w @adverse/api` from the repository root.
