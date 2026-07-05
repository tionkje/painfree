import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from './env';
import { logger } from './logger';
import * as schema from './schema';

const dir = dirname(env.DATABASE_PATH);
if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });

const sqlite = new Database(env.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: './drizzle' });
logger.info({ db: env.DATABASE_PATH }, 'migrations applied');
