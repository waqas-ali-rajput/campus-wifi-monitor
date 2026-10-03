-- Mirrors migrations/002_outage_explanation.sql (SQLite): human-readable cause on the Outages page.
-- IF NOT EXISTS keeps this safe on databases created before the column was added to the Postgres schema.
ALTER TABLE outages ADD COLUMN IF NOT EXISTS explanation TEXT NOT NULL DEFAULT '';
ALTER TABLE outages ADD COLUMN IF NOT EXISTS category TEXT;
