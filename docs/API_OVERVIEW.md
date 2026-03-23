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

| Method | Path | Description |
|--------|------|-------------|
| POST | `/alerts` | Create alert (body: `userId`, `productId`, `type`, optional `targetPrice`). |
| GET | `/alerts/user/:userId` | List alerts for user. |
| GET | `/alerts/product/:productId` | Active alerts for a product. |
| DELETE | `/alerts/:alertId` | Delete alert (requires `userId` query per route). |
| PATCH | `/alerts/:alertId/toggle` | Toggle enabled state. |

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
