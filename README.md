# VIPT — Virtual Intelligence Price Tracker

**Deterministic, backend-first price intelligence for cross-platform shopping.**

VIPT is a monorepo that ingests price observations, validates and stores them, builds explainable features, and serves **baseline** price forecasts plus observability (profiles, trust, model health, outcomes, feedback). The system is designed to grow toward richer ML later—**today’s prediction path is rule-based and fully deterministic**, not a trained neural or ARIMA ensemble in production.

---

## What VIPT is

- A **PostgreSQL-backed API** (Express under Fastify) with **Redis** caching, **BullMQ**-style job hooks for cross-platform refresh, and a **Chrome extension** workspace for client-side capture.
- A **validator-first pipeline**: prices land in `price_history` with quality tiers; rejected rows do not feed predictions.
- **Phase 2 intelligence layers** (implemented in the backend): ProductProfiler → DynamicEnsemble → SignalEnricher → TrustEngine, plus **FeedbackService** tied to `prediction_outcomes`.

---

## Key differentiators

| Topic | Reality in this repo |
|--------|----------------------|
| **Predictions** | **Rolling-mean baseline** (+ optional ensemble smoothing/conservative blending). No separate ARIMA/LSTM training pipeline shipped as the default predictor. |
| **Determinism** | Same inputs → same outputs for profiling, ensemble mode, signals, and trust (no randomness in core paths). |
| **Observability** | Evaluation summaries, `model_performance` rollups, drift flags, model health, and user feedback on outcomes. |
| **Extension** | Optional workspace for capturing listings; **this README focuses on backend**; load the extension from `extension/` when building the browser client. |

---

## Major capabilities

- **Products:** detect/resolve identity, search, fetch by id (`/api/v1/products/*`).
- **Prices:** history, comparison, feature vectors from history, manual record, cross-platform intel (`/api/v1/prices/*`).
- **Predictions:** baseline forecast, optional `includeEvaluation`, `debug` for feature vectors, **profile**, **feedback**, **model performance & health** (`/api/v1/predictions/*`).
- **Events:** upcoming/active/platform events, sale likelihood (`/api/v1/events/*`).
- **Alerts & recommendations:** CRUD-style alerts and recommendation endpoints (see [docs/API_OVERVIEW.md](docs/API_OVERVIEW.md)).

---

## Architecture (summary)

```
Extension (optional) ──► REST /api/v1 ──► Express app
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   price_history         predictions          prediction_outcomes
   + DataValidator       + Profiler           + evaluation
   + FeatureEngineer     + Ensemble           + rollups / drift
                         + Signals + Trust     + feedback
         │                    │                    │
         └────────────────────┴────────────────────┘
                              ▼
                    PostgreSQL (+ Redis cache)
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full pipeline.

---

## Backend intelligence layers (Phase 2)

| Layer | Role |
|--------|------|
| **ProductProfiler** | Classifies products from stored history (volatility, cold start, trend hints). |
| **DynamicEnsemble** | Selects `baseline_only` / `smoothed` / `conservative` adjustment to the point forecast. |
| **SignalEnricher** | Adds `enrichedSignals` (freshness, spread, events, factor tags). |
| **TrustEngine** | Adds `trustContext` (score, tier, cautions, recommended action) using profiler + signals + **baseline_v1** model health when available. |
| **FeedbackService** | Stores user/system feedback rows linked to `prediction_outcomes`. |

---

## Local setup

### Prerequisites

- **Node.js** 20+
- **PostgreSQL** (Docker Compose or local)
- **Redis** (optional but used for cache / queues)

### Install

```bash
git clone <your-repo-url>
cd VIPT
npm install
```

Workspaces: `backend`, `extension`, `shared`.

### Environment

Copy and edit backend env if present (e.g. `backend/.env`); defaults target PostgreSQL on port **5433** per `backend/src/config`—adjust `DB_*` and `REDIS_*` to match your compose file.

### Database

```bash
npm run db:migrate
npm run db:seed   # optional demo data
```

### Run backend

```bash
npm run dev:backend
# or: cd backend && npm run dev
```

Default HTTP port: **3000** (`PORT` env overrides).

### Run tests

From repo root:

```bash
npm test
# or: cd backend && npm test
```

### Build

```bash
npm run build:backend
npm run build:extension
```

---

## Documentation index

| Doc | Purpose |
|-----|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Ingestion → validation → features → prediction → outcomes → health → feedback |
| [docs/DEMO_FLOW.md](docs/DEMO_FLOW.md) | Step-by-step API demo narrative |
| [docs/API_OVERVIEW.md](docs/API_OVERVIEW.md) | Endpoint cheat sheet with examples |
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | Repository layout |

---

## Current milestone summary

- **Backend V1** complete: products, prices, events, alerts, recommendations, anti-manipulation hooks, queues.
- **Predictions:** **baseline** rolling-mean model with **Phase 2** profiler, ensemble, signals, trust, outcomes evaluation, performance rollups, drift, health, and feedback storage.
- **Tests:** `backend` Jest suite passes (`npm test` from root).

---

## Roadmap / next steps (honest)

- Optional **ML models** (e.g. ARIMA, learned ensembles) *behind* the same API contracts—**not** the current default path.
- **Trust ↔ feedback** linkage and reporting aggregates.
- **Web dashboard** / richer extension UX.
- **Retraining** or automated model selection (explicitly **out of scope** today).

---

## License

MIT — see [LICENSE](LICENSE) if present in the repo.
