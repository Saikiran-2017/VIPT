# VIPT backend — deployment

This document covers packaging and running the **backend** (`backend/`) in production or demo settings. It does not change product behavior; see `backend/.env.example` for variable names.

## Prerequisites

- **Node.js** (LTS recommended), matching the project’s `engines` if specified in `package.json`.
- **PostgreSQL** reachable from the host (managed DB on Railway, Render, Neon, etc.).
- **Redis** (optional but recommended): caching, BullMQ price jobs, and related workers. If Redis is unavailable at startup, the API still starts; cache and BullMQ-backed workers are degraded (see logs).

## Required environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** for most hosted Postgres | Full connection string. If unset, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` are used to build a URL. |
| `API_KEY` | **Yes** in production | Shared secret for all `/api/v1/*` routes. Clients send header `X-API-Key: <API_KEY>` (or `Authorization: Bearer <API_KEY>`). Omit only if `SKIP_AUTH=1` (non-production / emergencies). |
| `NODE_ENV` | Recommended | `production` for production. |
| `PORT` | Often set by host | Listen port (default `3000` in config). The server binds to `0.0.0.0`. |

## Optional but common

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Single URL for Redis (preferred on PaaS). If unset, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` are used. Use `rediss://` when the provider requires TLS. |
| `CORS_ORIGIN` | Allowed origin(s) for the browser; default `*` if unset. Set to your frontend or extension origin in production. |
| `LOG_LEVEL` | e.g. `info`, `warn`, `error` (see Winston usage in the app). |
| `SKIP_DB_MIGRATE` | Set to `1` or `true` to **not** run migrations on application boot. Use when migrations run in a separate release command. |
| `SKIP_AUTH` | Set to `1` or `true` to **disable** API key checks (local dev only). **Never** enable in production. |

Affiliate / scraper keys (`AMAZON_*`, `WALMART_*`, `EBAY_*`) are optional for bringing the server up; features that need them will fail or no-op without keys.

### Authenticated API requests

All routes under `/api/v1/*` require authentication unless `SKIP_AUTH` is set:

- Preferred: `X-API-Key: <your API_KEY>`
- Alternative: `Authorization: Bearer <your API_KEY>`

**Alerts** (`/api/v1/alerts/*`) additionally require **`X-User-Id: <uuid>`** — the per-install anonymous user id (Chrome extension) or your client’s stable user id. Ownership for create/list/delete/toggle is derived **only** from this header, not from JSON bodies or path parameters.

`GET /health` and `GET /ready` are **not** authenticated (suitable for orchestrator probes).

- **`GET /health`** — **Liveness**: cheap “process is up” check. Does **not** verify PostgreSQL or Redis. Use for Kubernetes/Docker **liveness** probes so a wedged process can be restarted without waiting on DB.
- **`GET /ready`** — **Readiness**: verifies **PostgreSQL** with a real query (`SELECT 1`). Returns **503** if the database is unavailable. **Redis** status is included in the JSON (optional dependency: the API can still be “ready” when Redis is not configured; if Redis was initialized but is unreachable, the response shows `redis.status: unavailable` while HTTP stays **200** when the DB is healthy). Use for **readiness** probes and traffic routing so traffic is not sent to a replica that cannot serve API requests.

Example:

```bash
curl -sS -H "X-API-Key: $API_KEY" "https://your-app.example.com/api/v1/products/search/headphones"
```

### Chrome extension (`extension/`)

Build with the same target API and secret as the backend (see `extension/.env.example`):

| Build-time (Vite) | Purpose |
|-------------------|---------|
| `VITE_API_BASE_URL` | Full URL prefix including `/api/v1`, e.g. `https://api.example.com/api/v1` |
| `VITE_API_KEY` | Same string as backend `API_KEY` |

```bash
cd extension
cp .env.example .env
# Edit .env, then:
npm run build
```

The build patches `dist/manifest.json` so `host_permissions` includes your API origin (required for MV3 `fetch`).

## Build and run

From the `backend/` directory:

```bash
npm ci
npm run build
npm start
```

- **Start command**: `npm start` runs the compiled server (`dist/backend/src/server.js`).
- **Migrations**: By default, migrations run once at startup when the database is reachable. Alternatively run manually: `npm run db:migrate`. If your platform runs `db:migrate` in a release phase, set `SKIP_DB_MIGRATE=1` on the web process to avoid double-running.

## Liveness and readiness

The process exposes two JSON endpoints (no `/api/v1` prefix, no API key):

| Endpoint | Role | HTTP when OK | Use on platforms for |
|----------|------|--------------|----------------------|
| `GET /health` | Liveness | **200** | Process up; restart detection (liveness probe) |
| `GET /ready` | Readiness | **200** if DB OK, **503** if DB down | Traffic gating (readiness probe) |

**Liveness** (`/health`): `data.probe` is `liveness`; `data.status` is `healthy`. Fast and does not touch the database.

**Readiness** (`/ready`): `data.probe` is `readiness`; `data.status` is `ready` or (on failure) `not_ready`. `data.checks.database` reflects PostgreSQL; `data.checks.redis` reports `connected`, `not_configured`, or `unavailable`.

Examples (replace host and port):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://your-app.example.com/health
curl -sS https://your-app.example.com/health

curl -sS -o /dev/null -w "%{http_code}\n" https://your-app.example.com/ready
curl -sS https://your-app.example.com/ready
```

Configure **liveness** to hit `/health` and **readiness** to hit `/ready` (e.g. Kubernetes `livenessProbe` vs `readinessProbe`, or your PaaS “health” vs “pre-deploy” checks). If the platform only supports one URL, prefer `/ready` for “can this instance take traffic?” and keep `/health` for restart-only probes when both are available.

## Local production-style run

1. Start PostgreSQL and Redis locally (or use cloud URLs).
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`, `NODE_ENV=production`, and `REDIS_URL` (or host/port/password).
3. Run `npm run build && npm start` from `backend/`.
4. Verify with `curl http://localhost:3000/health` (adjust `PORT` if needed).

## Railway / Render / similar Node hosts

General pattern:

1. **Root directory**: set to `backend` if the repo is monorepo-style (or run commands from `backend` in the build/start settings).
2. **Build command**: `npm ci && npm run build` (or `npm install && npm run build`).
3. **Start command**: `npm start`.
4. **Environment**: add `DATABASE_URL` from the platform’s Postgres addon; add `REDIS_URL` from the Redis addon. Set `NODE_ENV=production` and `PORT` if the platform does not inject it.
5. **Health checks**: use `/health` for liveness and `/ready` for readiness (see [Liveness and readiness](#liveness-and-readiness)).
6. **Migrations**: either rely on startup migrations, or add a release phase: `cd backend && npm run db:migrate` and set `SKIP_DB_MIGRATE=1` on the web service.

SSL to Postgres is usually encoded in `DATABASE_URL` (e.g. `?sslmode=require`). Match your provider’s docs.

## Troubleshooting

- **DB connection errors**: Confirm `DATABASE_URL`, firewall rules, and SSL parameters.
- **Redis warnings**: Server can start without Redis; enable Redis for full caching and BullMQ behavior.
- **Migrations failing on boot**: Fix schema/permissions, or run `db:migrate` manually once, then restart.
