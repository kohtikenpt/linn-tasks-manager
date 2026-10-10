ALTER TABLE credentials ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0 CHECK(must_change IN (0,1));
