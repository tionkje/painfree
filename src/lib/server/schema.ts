import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

// The exercise program is checked in — see `src/lib/exercises.ts`, not the DB.

// One completed daily workout session. History + streak are derived from these.
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull()
});

// Per-exercise completion within a session, one row per exercise done. Unit-
// agnostic: `completedUnits / targetUnits` is the completeness whether a unit is
// a timed hold or a counted rep. `exerciseSlug` and `unit` are snapshots so the
// record survives edits to the checked-in program (adding/removing exercises,
// switching an exercise between hold and reps).
export const sessionExercises = sqliteTable('session_exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Logically references sessions.id. No drizzle .references() FK: it isn't
  // enforced (no `PRAGMA foreign_keys`) and the thunk is untestable dead weight.
  sessionId: integer('session_id').notNull(),
  exerciseSlug: text('exercise_slug').notNull(),
  unit: text('unit', { enum: ['hold', 'rep'] }).notNull(),
  targetUnits: integer('target_units').notNull(),
  completedUnits: integer('completed_units').notNull()
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
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type Settings = typeof settings.$inferSelect;
