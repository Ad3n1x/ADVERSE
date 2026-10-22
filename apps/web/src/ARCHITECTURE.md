# Web application architecture

The client is React + TypeScript. The folder structure now separates the application entry point, domain features, shared UI, API access, and domain contracts.

```text
src/
├── App.tsx                      # minimal route composition
├── app/WorkspaceApp.tsx         # authenticated workspace shell (next decomposition target)
├── components/
│   ├── layout/ToastViewport.tsx
│   └── ui/Empty.tsx, Modal.tsx
├── features/
│   ├── admin/AdminApp.tsx
│   ├── auth/AuthScreen.tsx
│   ├── cyber/CyberIntelligenceView.tsx
│   ├── graph/Graph.tsx
│   ├── monitoring/MonitoringView.tsx
│   └── public-search/PublicSearchScreen.tsx
├── lib/
│   ├── api.ts                   # shared credentialed API client
│   └── ids.ts                   # normalized record ID helper
└── types/
    ├── admin.ts
    └── research.ts
```

## Conventions

- Feature-specific screens and graph behavior live in `features/`; reusable presentation pieces live in `components/`.
- All network requests use `lib/api.ts`, except public unauthenticated search, which uses its public-fetch contract.
- Shared domain interfaces live in `types/`, not inside the root composition file.
- `App.tsx` only chooses the admin or workspace application.
- `WorkspaceApp.tsx` still owns substantial state and orchestration; further hook/controller extraction should happen feature by feature while preserving API contracts and the single active-collection state.
