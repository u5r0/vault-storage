import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

const DB_PATH = process.env.DATABASE_URL || ":memory:"

const sqlite = new Database(DB_PATH)
const drizzleDb = drizzle(sqlite)

export const db = drizzleDb

export default db

// Ensure required tables exist for tests/dev. Simple, idempotent SQL.
const initSql = `
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	created_at TEXT NOT NULL,
	verified INTEGER DEFAULT 0,
	verification_token TEXT,
	verification_expires TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
	jti TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	expires_at TEXT NOT NULL
);
 
CREATE TABLE IF NOT EXISTS vault_entries (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  parent_id TEXT,
  name TEXT NOT NULL,
  path TEXT,
  type TEXT NOT NULL,
  size INTEGER DEFAULT 0,
  content_type TEXT,
  blob_path TEXT,
  blob_name TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT
);
`

sqlite.exec(initSql)
