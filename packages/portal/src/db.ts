import Database from 'better-sqlite3'
import { resolve } from 'node:path'

export function createPortalDB(dbPath?: string): Database.Database {
  const path = dbPath ?? resolve(process.env.PORTAL_DB_PATH ?? './portal.db')
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS exports (
      export_id TEXT PRIMARY KEY,
      admin_did TEXT NOT NULL,
      bundle_json TEXT NOT NULL,
      stored_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS identities (
      did TEXT PRIMARY KEY,
      identity_json TEXT NOT NULL,
      keypair_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS discord_links (
      discord_id TEXT PRIMARY KEY,
      did TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS discord_profiles (
      did TEXT PRIMARY KEY,
      discord_id TEXT NOT NULL,
      username TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS friends_lists (
      did TEXT NOT NULL,
      friend_discord_id TEXT NOT NULL,
      PRIMARY KEY (did, friend_discord_id)
    );
  `)
  return db
}
