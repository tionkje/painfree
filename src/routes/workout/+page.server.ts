import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { sessions, sessionExercises } from '$lib/server/schema';
import { exercises } from '$lib/exercises';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return { exercises };
};

// Per-exercise completion posted by the client as a JSON string. `completed`
// never exceeds `target`; both are unit counts (holds or reps).
const completionSchema = z.array(
  z.object({
    slug: z.string().min(1),
    unit: z.enum(['hold', 'rep']),
    target: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative()
  })
);

export const actions: Actions = {
  complete: async ({ request }) => {
    // request is absent in unit tests that only seed a bare session.
    const raw = request ? (await request.formData()).get('completion') : null;
    let completion: z.infer<typeof completionSchema> = [];
    if (typeof raw === 'string') {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (e) {
        logger.warn({ err: e }, 'invalid completion payload');
        return fail(400, { error: 'Invalid completion payload' });
      }
      const parsed = completionSchema.safeParse(json);
      if (!parsed.success) return fail(400, { error: 'Invalid completion payload' });
      completion = parsed.data;
    }

    const { id } = db
      .insert(sessions)
      .values({ completedAt: new Date() })
      .returning({ id: sessions.id })
      .get();

    if (completion.length > 0) {
      db.insert(sessionExercises)
        .values(
          completion.map((c) => ({
            sessionId: id,
            exerciseSlug: c.slug,
            unit: c.unit,
            targetUnits: c.target,
            completedUnits: c.completed
          }))
        )
        .run();
    }
    logger.info({ sessionId: id, exercises: completion.length }, 'workout session completed');
    return { completed: true };
  }
};
