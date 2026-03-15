-- Meridian Database Schema
-- PostgreSQL 16 + PostGIS + TimescaleDB
-- Run order: extensions → enums → tables → indexes → hypertables

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE feed_category AS ENUM (
  'environment', 'military', 'aviation', 'maritime',
  'cyber', 'finance', 'geopolitical', 'humanitarian',
  'nuclear', 'space', 'social', 'energy'
);

CREATE TYPE severity_level AS ENUM ('info', 'low', 'medium', 'high', 'critical');

CREATE TYPE workspace_role AS ENUM ('admin', 'analyst', 'contributor', 'observer');

CREATE TYPE plan_room_role AS ENUM ('owner', 'analyst', 'contributor', 'observer', 'briefer');

CREATE TYPE annotation_type AS ENUM (
  'point', 'region', 'route', 'range_circle', 'arrow', 'text', 'freehand'
);

CREATE TYPE task_status AS ENUM ('to_monitor', 'assigned', 'active_watch', 'escalated', 'completed');

CREATE TYPE watch_entity_type AS ENUM (
  'vessel', 'aircraft', 'location', 'country', 'keyword', 'cyber_asset', 'weather_system', 'satellite'
);

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  avatar_color  TEXT DEFAULT '#00e676',
  totp_secret   TEXT,
  totp_enabled  BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Organizations & Workspaces ───────────────────────────────────────────────
CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tier       TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         workspace_role NOT NULL DEFAULT 'analyst',
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ─── Saved Layouts ────────────────────────────────────────────────────────────
CREATE TABLE saved_layouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_shared    BOOLEAN DEFAULT FALSE,
  layout_json  JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── GeoEvents (TimescaleDB hypertable) ──────────────────────────────────────
CREATE TABLE geo_events (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  source_id   TEXT NOT NULL,
  category    feed_category NOT NULL,
  subcategory TEXT,
  title       TEXT NOT NULL,
  body        TEXT,
  severity    severity_level NOT NULL DEFAULT 'info',
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  geom        GEOMETRY(Point, 4326),
  metadata    JSONB NOT NULL DEFAULT '{}',
  url         TEXT,
  event_time  TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, ingested_at)
);

SELECT create_hypertable('geo_events', 'ingested_at', if_not_exists => TRUE);

-- Compress chunks older than 7 days (90%+ space savings on time-series data)
ALTER TABLE geo_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'source_id',
  timescaledb.compress_orderby = 'ingested_at DESC'
);
SELECT add_compression_policy('geo_events', INTERVAL '7 days', if_not_exists => TRUE);

-- Retain data for 10 years, then auto-drop
SELECT add_retention_policy('geo_events', INTERVAL '10 years', if_not_exists => TRUE);

CREATE INDEX ON geo_events USING GIST (geom);
CREATE INDEX ON geo_events (category, ingested_at DESC);
CREATE INDEX ON geo_events (source_id, ingested_at DESC);
CREATE INDEX ON geo_events (severity, ingested_at DESC);

-- Auto-populate geometry from lat/lng
CREATE OR REPLACE FUNCTION set_geo_event_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_geo_events_geom
BEFORE INSERT OR UPDATE OF lat, lng ON geo_events
FOR EACH ROW EXECUTE FUNCTION set_geo_event_geom();

-- ─── Feed Health Tracking ─────────────────────────────────────────────────────
CREATE TABLE feed_status (
  source_id      TEXT PRIMARY KEY,
  category       feed_category NOT NULL,
  display_name   TEXT NOT NULL,
  last_fetched   TIMESTAMPTZ,
  last_success   TIMESTAMPTZ,
  last_error     TEXT,
  is_healthy     BOOLEAN DEFAULT TRUE,
  event_count_24h INTEGER DEFAULT 0,
  refresh_interval_seconds INTEGER NOT NULL DEFAULT 300,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Alert Rules ─────────────────────────────────────────────────────────────
CREATE TABLE alert_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  rule_json     JSONB NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  delivery_json JSONB NOT NULL DEFAULT '{}',
  last_fired    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Alert Notifications ─────────────────────────────────────────────────────
CREATE TABLE alert_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id         UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  severity        severity_level NOT NULL DEFAULT 'medium',
  source_event_id TEXT,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON alert_notifications (user_id, is_read, created_at DESC);

-- ─── Plan Rooms ───────────────────────────────────────────────────────────────
CREATE TABLE plan_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  aoi_geom      GEOMETRY(Polygon, 4326),
  aoi_countries TEXT[],
  created_by    UUID NOT NULL REFERENCES users(id),
  is_archived   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE plan_room_members (
  plan_room_id UUID NOT NULL REFERENCES plan_rooms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         plan_room_role NOT NULL DEFAULT 'analyst',
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (plan_room_id, user_id)
);

-- ─── Annotations ─────────────────────────────────────────────────────────────
CREATE TABLE annotations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_room_id UUID NOT NULL REFERENCES plan_rooms(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES users(id),
  type         annotation_type NOT NULL,
  label        TEXT,
  notes        TEXT,
  color        TEXT DEFAULT '#00e676',
  geom         GEOMETRY(Geometry, 4326),
  geom_json    JSONB,
  is_locked    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON annotations USING GIST (geom);
CREATE INDEX ON annotations (plan_room_id);

-- ─── Timeline Entries ─────────────────────────────────────────────────────────
CREATE TABLE timeline_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_room_id UUID NOT NULL REFERENCES plan_rooms(id) ON DELETE CASCADE,
  geo_event_id UUID,
  created_by   UUID REFERENCES users(id),
  is_auto      BOOLEAN DEFAULT FALSE,
  title        TEXT NOT NULL,
  body         TEXT,
  source_label TEXT,
  entry_time   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON timeline_entries (plan_room_id, entry_time DESC);

-- ─── Tasks ────────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_room_id    UUID NOT NULL REFERENCES plan_rooms(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES users(id),
  assigned_to     UUID REFERENCES users(id),
  title           TEXT NOT NULL,
  notes           TEXT,
  status          task_status NOT NULL DEFAULT 'to_monitor',
  priority        TEXT NOT NULL DEFAULT 'medium',
  linked_event_id UUID,
  review_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Watch List ───────────────────────────────────────────────────────────────
CREATE TABLE watch_list_entities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_room_id    UUID NOT NULL REFERENCES plan_rooms(id) ON DELETE CASCADE,
  added_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type     watch_entity_type NOT NULL,
  label           TEXT NOT NULL,
  identifier      TEXT NOT NULL,
  radius_meters   DOUBLE PRECISION,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  geom            GEOMETRY(Point, 4326),
  metadata        JSONB NOT NULL DEFAULT '{}',
  last_event_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Intel Notes ─────────────────────────────────────────────────────────────
CREATE TABLE intel_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_room_id     UUID NOT NULL REFERENCES plan_rooms(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  body             TEXT,
  classification   TEXT NOT NULL DEFAULT 'unclassified',
  tags             JSONB NOT NULL DEFAULT '[]',
  is_pinned        BOOLEAN DEFAULT FALSE,
  linked_event_id  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Refresh updated_at ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated          BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_saved_layouts_updated  BEFORE UPDATE ON saved_layouts  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_plan_rooms_updated     BEFORE UPDATE ON plan_rooms     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_annotations_updated    BEFORE UPDATE ON annotations    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_tasks_updated          BEFORE UPDATE ON tasks          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_intel_notes_updated    BEFORE UPDATE ON intel_notes    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
