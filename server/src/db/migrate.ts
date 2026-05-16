import type { SqliteClient } from "./client";

const statements = [
  `CREATE TABLE IF NOT EXISTS admin_account (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS dns_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('MX', 'SPF', 'DKIM', 'DMARC')),
    host TEXT NOT NULL,
    value TEXT NOT NULL,
    ttl INTEGER NOT NULL DEFAULT 600,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'missing')),
    last_checked_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS dns_records_type_host_idx ON dns_records (type, host)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    from_email TEXT NOT NULL,
    to_emails TEXT NOT NULL DEFAULT '[]',
    cc_emails TEXT NOT NULL DEFAULT '[]',
    bcc_emails TEXT NOT NULL DEFAULT '[]',
    subject TEXT NOT NULL DEFAULT '',
    text_body TEXT,
    html_body TEXT,
    raw_source TEXT,
    folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent', 'trash')),
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    is_read INTEGER NOT NULL DEFAULT 0,
    is_starred INTEGER NOT NULL DEFAULT 0,
    has_attachments INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT,
    received_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS messages_message_id_idx ON messages (message_id)`,
  `CREATE INDEX IF NOT EXISTS messages_folder_created_at_idx ON messages (folder, created_at)`,
  `CREATE INDEX IF NOT EXISTS messages_direction_idx ON messages (direction)`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS attachments_message_id_idx ON attachments (message_id)`,
  `CREATE TABLE IF NOT EXISTS system_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error')),
    message TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS system_events_type_created_at_idx ON system_events (type, created_at)`,
];

function hasColumn(sqlite: SqliteClient, tableName: string, columnName: string) {
  const columns = sqlite
    .query(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === columnName);
}

export function migrate(sqlite: SqliteClient) {
  const migration = sqlite.transaction(() => {
    for (const statement of statements) {
      sqlite.run(statement);
    }

    if (!hasColumn(sqlite, "messages", "raw_source")) {
      sqlite.run("ALTER TABLE messages ADD COLUMN raw_source TEXT");
    }
  });

  migration();
}
