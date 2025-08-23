# API Overview

All routes below use prefix **`/api/v1`**. Responses are typically JSON with `success`, `data` (or typed payload), and `timestamp` unless noted.

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Process health metadata (not under `/api/v1`). |

---

## Products (`/products`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/products/detect` | Resolve/create product + record first price when `currentPrice > 0`. Body: name, platform, url, currentPrice, currency, optional brand/model/sku/imageUrl/confidence. |
| GET | `/products/search/:term` | Search products by term. |
| GET | `/products/:id` | Fetch product by UUID. |

---

## Prices (`/prices`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/prices/features/:productId` | Feature vector from stored history (≥2 points); 404 if insufficient. |
| GET | `/prices/compare/:productId` | Cross-platform comparison object. |
| GET | `/prices/history/:productId` | History + stats; query: `platform`, `days` (default 90). |
| POST | `/prices/record` | Manual price observation (productId, platform, price, etc.). |
| GET | `/prices/cross-platform/:productId` | Cross-platform price intelligence payload. |

---

## Predictions (`/predictions`)

Core prediction (baseline + Phase 2 layers):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/predictions/:productId` | Price prediction. Query: `platform`, `debug=1` (include featureVector), `includeEvaluation=1` (readiness summary). Response may include top-level `predictionOutcomeId`, `evaluation`, `freshness`. |

Model ops & outcomes:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/predictions/model-performance` | All stored model performance snapshots. |
| GET | `/predictions/model-performance/:modelName` | Single model snapshot (e.g. `baseline_v1`). |
| POST | `/predictions/model-performance/refresh` | Recompute rollups. Body: optional `lookbackDays`, `limit`, `modelName`. |
| GET | `/predictions/model-health-summary` | Aggregate health counts. |
| GET | `/predictions/model-health` | Health for all models. |
| GET | `/predictions/model-health/:modelName` | Single model health. |
| POST | `/predictions/outcomes/evaluate-pending` | Batch-evaluate pending outcomes. Body: optional `limit`, `olderThanHours`, `accurateMapeThreshold`. |
| POST | `/predictions/outcomes/:outcomeId/evaluate` | Evaluate one outcome. Body: optional `accurateMapeThreshold`. |

Phase 2 profile & feedback:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/predictions/profile/:productId` | `ProductProfile` JSON. Query: optional `platform`. |
| POST | `/predictions/feedback` | Submit feedback. Body: `predictionOutcomeId` (or `outcomeId`), `feedbackType` ∈ `correct`|`incorrect`|`uncertain`, optional `confidenceRating`, `feedbackReason`. |
| GET | `/predictions/feedback/:outcomeId` | List feedback rows for an outcome. |

---

## Events (`/events`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events/upcoming` | Query: `days` (default 90). |
| GET | `/events/active` | Currently active sale events. |
| GET | `/events/platform/:platform` | Query: `days`. |
| GET | `/events/sale-likelihood` | Query: `days` (default 30). |

---

## Alerts (`/alerts`)

All alert routes require **`X-User-Id: <uuid>`** (the extension’s anonymous install id). The API key proves the client is allowed to call the backend; **`X-User-Id` is the only source of ownership** — do not send `userId` in the JSON body (rejected). List/delete/toggle are scoped to that header identity.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/alerts` | Create alert. Body: `productId`, `type`, optional `targetPrice`. Header: `X-User-Id`. |
| GET | `/alerts/me` | List alerts for the authenticated user. Header: `X-User-Id`. |
| GET | `/alerts/product/:productId` | Active alerts for that product **for this user only**. Header: `X-User-Id`. |
| DELETE | `/alerts/:alertId` | Delete owned alert. Header: `X-User-Id`. |
| PATCH | `/alerts/:alertId/toggle` | Toggle owned alert. Header: `X-User-Id`. |

---

## Recommendations (`/recommendation`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recommendation/anti-manipulation/:productId` | Discount manipulation analysis. Query: optional `platform`. |
| GET | `/recommendation/:productId` | Buy/wait/track style recommendation. Query: optional `platform`. |

---

## Concise examples

**Prediction**

```http
GET /api/v1/predictions/550e8400-e29b-41d4-a716-446655440000?includeEvaluation=1
```

**Profile**

```http
GET /api/v1/predictions/profile/550e8400-e29b-41d4-a716-446655440000?platform=amazon
```

**Feedback**

```http
POST /api/v1/predictions/feedback
Content-Type: application/json

{
  "predictionOutcomeId": "uuid-of-outcome",
  "feedbackType": "uncertain",
  "confidenceRating": 0.5
}
```

**Model health**

```http
GET /api/v1/predictions/model-health/baseline_v1
```

For architecture context, see [ARCHITECTURE.md](./ARCHITECTURE.md). For a scripted tour, see [DEMO_FLOW.md](./DEMO_FLOW.md).

// Updated: 2025-03-03 - Implement data export feature

// Updated: 2025-03-08 - Fix input validation bug

// Updated: 2025-03-09 - Improve test documentation

// Updated: 2025-03-11 - Improve database transaction handling

// Updated: 2025-03-11 - Improve database transaction handling

// Updated: 2025-03-15 - Add FAQ section

// Updated: 2025-03-15 - Add architecture diagrams

// Updated: 2025-03-15 - Add integration test suite

// Updated: 2025-03-16 - Fix race condition in cache

// Updated: 2025-03-20 - Fix typo in validation logic

// Updated: 2025-03-20 - Add setup instructions

// Updated: 2025-03-20 - Document database schema

// Updated: 2025-03-21 - Create user preference system

// Updated: 2025-03-21 - Fix decimal precision issue

// Updated: 2025-03-27 - Write quick start guide

// Updated: 2025-03-27 - Add health check endpoint

// Updated: 2025-03-29 - Add unit tests for service layer

// Updated: 2025-03-31 - Implement recommendation engine

// Updated: 2025-04-02 - Build analytics dashboard

// Updated: 2025-04-02 - Update changelog

// Updated: 2025-04-03 - Fix null pointer exception

// Updated: 2025-04-03 - Implement retry logic for failed requests

// Updated: 2025-04-16 - Implement data export feature

// Updated: 2025-04-16 - Add architecture diagrams

// Updated: 2025-04-19 - Add performance benchmarks

// Updated: 2025-04-19 - Fix undefined variable error

// Updated: 2025-04-26 - Add caching mechanism for price queries

// Updated: 2025-04-27 - Fix decimal precision issue

// Updated: 2025-05-02 - Fix CSS alignment issue

// Updated: 2025-05-02 - Document database schema

// Updated: 2025-05-03 - Fix sorting order

// Updated: 2025-05-05 - Add timeout configuration

// Updated: 2025-05-06 - Fix input validation bug

// Updated: 2025-05-07 - Update dependencies

// Updated: 2025-05-08 - Fix race condition in cache

// Updated: 2025-05-08 - Add FAQ section

// Updated: 2025-05-08 - Add setup instructions

// Updated: 2025-05-09 - Add regression tests

// Updated: 2025-05-13 - Fix null pointer exception

// Updated: 2025-05-14 - Clean up test fixtures

// Updated: 2025-05-15 - Add performance benchmarks

// Updated: 2025-05-16 - Create reporting module

// Updated: 2025-05-17 - Add snapshot tests

// Updated: 2025-05-19 - Improve test documentation

// Updated: 2025-05-19 - Fix duplicate records bug

// Updated: 2025-05-19 - Write quick start guide

// Updated: 2025-05-21 - Add architecture diagrams

// Updated: 2025-05-22 - Fix undefined variable error

// Updated: 2025-05-23 - Update changelog

// Updated: 2025-05-24 - Fix memory leak in event handler

// Updated: 2025-05-25 - Fix duplicate records bug

// Updated: 2025-05-26 - Add contributing guidelines

// Updated: 2025-06-01 - Clean up test fixtures

// Updated: 2025-06-02 - Add regression tests

// Updated: 2025-06-02 - Update error handling in payment processor

// Updated: 2025-06-04 - Fix sorting order

// Updated: 2025-06-06 - Fix failing integration tests

// Updated: 2025-06-13 - Improve test documentation

// Updated: 2025-06-14 - Fix failing integration tests

// Updated: 2025-06-15 - Add architecture diagrams

// Updated: 2025-06-19 - Implement data export feature

// Updated: 2025-06-26 - Build analytics dashboard

// Updated: 2025-06-29 - Add timeout configuration

// Updated: 2025-06-29 - Write troubleshooting guide

// Updated: 2025-07-02 - Refactor database connection pooling

// Updated: 2025-07-02 - Build trend analysis dashboard

// Updated: 2025-07-02 - Add batch processing system

// Updated: 2025-07-03 - Add architecture diagrams

// Updated: 2025-07-03 - Write quick start guide

// Updated: 2025-07-05 - Refactor database connection pooling

// Updated: 2025-07-05 - Update changelog

// Updated: 2025-07-06 - Clean up test fixtures

// Updated: 2025-07-07 - Fix failing integration tests

// Updated: 2025-07-07 - Update changelog

// Updated: 2025-07-09 - Fix flaky tests

// Updated: 2025-07-10 - Optimize SQL queries for performance

// Updated: 2025-07-11 - Improve test coverage to 85%

// Updated: 2025-07-12 - Fix concurrent access issue

// Updated: 2025-07-12 - Clean up test fixtures

// Updated: 2025-07-15 - Add alert management system

// Updated: 2025-07-16 - Refactor service layer

// Updated: 2025-07-18 - Build analytics dashboard

// Updated: 2025-07-18 - Fix failing integration tests

// Updated: 2025-07-21 - Update changelog

// Updated: 2025-07-21 - Add architecture diagrams

// Updated: 2025-07-25 - Add integration test suite

// Updated: 2025-07-28 - Write quick start guide

// Updated: 2025-08-06 - Fix input validation bug

// Updated: 2025-08-07 - Fix filter logic

// Updated: 2025-08-08 - Improve test coverage to 85%

// Updated: 2025-08-11 - Add integration test suite

// Updated: 2025-08-15 - Create admin panel interface

// Updated: 2025-08-19 - Add real-time notifications feature

// Updated: 2025-08-19 - Create product search functionality

// Updated: 2025-08-19 - Add user authentication layer

// Updated: 2025-08-21 - Fix memory leak in event handler

// Updated: 2025-08-21 - Update changelog

// Updated: 2025-08-23 - Improve test coverage to 85%

// Updated: 2025-08-24 - Write quick start guide
