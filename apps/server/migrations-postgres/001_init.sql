-- PostgreSQL schema. Mirrors migrations/001_init.sql (SQLite) with these translations:
--   TEXT timestamps -> timestamptz            (so julianday/EXTRACT EPOCH and >= comparisons work)
--   REAL            -> double precision
--   0/1 flag ints   -> boolean                (compared as TRUE/FALSE at every call site)
--   COLLATE NOCASE  -> citext                 (case-insensitive email uniqueness)
--   INSERT OR IGNORE-> ON CONFLICT DO NOTHING
--   rowid tie-break -> complaint_events.seq   (stable ordering for the complaint timeline)

-- Installed into public so it stays available whatever search_path the app uses.
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

CREATE TABLE users (
  user_id        TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          CITEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('user','it_staff','manager','admin')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE locations (
  location_id    TEXT PRIMARY KEY,
  location_name  TEXT NOT NULL UNIQUE,
  building       TEXT NOT NULL,
  floor          INTEGER,
  description    TEXT NOT NULL DEFAULT '',
  current_status TEXT NOT NULL DEFAULT 'unknown'
                 CHECK (current_status IN ('excellent','good','fair','poor','critical','unknown')),
  current_score  double precision,
  current_stale  boolean NOT NULL DEFAULT false,
  map_x          double precision NOT NULL DEFAULT 50 CHECK (map_x BETWEEN 0 AND 100),
  map_y          double precision NOT NULL DEFAULT 50 CHECK (map_y BETWEEN 0 AND 100),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE speed_tests (
  test_id            TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(user_id),
  location_id        TEXT NOT NULL REFERENCES locations(location_id),
  download_speed     double precision NOT NULL CHECK (download_speed >= 0),
  upload_speed       double precision NOT NULL CHECK (upload_speed >= 0),
  ping               double precision NOT NULL CHECK (ping > 0),
  jitter             double precision NOT NULL DEFAULT 0,
  packet_loss        double precision NOT NULL DEFAULT 0 CHECK (packet_loss BETWEEN 0 AND 100),
  base_score         double precision NOT NULL,
  health_score       double precision NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  health_status      TEXT NOT NULL CHECK (health_status IN ('excellent','good','fair','poor','critical')),
  during_maintenance boolean NOT NULL DEFAULT false,
  is_seed            boolean NOT NULL DEFAULT false,
  client_meta        TEXT NOT NULL DEFAULT '{}',
  tested_at          timestamptz NOT NULL
);
CREATE INDEX idx_tests_loc_time  ON speed_tests(location_id, tested_at DESC);
CREATE INDEX idx_tests_user_time ON speed_tests(user_id, tested_at DESC);
CREATE INDEX idx_tests_time      ON speed_tests(tested_at);

CREATE TABLE test_failures (
  failure_id  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(user_id),
  location_id TEXT NOT NULL REFERENCES locations(location_id),
  reason      TEXT NOT NULL CHECK (reason IN ('unreachable','download_failed','upload_failed','timeout','other')),
  detail      TEXT NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL
);
CREATE INDEX idx_fail_loc_time ON test_failures(location_id, occurred_at DESC);

CREATE TABLE complaints (
  complaint_id    TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(user_id),
  location_id     TEXT NOT NULL REFERENCES locations(location_id),
  complaint_type  TEXT NOT NULL CHECK (complaint_type IN
    ('no_internet','slow_internet','high_ping','frequent_disconnection','weak_signal','website_service_unavailable','other')),
  description     TEXT NOT NULL CHECK (length(description) BETWEEN 5 AND 1000),
  related_test_id TEXT REFERENCES speed_tests(test_id),
  status          TEXT NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted','reviewed','assigned','in_progress','resolved')),
  assigned_staff  TEXT REFERENCES users(user_id),
  ai_category     TEXT,
  ai_confidence   double precision,
  is_seed         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL,
  resolved_at     timestamptz
);
CREATE INDEX idx_compl_loc_time ON complaints(location_id, created_at DESC);
CREATE INDEX idx_compl_status   ON complaints(status);
CREATE INDEX idx_compl_user     ON complaints(user_id, created_at DESC);

CREATE TABLE complaint_events (
  event_id     TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL REFERENCES complaints(complaint_id) ON DELETE CASCADE,
  actor_id     TEXT NOT NULL REFERENCES users(user_id),
  kind         TEXT NOT NULL CHECK (kind IN ('created','status_change','assignment','note')),
  from_status  TEXT,
  to_status    TEXT,
  note         TEXT NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL,
  -- SQLite used implicit rowid to break created_at ties; this is its stable equivalent.
  seq          BIGSERIAL
);
CREATE INDEX idx_cevents ON complaint_events(complaint_id, created_at, seq);

CREATE TABLE outages (
  outage_id       TEXT PRIMARY KEY,
  location_id     TEXT NOT NULL REFERENCES locations(location_id),
  status          TEXT NOT NULL CHECK (status IN ('active','resolved')),
  cause_rule      TEXT NOT NULL CHECK (cause_rule IN ('R1','R2','R3','manual')),
  message         TEXT NOT NULL,
  complaint_count INTEGER NOT NULL DEFAULT 0,
  failure_count   INTEGER NOT NULL DEFAULT 0,
  detected_at     timestamptz NOT NULL,
  resolved_at     timestamptz,
  resolved_by     TEXT REFERENCES users(user_id)
);
CREATE UNIQUE INDEX uq_one_active_outage ON outages(location_id) WHERE status = 'active';

CREATE TABLE maintenance_windows (
  maintenance_id TEXT PRIMARY KEY,
  location_id    TEXT REFERENCES locations(location_id),   -- NULL = whole campus
  title          TEXT NOT NULL,
  notes          TEXT NOT NULL DEFAULT '',
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL CHECK (ends_at > starts_at),
  created_by     TEXT NOT NULL REFERENCES users(user_id),
  announced      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL
);

CREATE TABLE notifications (
  notification_id TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(user_id),
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  entity_type     TEXT,
  entity_id       TEXT,
  is_read         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL
);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE insights (
  insight_id  TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN
    ('problem_detected','anomaly','trend_drop','outage_risk','peak_forecast','summary','recommendation')),
  location_id TEXT REFERENCES locations(location_id),
  severity    TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  message     TEXT NOT NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);
-- Parenthesised so the expression index is valid in PostgreSQL.
CREATE UNIQUE INDEX uq_active_insight ON insights(kind, (COALESCE(location_id,'*'))) WHERE is_active = true;

CREATE TABLE activity_logs (
  log_id      TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(user_id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  meta_json   TEXT NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL
);
CREATE INDEX idx_activity_time ON activity_logs(created_at DESC);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at timestamptz NOT NULL
);

-- 003_internet_tests.sql (002 lives in its own file: 002_outage_explanation.sql)
CREATE TABLE internet_tests (
  test_id      TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(user_id),
  provider     TEXT NOT NULL CHECK (provider = 'cloudflare'),
  campus_name  TEXT NOT NULL,
  scope        TEXT NOT NULL CHECK (scope = 'off_campus'),
  download_mbps double precision NOT NULL CHECK (download_mbps > 0),
  upload_mbps  double precision NOT NULL CHECK (upload_mbps > 0),
  ping_ms      double precision NOT NULL CHECK (ping_ms > 0),
  jitter_ms    double precision NOT NULL CHECK (jitter_ms >= 0),
  tested_at    timestamptz NOT NULL
);
CREATE INDEX idx_internet_tests_user_time ON internet_tests(user_id, tested_at DESC);

-- 004_location_coordinates.sql
ALTER TABLE locations ADD COLUMN latitude double precision CHECK (latitude BETWEEN -90 AND 90);
ALTER TABLE locations ADD COLUMN longitude double precision CHECK (longitude BETWEEN -180 AND 180);
