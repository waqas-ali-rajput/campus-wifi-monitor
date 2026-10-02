ALTER TABLE locations ADD COLUMN latitude REAL CHECK (latitude BETWEEN -90 AND 90);
ALTER TABLE locations ADD COLUMN longitude REAL CHECK (longitude BETWEEN -180 AND 180);
