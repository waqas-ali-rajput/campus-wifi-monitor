-- [DECISION] human-readable cause shown on the Outages page
ALTER TABLE outages ADD COLUMN explanation TEXT NOT NULL DEFAULT '';
ALTER TABLE outages ADD COLUMN category TEXT;
