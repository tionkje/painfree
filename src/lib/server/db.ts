import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from './env';
import { logger } from './logger';
import * as schema from './schema';
import { exercises } from './schema';

// recursive is idempotent — no need to check existence first.
mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

const sqlite = new Database(env.DATABASE_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: './drizzle' });
logger.info({ db: env.DATABASE_PATH }, 'migrations applied');

// Seed the McGill Big 3 once. Reverse pyramid 6/4/2, 10s holds.
const MCGILL_BIG_3 = [
  {
    slug: 'curl-up',
    name: 'Modified Curl-Up',
    description:
      'Lie on your back, one knee bent, hands under the lower back. Lift head and shoulders slightly, keeping the neck neutral. Hold, then lower.',
    scheme: '6,4,2',
    holdSeconds: 10,
    perSide: false,
    sortOrder: 1
  },
  {
    slug: 'side-plank',
    name: 'Side Plank (Side Bridge)',
    description:
      'On your side, supported on the forearm and knees or feet, lift the hips to make a straight line. Keep the core braced. Hold, then lower.',
    scheme: '6,4,2',
    holdSeconds: 10,
    perSide: true,
    sortOrder: 2
  },
  {
    slug: 'bird-dog',
    name: 'Bird Dog',
    description:
      'On hands and knees, extend the opposite arm and leg straight out, keeping the back flat and hips level. Hold, then return.',
    scheme: '6,4,2',
    holdSeconds: 10,
    perSide: true,
    sortOrder: 3
  }
];

const count = db.select().from(exercises).all().length;
if (count === 0) {
  db.insert(exercises).values(MCGILL_BIG_3).run();
  logger.info({ seeded: MCGILL_BIG_3.length }, 'seeded exercise program');
}
