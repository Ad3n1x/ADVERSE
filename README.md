# ADVERSE

**Discover connections. Reconstruct history. Verify the evidence.**

ADVERSE is an evidence-first public-information research platform for investigations, source provenance, relationship graphs, and historical website research.

## Project status

This repository is being initialized. Features must be described as implemented only after their workflows have been built and verified. Provider access may require configuration; core research records should remain usable without paid integrations.

## Intended architecture

- `apps/web` — React + TypeScript client
- `apps/api` — Node.js + Express API
- MongoDB — persistent investigations, entities, relationships, and evidence
- GitHub — source control
- Vercel — frontend deployment
- Render — API deployment

## Security principles

- Treat retrieved content as untrusted input.
- Validate all API inputs on the server.
- Do not expose secrets in frontend bundles.
- Public URL retrieval must defend against SSRF, redirects to private networks, oversized responses, and timeouts.
- Keep provenance and uncertainty visible; never fabricate sources or relationships.

## Development

Detailed local setup instructions will be added alongside the application manifests and environment examples. Never commit real credentials.

## Scope note

Historical archives and public data providers may be unavailable, incomplete, rate-limited, or credential-gated. ADVERSE must report those limitations rather than imply comprehensive coverage.