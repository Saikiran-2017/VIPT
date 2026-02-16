# VIPT - Vayu Intelligence Price Tracker

**Universal Price Intelligence Platform**

A cross-platform shopping intelligence system that detects products automatically, compares prices across major marketplaces, tracks historical pricing trends, predicts future price movements using AI, detects fake discounts, and recommends Buy Now or Wait decisions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chrome Extension (React UI)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Product   │ │  Price   │ │   AI     │ │   Alerts &       │  │
│  │ Detection │ │ Compare  │ │ Predict  │ │   Recommendations│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────────┐
│                     API Gateway (Express.js)                    │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐ ┌───────────┐  │
│  │  Product   │ │   Price    │ │  Prediction │ │   Event   │  │
│  │  Identity  │ │ Aggregation│ │   Service   │ │  Service  │  │
│  │  Service   │ │  Service   │ │  (AI/ML)    │ │           │  │
│  └────────────┘ └────────────┘ └─────────────┘ └───────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐               │
│  │   Alert    │ │ Anti-Manip │ │ Recommend   │               │
│  │  Service   │ │ Detection  │ │   Engine    │               │
│  └────────────┘ └────────────┘ └─────────────┘               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  ┌──────────┐     ┌──────────┐      ┌──────────┐
  │PostgreSQL│     │  Redis   │      │  Object  │
  │  (Data)  │     │ (Cache)  │      │ Storage  │
  └──────────┘     └──────────┘      └──────────┘
```

---

## Features

### Core Capabilities

| Feature | Description | Status |
|---------|-------------|--------|
| **Product Detection** | Auto-detects products on Amazon, Flipkart, Walmart, eBay, Best Buy | ✅ MVP |
| **Product Identity Engine** | Normalizes products across platforms using model numbers, fuzzy matching | ✅ MVP |
| **Cross-Platform Price Comparison** | Compares prices, shipping, discounts across marketplaces | ✅ MVP |
| **Price History Tracking** | 90-day history with interactive charts, all-time stats | ✅ MVP |
| **Price Volatility Index** | Stable / Moderate / Highly Volatile classification | ✅ MVP |
| **AI Price Prediction** | ARIMA + seasonal decomposition ensemble model | ✅ MVP |
| **Event Intelligence** | Black Friday, Prime Day, seasonal sale calendar integration | ✅ MVP |
| **Anti-Manipulation Detection** | Detects fake discounts, price spikes before sales | ✅ MVP |
| **Smart Recommendations** | Buy Now / Wait / Track with confidence scores | ✅ MVP |
| **Price Alerts** | Target price, sudden drop, prediction-based, event-based | ✅ MVP |
| **Data Transparency** | Timestamps, freshness indicators, confidence scores | ✅ MVP |

### Supported Platforms

- Amazon (US, IN, UK, DE, FR, ES, IT, CA, AU)
- Flipkart
- Walmart
- eBay
- Best Buy
- Target
- Newegg
- AliExpress

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension UI | React 18 + TypeScript + Tailwind CSS + Recharts |
| Background | Chrome Extension Manifest V3 Service Worker |
| Content Script | TypeScript DOM extractors per platform |
| Backend API | Node.js + Express.js + TypeScript |
| Database | PostgreSQL 16 with pg_trgm extension |
| Caching | Redis 7 |
| AI/ML | Custom ARIMA + Seasonal Decomposition (TypeScript) |
| Validation | Zod schema validation |
| Logging | Winston |
| Containerization | Docker + Docker Compose |

---

## Project Structure

```
vayu-ai-price-tracker/
├── backend/                    # Backend API Server
│   ├── src/
│   │   ├── config/             # App configuration
│   │   ├── middleware/         # Express middleware
│   │   ├── models/             # Database, cache, migrations
│   │   ├── routes/             # API route handlers
│   │   ├── services/           # Business logic services
│   │   │   ├── productIdentityService.ts
│   │   │   ├── priceAggregationService.ts
│   │   │   ├── predictionService.ts
│   │   │   ├── eventService.ts
│   │   │   ├── alertService.ts
│   │   │   ├── antiManipulationService.ts
│   │   │   └── recommendationService.ts
│   │   ├── utils/              # Logging utilities
│   │   ├── workers/            # Background workers
│   │   └── server.ts           # Entry point
│   ├── Dockerfile
│   └── package.json
├── extension/                  # Chrome Extension
│   ├── public/
│   │   └── manifest.json       # Chrome Manifest V3
│   ├── src/
│   │   ├── background/         # Service worker
│   │   ├── content/            # Content scripts (product detection)
│   │   ├── popup/              # React popup app
│   │   └── components/         # React UI components
│   ├── vite.config.ts
│   └── package.json
├── shared/                     # Shared types & constants
│   ├── types/                  # TypeScript interfaces
│   └── constants/              # Platform configs, events calendar
├── docker-compose.yml          # PostgreSQL + Redis + Backend
├── package.json                # Monorepo root
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Chrome Browser

### 1. Clone & Install

```bash
git clone https://github.com/your-org/vayu-ai-price-tracker.git
cd vayu-ai-price-tracker
npm install
cd backend && npm install
cd ../extension && npm install
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis
```

### 3. Configure Environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your settings
```

### 4. Start Backend

```bash
cd backend
npm run db:migrate    # Run database migrations
npm run db:seed       # Seed demo data
npm run dev           # Start dev server on :3000
```

### 5. Build Extension

```bash
cd extension
npm run build
```

### 6. Load Extension in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist` folder
5. Navigate to any Amazon/Flipkart/Walmart product page

---

## API Endpoints

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/products/detect` | Detect and resolve a product |
| GET | `/api/v1/products/:id` | Get product by ID |
| GET | `/api/v1/products/search/:term` | Search products |

### Prices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/prices/compare/:productId` | Cross-platform comparison |
| GET | `/api/v1/prices/history/:productId` | Price history with stats |
| POST | `/api/v1/prices/record` | Record a price observation |

### Predictions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/predictions/:productId` | AI price prediction |

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/events/upcoming` | Upcoming retail events |
| GET | `/api/v1/events/active` | Currently active sales |
| GET | `/api/v1/events/platform/:platform` | Platform-specific events |
| GET | `/api/v1/events/sale-likelihood` | Sale probability analysis |

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/alerts` | Create price alert |
| GET | `/api/v1/alerts/user/:userId` | Get user's alerts |
| DELETE | `/api/v1/alerts/:alertId` | Delete an alert |
| PATCH | `/api/v1/alerts/:alertId/toggle` | Toggle alert status |

### Recommendations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/recommendation/:productId` | Smart buy/wait/track |
| GET | `/api/v1/recommendation/anti-manipulation/:productId` | Discount analysis |

---

## AI Prediction Engine

### Models (Phase 1)

1. **ARIMA-style** - AutoRegressive model with moving averages
   - AR(1) coefficient estimation
   - 7-day and 30-day moving averages
   - Trend detection (up/down/flat)

2. **Seasonal Decomposition** (Prophet-inspired)
   - Weekly seasonality detection
   - Monthly pattern analysis
   - Trend component via linear regression

3. **Event Intelligence Layer**
   - Known retail event calendar (Black Friday, Prime Day, etc.)
   - Proximity-based discount prediction
   - Dynamic event adjustment

4. **Ensemble** - Weighted combination
   - ARIMA: 50% weight
   - Seasonal: 30% weight
   - Event: 20% weight

### Outputs

- Expected price range (low/high)
- Drop probability (0-100%)
- Suggested waiting period (days)
- Confidence score (0-100%)
- Contributing factors with descriptions

---

## Anti-Manipulation Detection

Detects fake discount patterns:

| Check | Description |
|-------|-------------|
| Price Spike Before Sale | Detects prices raised >20% before "discounts" |
| Artificial Discount | Current price ≈ 30-day average despite showing discount |
| Frequent Price Changes | >4 significant changes per week |
| Never Sold at MRP | Reference price appeared <5% of the time |

---

## Monetization

| Tier | Features |
|------|----------|
| **Free** | Basic comparison, 30-day history, limited tracking |
| **Premium** | Advanced predictions, unlimited tracking, priority alerts, category analytics |

Revenue streams: Affiliate commissions, Premium subscriptions, B2B data insights (future).

---

## Roadmap

- [x] Phase 1: Chrome Extension (MVP)
- [ ] Phase 2: Web Dashboard
- [ ] Phase 3: Android & iOS Apps
- [ ] Geo-pricing intelligence
- [ ] B2B analytics API
- [ ] LSTM deep learning models
- [ ] Merchant pricing tools

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

**Built with ❤️ by VIPT Team**
