import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

let db: Db | undefined

export function openDb(file: string, migrationsDir: string): Db {
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  const d = drizzle(sqlite, { schema }) as Db
  migrate(d, { migrationsFolder: migrationsDir })
  return d
}

export function useDb(): Db {
  if (!db) {
    const cfg = useConfig()
    mkdirSync(cfg.dataDir, { recursive: true })
    mkdirSync(cfg.mediaDir, { recursive: true })
    db = openDb(cfg.dbFile, cfg.migrationsDir)
  }
  return db
}

/** Test helper: use a given database instead of the file in DATA_DIR. */
export function setDb(d: Db | undefined) {
  db = d
}

export { schema }
export { ROLES, ITEM_TYPES, COMMAND_TYPES } from '../db/schema'
export type { Role, ItemType, CommandType } from '../db/schema'
