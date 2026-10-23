# Web application architecture

ADVERSE's web client is React + TypeScript. The root app chooses the admin or workspace surface; the workspace composition shell owns shared state wiring while feature views, lifecycle effects, and actions live in dedicated modules.

```text
src/
├── App.tsx
├── app/
│   ├── WorkspaceApp.tsx              # auth gate, shared state, and top-level composition
│   ├── WorkspaceContext.tsx          # typed shared state/actions for extracted views
│   ├── components/
│   │   ├── WorkspaceMain.tsx         # main page composition
│   │   ├── WorkspaceSidebar.tsx      # navigation and account controls
│   │   ├── WorkspaceDialogs.tsx      # modals and transient overlays
│   │   ├── WorkspaceSettingsPanel.tsx
│   │   ├── ResearchWorkspacePanels.tsx
│   │   │   ├── SearchHeroPanel.tsx
│   │   │   ├── AgentRunSummaryPanel.tsx
│   │   │   └── SearchResultsPanel.tsx
│   │   ├── CollectionWorkspacePanels.tsx
│   │   ├── ResearchCollectionsPanel.tsx
│   │   ├── EvidenceVaultPanel.tsx
│   │   ├── ConnectionsPanel.tsx
│   │   ├── SourceReviewPanel.tsx
│   │   └── PublicDataProvidersPanel.tsx
│   ├── handlers/
│   │   ├── createCaseResearchAction.ts
│   │   ├── createWorkspaceResearchPipeline.ts
│   │   ├── createWorkspaceSearchActions.ts
│   │   ├── createWorkspaceResearchTools.ts
│   │   ├── createWorkspaceCollectionActions.ts
│   │   ├── createWorkspaceRecordActions.ts
│   │   ├── createWorkspaceAccountActions.ts
│   │   ├── createWorkspaceAuthActions.ts
│   │   ├── createGraphMutationActions.ts
│   │   ├── createImportExistingResearch.ts
│   │   ├── createReviewActions.ts
│   │   └── createVisualSearchAction.ts
│   └── hooks/
│       ├── useWorkspaceUiState.ts     # transient controls and modal state
│       ├── useWorkspaceLifecycle.ts   # session, polling, provider and UI effects
│       ├── useWorkspaceCollections.ts # collection data and request sequencing
│       ├── useWorkspaceCredentials.ts # AI/search-provider credential lifecycle
│       └── useWorkspaceNotifications.ts
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
│   ├── api.ts
│   └── ids.ts
└── types/
    ├── admin.ts
    └── research.ts
```

## Boundaries and conventions

- `WorkspaceApp.tsx` is the composition root: it wires state hooks and action factories, exposes their dependencies through `WorkspaceContext`, and selects the authenticated or anonymous shell. It no longer contains the complete workspace UI or all workflows.
- `WorkspaceContext.tsx` keeps shared collection/search state strongly typed, so extracted components preserve useful inference for list operations and state setters.
- `components/` under `app/` contains presentation and page composition. Search, collection overview, saved evidence, connections, source review, provider settings, dialogs, and navigation are separate view modules.
- `hooks/` owns state and lifecycle concerns; `handlers/` owns API workflows and mutations. Factories receive dependencies explicitly instead of importing the composition shell.
- All authenticated API requests use `lib/api.ts`; public unauthenticated search keeps its existing public-fetch contract.
- Shared domain interfaces remain in `types/`.
- `createWorkspaceResearchPipeline.ts` composes autonomous discovery, status polling, and the post-run intelligence review without changing the existing API endpoints.
- `createWorkspaceSearchActions.ts` owns public search, evidence capture, and source watch actions. `createWorkspaceResearchTools.ts` owns archive, historical graph, organization, and domain lookup actions.
- `createWorkspaceCollectionActions.ts`, `createWorkspaceRecordActions.ts`, and `createWorkspaceAccountActions.ts` isolate collection lifecycle, record mutations, and account/export operations.
- `createImportExistingResearch.ts`, `createReviewActions.ts`, `createGraphMutationActions.ts`, and `createVisualSearchAction.ts` retain their existing focused responsibilities.
- The frontend typecheck/build, API regression tests, live API contract checks, dependency audit, CodeQL, and browser smoke tests are the verification gates for this refactor.
