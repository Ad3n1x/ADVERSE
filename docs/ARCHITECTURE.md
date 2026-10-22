# ADVERSE architecture

ADVERSE is a JavaScript monorepo with a React/TypeScript client and an Express/Mongoose API.

- `apps/web`: React client, organized into app shell, feature modules, shared UI, API client, and domain types.
- `apps/api`: Express API, domain services, and individually defined Mongoose models.
- `apps/web/src/ARCHITECTURE.md`: active frontend structure and migration conventions.
- `apps/api/src/ARCHITECTURE.md`: active API structure and MVC migration boundaries.

This refactor is incremental to protect production behavior. Existing Render entry points, public URLs, environment variables, API payloads, database schema semantics, authentication, and ownership checks must remain stable. The API route/controller extraction and further decomposition of `WorkspaceApp.tsx` remain explicit follow-up phases rather than being hidden behind empty folders.
