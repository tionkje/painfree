import { db } from '$lib/server/db';
import { sessions } from '$lib/server/schema';
import { exercises } from '$lib/exercises';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { exercises };
};

export const actions: Actions = {
	complete: async () => {
		db.insert(sessions).values({ completedAt: new Date() }).run();
		logger.info('workout session completed');
		return { completed: true };
	}
};
