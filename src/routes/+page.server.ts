import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sessions } from '$lib/server/schema';
import { currentStreak, doneToday } from '$lib/streak';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const rows = db.select().from(sessions).orderBy(desc(sessions.completedAt)).all();
  const dates = rows.map((r) => r.completedAt);
  const now = new Date();
  return {
    streak: currentStreak(dates, now),
    doneToday: doneToday(dates, now),
    total: rows.length
  };
};
