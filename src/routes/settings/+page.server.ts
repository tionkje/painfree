import { desc, eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { sessions } from '$lib/server/schema';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

// Date -> value for <input type="datetime-local"> in server-local time (the
// same clock the streak logic uses), i.e. "YYYY-MM-DDTHH:mm".
function toLocalInput(d: Date): string {
	const p = (n: number): string => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const load: PageServerLoad = async () => {
	const rows = db.select().from(sessions).orderBy(desc(sessions.completedAt)).all();
	return {
		sessions: rows.map((r) => ({ id: r.id, completedAt: toLocalInput(r.completedAt) }))
	};
};

const updateSchema = z.object({
	id: z.coerce.number().int().positive(),
	// datetime-local has no timezone; new Date() parses it as local time.
	completedAt: z.coerce.date()
});
const deleteSchema = z.object({ id: z.coerce.number().int().positive() });

export const actions: Actions = {
	update: async ({ request }) => {
		const parsed = updateSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid date' });
		db.update(sessions)
			.set({ completedAt: parsed.data.completedAt })
			.where(eq(sessions.id, parsed.data.id))
			.run();
		logger.info({ id: parsed.data.id }, 'session updated');
		return { updated: true };
	},
	delete: async ({ request }) => {
		const parsed = deleteSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: 'Invalid id' });
		db.delete(sessions).where(eq(sessions.id, parsed.data.id)).run();
		logger.info({ id: parsed.data.id }, 'session deleted');
		return { deleted: true };
	}
};
