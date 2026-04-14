import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { app } from 'electron'
import path from 'path'
import * as schema from './schema'

const dbPath = path.join(app.getPath('userData'), 'astrology-chat.db')
const sqlite = new Database(dbPath)

// Включить WAL mode для лучшей производительности
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

export function runMigrations(): void {
  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.join(__dirname, '../../drizzle')
  migrate(db, { migrationsFolder })
}
