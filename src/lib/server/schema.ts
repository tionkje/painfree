import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

// The exercise program is checked in — see `src/lib/exercises.ts`, not the DB.

// One completed daily workout session. History + streak are derived from these.
// The client (localStorage) is the source of truth; this table is a sync target.
// `uuid` is the client-generated sync identity (stable across devices); `id` stays
// as the local PK that `session_exercises` references. `updatedAt` drives
// last-write-wins merging on the client.
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull().unique(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  // Free-form note from the end-of-session dialog; null = none.
  notes: text('notes')
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
  completedUnits: integer('completed_units').notNull(),
  // Perceived difficulty 1 (way too easy) … 5 (way too hard); null = unrated.
  rating: integer('rating')
});

// Timer settings (rest/reposition) are client-local (localStorage) in the
// offline-first model — see `src/lib/client/settings.svelte.ts`, not the DB.

export type Session = typeof sessions.$inferSelect;
export type SessionExercise = typeof sessionExercises.$inferSelect;
