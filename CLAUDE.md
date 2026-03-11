# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Meridian is an open-source global situational awareness platform. It ingests 48+ live data feeds (conflicts, aviation, maritime, weather, cyber, finance, etc.), displays them on an interactive map, and supports real-time collaborative intelligence analysis via Plan Mode.

The actual application code lives in `meridian/` (the repo root contains `MERIDIAN_PLATFORM_OUTLINE.md` and this file).

## Architecture

Four independently containerized apps, orchestrated via `meridian/docker-compose.yml`:

| App | Stack | Port | Purpose |
|-----|-------|------|---------|
| `apps/api` | FastAPI + SQLAlchemy (async) + APScheduler | 8000 | REST API, WebSocket events, feed workers, alert engine |
| `apps/web` | React 18 + TypeScript + Vite + MapLibre GL | 5173 | SPA frontend with interactive map and panels |
| `apps/ai` | FastAPI + LiteLLM | 8001 | AI services (chat, daily brief, anomaly detection, risk scoring) |
| `apps/collab` | Node.js + Yjs + WebSocket | 1234 | CRDT server for Plan Mode real-time collaboration |

**Database:** PostgreSQL 16 with PostGIS (geospatial), TimescaleDB (time-series `geo_events` hypertable), pgcrypto, vector extensions.
**Cache/Pubsub:** Redis 7 — used for event broadcasting via pubsub (`meridian:events` channel) and caching.

### Data Flow

```
Feed Workers (48+ sources) → fetch() → GeoEvent list
  → INSERT geo_events table → Redis pubsub
  → ConnectionManager broadcasts to WebSocket clients
  → Frontend useSocket hook → useEventStore (Zustand, 5000 event cap)
```

Plan Mode collaboration uses Yjs CRDTs synced through the collab server on separate WebSocket connections.

### Key Patterns

- **Feed Workers:** All extend `FeedWorker` ABC in `apps/api/workers/base.py`. Implement `source_id`, `display_name`, `category`, `refresh_interval`, and `async fetch() -> list[GeoEvent]`. Reference: `workers/usgs_earthquakes.py`.
- **Frontend State:** Zustand stores in `apps/web/src/stores/` (events, alerts, plans, layout, replay, filters, plan tracking).
- **Frontend Path Alias:** `@/` maps to `apps/web/src/` (configured in `vite.config.ts`).
- **API Routes:** All under `/api/v1` prefix, 13 routers in `apps/api/routers/`.
- **Auth:** JWT (HS256) with refresh tokens, optional TOTP 2FA, optional Google OAuth.
- **ORM Models:** `apps/api/models/` — all imported in `alembic/env.py` for migration detection.
- **Config:** `apps/api/core/config.py` uses pydantic-settings, loads from `.env`.

## Common Commands

### Full Stack (Docker)

```bash
cd meridian
cp .env.example .env        # first time — set SECRET_KEY
docker compose up            # starts all 6 services (db, redis, api, ai, web, collab)
docker compose up --build    # rebuild after dependency changes
```

### API Development (Python)

```bash
cd meridian/apps/api

# Run tests (from api dir, needs PostgreSQL running)
pytest                              # all tests
pytest tests/test_events.py         # single file
pytest -m "not integration"         # skip integration tests (need live DB)
pytest tests/test_events.py::test_create_event -v  # single test

# Alembic migrations
alembic upgrade head                # apply all migrations
alembic revision --autogenerate -m "description"  # create new migration
alembic downgrade -1                # rollback one migration
```

Migrations run automatically on API startup (`alembic upgrade head` in Docker).

### Frontend Development

```bash
cd meridian/apps/web
npm install
npm run dev                  # dev server with hot reload
npm run build                # tsc + vite build
npm run lint                 # eslint src --ext .ts,.tsx
npm run test:e2e             # Playwright end-to-end tests (headless)
npm run test:e2e:headed      # Playwright with browser visible
npm run test:e2e:ui          # Playwright interactive UI mode
```

Vite dev server proxies `/api` → `localhost:8000`, `/ws` → `ws://localhost:8000`, `/ai` → `localhost:8001`.

## Database

Schema initialized from `meridian/infra/schema.sql`. Key tables:

- `geo_events` — TimescaleDB hypertable, auto-populates `geom` from lat/lng via trigger, indexed on (category, ingested_at), (source_id, ingested_at), (severity, ingested_at)
- `feed_status` — tracks worker health per source_id
- `plan_rooms`, `annotations`, `timeline_entries`, `tasks` — Plan Mode collaboration
- `alert_rules` — JSONB `rule_json` + `delivery_json` for alert definitions
- `watch_list_entities` — tracked entities across categories (vessel, aircraft, location, etc.)

ORM uses SQLAlchemy async with asyncpg driver. GeoAlchemy2 for PostGIS column types.

## Environment

All config via `.env` (see `meridian/.env.example`). Required: `SECRET_KEY`. LLM provider keys are optional (AI features degrade gracefully). Feed API keys are optional (keyless feeds still work).

Redis is exposed on host port **6380** (mapped to container 6379) to avoid conflicts with local Redis.
