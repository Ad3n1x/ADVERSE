# Web application architecture

The client is React + TypeScript. The folder structure now separates the application entry point, domain features, shared UI, API access, and domain contracts.

```text
src/
├── App.tsx                      # minimal route composition
├── app/WorkspaceApp.tsx         # authenticated shell and page composition
│   ├── handlers/                # extracted workflows with explicit dependencies
│   │   ├── createCaseResearchAction.ts      # autonomous investigation orchestration
│   │   ├── createGraphMutationActions.ts    # evidence and graph mutations
│   │   ├── createImportExistingResearch.ts # collection import and graph mapping
│   │   └── createReviewActions.ts           # AI review, claim map, source review and gap actions
│   └── hooks/
│       ├── useWorkspaceCollections.ts  # collection selection and request sequencing
│       ├── useWorkspaceCredentials.ts  # AI and search-provider credential lifecycle
│       └── useWorkspaceNotifications.ts # toast/error lifecycle
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
- `WorkspaceApp.tsx` still owns substantial state and orchestration. Feature workflows that combine many API calls should move into `app/handlers/` with explicit dependency contracts; stateful lifecycle logic belongs in hooks, and presentation belongs in `features/`.
- `createImportExistingResearch.ts` owns collection import orchestration. It preserves the existing API endpoints and validates evidence/entity/relationship mappings before copying graph relationships.
- `createReviewActions.ts` owns the four evidence-review request workflows; the workspace shell supplies state setters and notifications while request behavior stays unchanged.
- `createCaseResearchAction.ts` owns the autonomous investigation lifecycle and receives discovery, refresh, and UI feedback functions explicitly. This reduces shell-level orchestration without changing the discovery pipeline or its endpoints.
- `createGraphMutationActions.ts` owns single-record and bulk deletion workflows for evidence, entities, and relationships. Confirmation prompts and API paths remain unchanged; the shell supplies current collection data and refresh/feedback functions.
- Continue extracting one workflow at a time. Keep the active collection state centralized until a feature has a clear state boundary, and run the full frontend typecheck/build and browser smoke tests after each extraction.
