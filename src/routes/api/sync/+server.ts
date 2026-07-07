import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { sessions, sessionExercises } from '$lib/server/schema';
import { logger } from '$lib/server/logger';
import type { RequestHandler } from './$types';

// The client (localStorage) is the source of truth. This endpoint takes the
// client's changed sessions (keyed by uuid), upserts / hard-deletes them, and
// returns the full live set so the client can merge (see $lib/sync reconcile).

const entrySchema = z.object({
  slug: z.string().min(1),
  unit: z.enum(['hold', 'rep']),
  target: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative()
});
const changeSchema = z.object({
  uuid: z.string().min(1),
  // ISO strings from the client; coerced to Date for the timestamp_ms columns.
  completedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deleted: z.boolean(),
  exercises: z.array(entrySchema)
});
const bodySchema = z.object({ changes: z.array(changeSchema) });

export const POST: RequestHandler = async ({ request }) => {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    logger.warn('invalid sync payload');
    error(400, 'Invalid sync payload');
  }

  for (const c of parsed.data.changes) {
    if (c.deleted) {
      const existing = db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.uuid, c.uuid))
        .get();
      if (existing) {
        db.delete(sessionExercises).where(eq(sessionExercises.sessionId, existing.id)).run();
        db.delete(sessions).where(eq(sessions.uuid, c.uuid)).run();
      }
      continue;
    }
    const { id } = db
      .insert(sessions)
      .values({ uuid: c.uuid, completedAt: c.completedAt, updatedAt: c.updatedAt })
      .onConflictDoUpdate({
        target: sessions.uuid,
        set: { completedAt: c.completedAt, updatedAt: c.updatedAt }
      })
      .returning({ id: sessions.id })
      .get();
    // Exercise rows are immutable snapshots; replace them wholesale on upsert.
    db.delete(sessionExercises).where(eq(sessionExercises.sessionId, id)).run();
    if (c.exercises.length > 0) {
      db.insert(sessionExercises)
        .values(
          c.exercises.map((e) => ({
            sessionId: id,
            exerciseSlug: e.slug,
            unit: e.unit,
            targetUnits: e.target,
            completedUnits: e.completed
          }))
        )
        .run();
    }
  }

  const rows = db.select().from(sessions).all();
  const exRows = db.select().from(sessionExercises).all();
  const bySession = new Map<number, typeof exRows>();
  for (const e of exRows) {
    const g = bySession.get(e.sessionId) ?? [];
    g.push(e);
    bySession.set(e.sessionId, g);
  }
  const out = rows.map((r) => ({
    uuid: r.uuid,
    completedAt: r.completedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    exercises: (bySession.get(r.id) ?? []).map((e) => ({
      slug: e.exerciseSlug,
      unit: e.unit,
      target: e.targetUnits,
      completed: e.completedUnits
    }))
  }));

  logger.info({ changes: parsed.data.changes.length }, 'sync');
  return json({ sessions: out });
};
