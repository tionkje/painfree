import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sessions } from '$lib/server/schema';
import { currentStreak } from '$lib/streak';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = db.select().from(sessions).orderBy(desc(sessions.completedAt)).all();
	return {
		streak: currentStreak(
			rows.map((r) => r.completedAt),
			new Date()
		),
		sessions: rows.map((r) => ({ id: r.id, completedAt: r.completedAt.toISOString() }))
	};
};
