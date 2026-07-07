import { sqliteTable, integer } from 'drizzle-orm/sqlite-core';

// The exercise program is checked in — see `src/lib/exercises.ts`, not the DB.

// One completed daily workout session. History + streak are derived from these.
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull()
});

// App-wide timer settings: a single row (id = 1), seeded at boot, edited on /settings.
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  // Pause between holds in the same position.
  restSeconds: integer('rest_seconds').notNull().default(5),
  // Pause when the next hold needs a position change (other exercise or side).
  repositionSeconds: integer('reposition_seconds').notNull().default(15)
});

export type Session = typeof sessions.$inferSelect;
export type Settings = typeof settings.$inferSelect;
