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
| `NODE_ENV` | Recommended | `production` for production. |
| `PORT` | Often set by host | Listen port (default `3000` in config). The server binds to `0.0.0.0`. |

## Optional but common

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Single URL for Redis (preferred on PaaS). If unset, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` are used. Use `rediss://` when the provider requires TLS. |
| `CORS_ORIGIN` | Allowed origin(s) for the browser; default `*` if unset. Set to your frontend or extension origin in production. |
| `LOG_LEVEL` | e.g. `info`, `warn`, `error` (see Winston usage in the app). |
| `SKIP_DB_MIGRATE` | Set to `1` or `true` to **not** run migrations on application boot. Use when migrations run in a separate release command. |

Affiliate / scraper keys (`AMAZON_*`, `WALMART_*`, `EBAY_*`) are optional for bringing the server up; features that need them will fail or no-op without keys.

## Build and run

From the `backend/` directory:

```bash
npm ci
npm run build
npm start
```

- **Start command**: `npm start` runs the compiled server (`dist/backend/src/server.js`).
- **Migrations**: By default, migrations run once at startup when the database is reachable. Alternatively run manually: `npm run db:migrate`. If your platform runs `db:migrate` in a release phase, set `SKIP_DB_MIGRATE=1` on the web process to avoid double-running.

## Health check

The process exposes a JSON health endpoint:

- **URL**: `GET /health` (no `/api/v1` prefix)
- **Expected**: HTTP **200** and a JSON body including `success: true` and `data.status` of `healthy`.

Example (replace host and port):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://your-app.example.com/health
curl -sS https://your-app.example.com/health
```

Use this path for Railway / Render / Fly.io health checks.

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
5. **Health check path**: `/health`.
6. **Migrations**: either rely on startup migrations, or add a release phase: `cd backend && npm run db:migrate` and set `SKIP_DB_MIGRATE=1` on the web service.

SSL to Postgres is usually encoded in `DATABASE_URL` (e.g. `?sslmode=require`). Match your provider’s docs.

## Troubleshooting

- **DB connection errors**: Confirm `DATABASE_URL`, firewall rules, and SSL parameters.
- **Redis warnings**: Server can start without Redis; enable Redis for full caching and BullMQ behavior.
- **Migrations failing on boot**: Fix schema/permissions, or run `db:migrate` manually once, then restart.
