# VIPT Demo Flow

A **narrative walkthrough** of the backend using the **public API** (`/api/v1`). Replace host, IDs, and UUIDs with values from your environment after `db:seed` or real captures.

**Base URL:** `http://localhost:3000` (default; set `PORT` if different).

---

## 1. Detect a product

Register a listing and seed the catalog + first price line (validator runs inside `recordPrice`).

```http
POST /api/v1/products/detect
Content-Type: application/json

{
  "name": "Demo Headphones",
  "brand": "DemoBrand",
  "currentPrice": 299.00,
  "currency": "USD",
  "platform": "amazon",
  "url": "https://example.com/p/123"
}
```

**Save** `product.id` from the JSON response.

---

## 2. Store additional validated price (optional)

Either rely on more extension captures or push a manual point:

```http
POST /api/v1/prices/record
Content-Type: application/json

{
  "productId": "<PRODUCT_UUID>",
  "platform": "amazon",
  "price": 289.00,
  "shippingCost": 0,
  "inStock": true,
  "url": "https://example.com/p/123",
  "platformProductId": "SKU-1",
  "currency": "USD"
}
```

---

## 3. Get a prediction

```http
GET /api/v1/predictions/<PRODUCT_UUID>
```

Optional query params:

- `platform=amazon` — scope history to one marketplace.
- `includeEvaluation=1` — attach readiness / volatility summary.
- `debug=1` — include `featureVector` in the payload.

**Note** `predictionOutcomeId` at the top level when returned — you will need it for feedback.

---

## 4. Inspect the product profile

Deterministic stats only (no ML training):

```http
GET /api/v1/predictions/profile/<PRODUCT_UUID>?platform=amazon
```

Review `volatilityClass`, `isColdStart`, `profileConfidence`, etc.

---

## 5. Inspect trust context

Returned **inside** `data` for:

```http
GET /api/v1/predictions/<PRODUCT_UUID>
```

Look for:

- `enrichedSignals` — factor tags, freshness, optional event/spread hints.
- `trustContext` — `trustScore`, `trustTier`, `trustFactors`, `cautionFlags`, `recommendedAction`.

---

## 6. Submit feedback (requires a real outcome id)

After at least one successful prediction, use the **`predictionOutcomeId`** from step 3:

```http
POST /api/v1/predictions/feedback
Content-Type: application/json

{
  "predictionOutcomeId": "<OUTCOME_UUID>",
  "feedbackType": "correct",
  "confidenceRating": 0.85,
  "feedbackReason": "Matched next-day sale price"
}
```

`feedbackType` must be one of: `correct`, `incorrect`, `uncertain`.

List stored rows:

```http
GET /api/v1/predictions/feedback/<OUTCOME_UUID>
```

---

## 7. Evaluate outcomes (ops / backfill)

Single outcome:

```http
POST /api/v1/predictions/outcomes/<OUTCOME_UUID>/evaluate
Content-Type: application/json

{}
```

Batch pending skeletons:

```http
POST /api/v1/predictions/outcomes/evaluate-pending
Content-Type: application/json

{ "limit": 20 }
```

---

## 8. Inspect model health & performance

All models (rollups + drift flags):

```http
GET /api/v1/predictions/model-performance
```

Single model (baseline rollup tag is typically `baseline_v1`):

```http
GET /api/v1/predictions/model-performance/baseline_v1
```

Operational health:

```http
GET /api/v1/predictions/model-health
GET /api/v1/predictions/model-health/baseline_v1
GET /api/v1/predictions/model-health-summary
```

Refresh rollups after evaluations:

```http
POST /api/v1/predictions/model-performance/refresh
Content-Type: application/json

{ "modelName": "baseline_v1", "lookbackDays": 30 }
```

---

## Story arc for demos

1. **Show ingestion** → product exists, prices in DB.  
2. **Show prediction** → baseline + ensemble + signals + trust.  
3. **Show profile** → explain cold start vs mature series.  
4. **Show feedback** → human-in-the-loop without claiming retraining.  
5. **Show evaluation + health** → closed loop for ops credibility.

For endpoint details, see [API_OVERVIEW.md](./API_OVERVIEW.md).
