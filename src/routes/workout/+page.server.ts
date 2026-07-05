import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { exercises, sessions } from '$lib/server/schema';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return { exercises: db.select().from(exercises).orderBy(asc(exercises.sortOrder)).all() };
};

export const actions: Actions = {
  complete: async () => {
    db.insert(sessions).values({ completedAt: new Date() }).run();
    logger.info('workout session completed');
    return { completed: true };
  }
};
