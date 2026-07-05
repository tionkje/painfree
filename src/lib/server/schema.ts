import { sqliteTable, integer } from 'drizzle-orm/sqlite-core';

// The exercise program is checked in — see `src/lib/exercises.ts`, not the DB.

// One completed daily workout session. History + streak are derived from these.
export const sessions = sqliteTable('sessions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull()
});

export type Session = typeof sessions.$inferSelect;
