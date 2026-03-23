# Project structure

Monorepo root (**npm workspaces**): `backend`, `extension`, `shared`.

```
VIPT/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API_OVERVIEW.md
│   ├── DEMO_FLOW.md
│   └── PROJECT_STRUCTURE.md   (this file)
├── package.json               # root scripts: test, db:migrate, build:*, …
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── server.ts           # Fastify + Express app, /api/v1 mounts
│   │   ├── config/
│   │   ├── db/                 # schema.sql, schema.core.sql, migrate.ts, SQL patches
│   │   ├── middleware/
│   │   ├── models/             # database pool, cache, seed
│   │   ├── routes/             # products, prices, predictions, events, alerts, recommendation
│   │   ├── services/           # domain logic (profiler, ensemble, trust, feedback, …)
│   │   ├── queues/             # BullMQ job helpers
│   │   ├── workers/
│   │   └── tests/              # Jest
│   └── jest.config.js
├── extension/                  # Chrome extension (Vite/React) — optional client
├── shared/
│   ├── src/index.ts            # shared TypeScript types & enums
│   └── types/                  # barrel re-exports
└── docker-compose.yml          # if present: Postgres/Redis services
```

---

## Key services (backend)

| Area | Files (representative) |
|------|-------------------------|
| Prices & validation | `priceAggregationService.ts`, `DataValidator.ts` |
| Features | `FeatureEngineer.ts`, `priceHistoryForPrediction.ts` |
| Prediction | `predictionService.ts` |
| Phase 2 | `productProfiler.ts`, `dynamicEnsemble.ts`, `signalEnricher.ts`, `trustEngine.ts` |
| Outcomes & metrics | `predictionOutcomeService.ts`, `predictionOutcomeEvaluationService.ts`, `predictionEvaluationService.ts` |
| Model ops | `modelPerformanceService.ts`, `modelHealthService.ts` |
| Feedback | `feedbackService.ts` |

---

## Shared types

`shared/src/index.ts` exports API-facing types (`PricePrediction`, `ProductProfile`, `EnrichedPredictionSignals`, `TrustContext`, feedback types, etc.). Backend resolves `@shared/*` via `tsconfig` paths.

---

## Tests

Run from repository root:

```bash
npm test
```

Executes `backend` Jest (`backend/src/tests/**/*.test.ts`).
