CREATE TABLE internet_tests (
  test_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  provider TEXT NOT NULL CHECK (provider = 'cloudflare'),
  campus_name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope = 'off_campus'),
  download_mbps REAL NOT NULL CHECK (download_mbps > 0),
  upload_mbps REAL NOT NULL CHECK (upload_mbps > 0),
  ping_ms REAL NOT NULL CHECK (ping_ms > 0),
  jitter_ms REAL NOT NULL CHECK (jitter_ms >= 0),
  tested_at TEXT NOT NULL
);
CREATE INDEX idx_internet_tests_user_time ON internet_tests(user_id, tested_at DESC);
