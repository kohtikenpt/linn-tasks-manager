CREATE TABLE employee_photos (
 employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
 content_type TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
