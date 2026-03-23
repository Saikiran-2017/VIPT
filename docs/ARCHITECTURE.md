# VIPT Architecture

This document describes how data flows through the **implemented** backend. Wording is precise: **prediction today is deterministic baseline math** (rolling means, ensemble adjustments, heuristics)—not a separately trained ARIMA/LSTM stack unless you add one later.

---

## High-level flow

1. **Ingestion** — Clients (extension or API) send product detections or raw price records.
2. **Validator-first pipeline** — `DataValidator` / quality rules gate what becomes durable `price_history` (rejected rows are excluded from downstream forecasting).
3. **Feature engineering** — `FeatureEngineer` builds dense vectors from chronological prices + optional retail events + cross-platform listings when available.
4. **Prediction** — `PredictionService` loads validated context, runs **ProductProfiler**, **DynamicEnsemble**, **SignalEnricher**, **TrustEngine**, returns `PricePrediction` (+ optional evaluation).
5. **Outcomes** — Each prediction can record a skeleton row in `prediction_outcomes` for later evaluation against actuals.
6. **Evaluation & rollups** — Services fill outcomes, refresh `model_performance`, compute drift flags, and expose **model health**.
7. **Feedback** — `prediction_feedback` stores human labels linked to outcomes.

---

## Ingestion flow

- **POST `/api/v1/products/detect`** resolves or creates a `products` row via `productIdentityService`, then calls `priceAggregationService.recordPrice` when `currentPrice > 0`.
- **POST `/api/v1/prices/record`** allows manual observations with the same recording path.
- Background work may enqueue **cross-platform refresh** (BullMQ when Redis is available; otherwise inline with logging).

Data lands in **`price_history`** with **`quality`** (and related fields) so suspicious or duplicate ticks can be filtered before features or predictions.

---

## Validator-first pipeline

- Recording paths prefer **validated** or at least **non-rejected** rows for forecasting.
- Prediction and evaluation services query with `quality <> 'rejected'` (and may further distinguish validated vs other tiers in summaries).

This keeps the “brain” honest: garbage ticks do not silently steer the baseline.

---

## Feature engineering

- **`FeatureEngineer.buildFeatureVector`** (used when enough points exist) produces a fixed-order vector: lags, rolling means/stds, RSI-like signals, calendar features, proximity to **retail_events**, cross-platform spread placeholders, etc.
- **GET `/api/v1/prices/features/:productId`** exposes the same vector read-only for debugging or future ML.

No external ML API calls are required for this step; features are **deterministic** from stored rows and config.

---

## ProductProfiler

- **Service:** `backend/src/services/productProfiler.ts`
- **Input:** `price_history` aggregated per product (optional platform filter).
- **Output:** `ProductProfile` — usable point counts, validated fraction, freshness, volatility class, cold start flag, trend hint, profile confidence, recommended baseline mode string.

Used for routing ensemble behavior and trust—not a separate ML classifier.

---

## DynamicEnsemble

- **Service:** `backend/src/services/dynamicEnsemble.ts`
- **Logic:** Maps profile + confidence to a mode: `baseline_only`, `smoothed` (blend last price with 7d mean), or `conservative` (blend 7d and 30d means).
- **Fallbacks:** If profiling fails, stays on baseline; adjustments are wrapped in try/catch.

---

## Signal enricher

- **Service:** `backend/src/services/signalEnricher.ts`
- **Output:** `enrichedSignals` on `PricePrediction` — echoes profiler stats where helpful, pulls **cross-platform** and **retail event** hints from `featureVector.features` when present, and emits short **signal factor** tags (e.g. stale data, high spread).

---

## Trust engine

- **Service:** `backend/src/services/trustEngine.ts`
- **Input:** Profiler output, ensemble mode, enriched signals, **baseline_v1** snapshot via `modelHealthService.getModelHealth`, and baseline confidence.
- **Output:** `trustContext` — `trustScore` (0–100), `trustTier`, `trustFactors`, `cautionFlags`, `recommendedAction` (e.g. `use_prediction`, `collect_more_data`).

Deterministic scoring only—no online learning from feedback yet.

---

## Prediction outcomes

- **Writes:** `predictionOutcomeService.recordPrediction` inserts a **pending** `prediction_outcomes` row when predictions run.
- **Evaluation:** `predictionOutcomeEvaluationService` can fill actuals, MAPE, direction flags (`POST .../outcomes/:id/evaluate`, batch `evaluate-pending`).

These rows feed **model_performance** refresh jobs.

---

## Evaluation, rollups, drift, health

- **Evaluation summary:** `predictionEvaluationService.summarize` — exposed when **GET `/api/v1/predictions/:productId?includeEvaluation=1`**.
- **Rollups:** `modelPerformanceService` stores metrics per model/window; **POST `/api/v1/predictions/model-performance/refresh`** recomputes from evaluated outcomes.
- **Drift:** Snapshots carry drift flags/reasons derived from stored metrics (not live ML).
- **Health:** `modelHealthService` maps rollups to **healthy / warning / degraded**, severity, and recommended ops actions.

Canonical baseline model tag in rollups: **`baseline_v1`**.

---

## Feedback

- **Table:** `prediction_feedback` — links to `prediction_outcomes.id`.
- **API:** **POST `/api/v1/predictions/feedback`**, **GET `/api/v1/predictions/feedback/:outcomeId`**.
- **Service:** `backend/src/services/feedbackService.ts`

Feedback does **not** currently retrain models or mutate trust scores (by design).

---

## Caching & infrastructure

- Predictions are cached under Redis keys (see `predictionService`); profile/trust recomputation follows cache TTL behavior.
- **Fastify** hosts **Express** for Phase 1 compatibility (`server.ts`).

---

## What this is not (yet)

- A deployed **ARIMA / Prophet / LSTM** training pipeline as the default predictor.
- Automatic **retraining** from `prediction_feedback`.
- **TrustEngine** consuming feedback in real time (hook points exist for later work).

For API surface area, see [API_OVERVIEW.md](./API_OVERVIEW.md).
