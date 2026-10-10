CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), owner_id TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE employees (id TEXT PRIMARY KEY, auth_id TEXT UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('ceo','admin','employee')), department TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE comments (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), employee_id TEXT NOT NULL REFERENCES employees(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE attachments (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), employee_id TEXT NOT NULL REFERENCES employees(id), name TEXT NOT NULL, size INTEGER NOT NULL, content_type TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE audit (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, task_id TEXT, action TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX comment_task_idx ON comments(task_id, created_at);
--> statement-breakpoint
CREATE INDEX attachment_task_idx ON attachments(task_id);
