# ADVERSE Vue 3 + CesiumJS migration

## Decision

ADVERSE will move its browser application from React/TypeScript to Vue 3, using the
God's Eye View (GEV) geospatial client and CesiumJS as the geospatial foundation.
This is a staged migration, not a wholesale replacement of ADVERSE's product or
backend.

Upstream project: https://github.com/bilawalsidhu/gods-eye-view
Upstream license: MIT (retain required copyright and license notices for reused
upstream code; review bundled data and provider terms separately).

## Non-negotiable product boundaries

- ADVERSE remains a public-source research and evidence workspace.
- Preserve the existing Express API, MongoDB data model, authentication,
  authorization, user workspaces, investigations, evidence records, and
  provenance unless a separately tested compatibility change is required.
- Geospatial layers in this migration are limited to public, attributable,
  non-personal datasets and aggregate environmental/event/infrastructure data.
- Do not port or expose named-person search, face recognition, private camera
  feeds, individual/device/vehicle tracking, or other features intended to
  monitor a private person. Do not proxy provider credentials to browsers.
- Every displayed dataset must show source, retrieval/update time, limitations,
  and a link to the authoritative source where available.
- Treat geospatial observations as informational, potentially delayed or
  incomplete, never as safety-critical navigation or emergency-response data.

## Target architecture

- Frontend: Vue 3, Vite, TypeScript, Vue Router/Pinia only where needed.
- Globe: CesiumJS using the GEV-compatible Cesium setup and viewer lifecycle.
- API: existing ADVERSE Express service and MongoDB remain authoritative.
- Data boundary: a small typed ADVERSE adapter maps approved API/public GeoJSON
  feeds into GEV-compatible layer inputs. Upstream modules must not bypass
  ADVERSE authorization, rate limits, attribution, or provider policy.
- Deployment: retain existing Vercel frontend / Render API topology after
  validating Node runtime, build output, SPA routing, PWA, and environment
  configuration.

## Migration sequence

1. Inventory and contract capture
   - Record existing routes, auth/session behavior, API calls, deep links,
     admin route, PWA install/share behavior, graph/research flows, and tests.
   - Capture API request/response contracts before replacing React components.
2. Vue shell and compatibility adapters
   - Add Vue 3/Vite app entry, routing, state, design tokens, and API client.
   - Recreate auth guards and route handling against the existing API.
   - Keep React production entry intact until the Vue shell passes smoke tests.
3. GEV/Cesium integration
   - Integrate the upstream viewer/layer architecture selectively.
   - Start with approved public layers such as USGS earthquakes and public
     environmental observations. Add more only after source/terms review.
   - Keep Cesium viewer lifecycle isolated and lazy-load heavy rendering assets.
4. ADVERSE feature migration
   - Port workspace navigation, search, investigation records, evidence,
     source provenance, graph/timeline views, admin and download routes.
   - Preserve existing stored data and API contracts.
5. Quality and deployment
   - Run frontend type checks, unit tests, API regression tests, production
     build, accessibility/responsive checks, auth/tenant isolation checks,
     and production-like smoke tests.
   - Confirm the configured Node runtime satisfies upstream requirements
     (GEV currently declares Node >=24.14.0 <25 or >=26 <27).
   - Verify Cesium asset paths, ion/provider configuration, CSP, PWA caching,
     service-worker update behavior, and Vercel/Render routing.
6. Cutover
   - Keep React available as rollback until the Vue build is verified.
   - Switch production only after CI and preview smoke tests pass.
   - Do not merge or deploy this migration automatically.

## Initial upstream integration review

The GEV package declares Vue 3, Pinia, CesiumJS, Vite, and a Cesium Vite plugin.
It is a broad application with many data providers and operational features;
ADVERSE should reuse the viewer/layer foundations, not import the entire
standalone application or all of its providers.

## Status

This branch begins the migration plan and architecture boundary. It does not
yet contain the Vue frontend, Cesium viewer, or a production deployment.
The earlier React Globe.gl work in PR #18 is not the target implementation and
must not be merged as the final geospatial engine.

