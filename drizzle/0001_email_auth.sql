CREATE TABLE credentials (employee_id TEXT PRIMARY KEY REFERENCES employees(id), password_hash TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX sessions_employee ON sessions(employee_id);
--> statement-breakpoint
CREATE TABLE auth_links (token_hash TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id), expires_at TEXT NOT NULL, used_at TEXT, claim TEXT);
--> statement-breakpoint
CREATE TABLE auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
