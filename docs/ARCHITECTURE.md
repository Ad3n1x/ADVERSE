# ADVERSE application architecture

ADVERSE is a JavaScript monorepo with a React/TypeScript client and an Express/Mongoose API. It follows a MERN-style separation of concerns: React views, Express HTTP routing, service-layer business logic, and Mongoose data models.

- `apps/web`: React + TypeScript user interface.
- `apps/api`: Node.js + Express API and Mongoose persistence.
- `apps/api/src/ARCHITECTURE.md`: API MVC migration map and compatibility rules.
- `apps/web/src/ARCHITECTURE.md`: frontend feature-folder target and UI migration rules.

The refactor is intentionally incremental. Existing public URLs, API payloads, environment variable names, database schemas, and Render entry points must remain stable. Route/controller extraction and splitting the large React composition files should be done feature-by-feature, with type checks, API tests, and browser smoke tests after each step.
