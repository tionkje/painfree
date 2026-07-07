import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from './env';
import { logger } from './logger';
import * as schema from './schema';

// recursive is idempotent — no need to check existence first.
mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

const sqlite = new Database(env.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: './drizzle' });
logger.info({ db: env.DATABASE_PATH }, 'migrations applied');

// Ensure the single settings row exists (defaults come from the schema).
db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing().run();
