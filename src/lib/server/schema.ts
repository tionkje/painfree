import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

// The exercise program. Seeded with the McGill Big 3. Edit rows directly in the
// DB (drizzle studio / SQL) to change the program — no settings UI in v1.
export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  // Reps per set, e.g. "6,4,2" for the McGill reverse pyramid.
  scheme: text('scheme').notNull(),
  holdSeconds: integer('hold_seconds').notNull(),
  // 1 = performed on each side (left/right), 0 = single.
  perSide: integer('per_side', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0)
});

// One completed daily workout session. History + streak are derived from these.
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull()
});

export type Exercise = typeof exercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
