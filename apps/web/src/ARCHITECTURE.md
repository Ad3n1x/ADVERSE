# Web application structure

The web client is a React + TypeScript application. The current `App.tsx` remains the application composition point while the UI is incrementally separated into feature-owned modules.

## Target structure

```text
src/
├── app/                    # application shell, providers, route/tab composition
├── components/
│   ├── layout/             # sidebar, top bar, responsive navigation
│   └── ui/                 # reusable presentational primitives
├── features/
│   ├── research/            # question input, results, investigations
│   ├── evidence/            # source cards, evidence detail
│   ├── graph/               # within-collection relationship graph
│   ├── settings/            # account and platform settings
│   └── admin/               # admin-only interface
├── hooks/                   # reusable React hooks
├── lib/                     # API client, formatters, constants
├── types/                   # shared TypeScript contracts
├── styles/                  # global tokens and shared styles
├── AdminApp.tsx             # admin interface (to be split into admin features)
└── App.tsx                  # temporary composition root during migration
```

## Migration rules

- Move one feature at a time and keep existing API contracts stable.
- Keep API requests in `lib/` or feature-specific data-access modules, not in presentational components.
- Keep graph rendering and graph transformation logic inside `features/graph/`.
- Preserve the single global active-collection state; do not reintroduce a second collection selector inside the graph.
- Keep accessibility and responsive behavior covered by the existing Playwright smoke tests.
