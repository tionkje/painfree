import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sessions, sessionExercises } from '$lib/server/schema';
import { currentStreak } from '$lib/streak';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const rows = db.select().from(sessions).orderBy(desc(sessions.completedAt)).all();
  const exRows = db.select().from(sessionExercises).all();

  // Tally completed/target units per session. Sessions with no rows (older data,
  // or logged without detail) have unknown completeness -> percent stays null.
  const tally = new Map<number, { done: number; total: number }>();
  for (const e of exRows) {
    const g = tally.get(e.sessionId) ?? { done: 0, total: 0 };
    g.done += e.completedUnits;
    g.total += e.targetUnits;
    tally.set(e.sessionId, g);
  }

  return {
    streak: currentStreak(
      rows.map((r) => r.completedAt),
      new Date()
    ),
    sessions: rows.map((r) => {
      const g = tally.get(r.id);
      const percent = g && g.total > 0 ? Math.round((g.done / g.total) * 100) : null;
      return { id: r.id, completedAt: r.completedAt.toISOString(), percent };
    })
  };
};
