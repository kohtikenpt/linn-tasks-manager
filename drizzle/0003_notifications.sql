CREATE TABLE notifications (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id), task_id TEXT REFERENCES tasks(id), kind TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, dedupe TEXT NOT NULL, UNIQUE(employee_id,dedupe));
--> statement-breakpoint
CREATE INDEX notification_employee_idx ON notifications(employee_id,created_at);
--> statement-breakpoint
CREATE TABLE push_subscriptions (endpoint_hash TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES employees(id), session_hash TEXT NOT NULL, subscription TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX push_employee_idx ON push_subscriptions(employee_id);
