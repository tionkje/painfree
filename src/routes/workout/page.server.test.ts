import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll, expect, test, vi } from 'vitest';
import type { Exercise } from '$lib/exercises';

beforeAll(() => {
  vi.stubEnv('DATABASE_PATH', join(mkdtempSync(join(tmpdir(), 'painfree-')), 'workout.db'));
});

test('load returns the checked-in program in order', async () => {
  const { load } = await import('./+page.server');
  const data = (await load({} as Parameters<typeof load>[0])) as { exercises: Exercise[] };
  expect(data.exercises.map((e) => e.slug)).toEqual(['curl-up', 'side-plank', 'bird-dog']);
});

test('complete action logs a session', async () => {
  const mod = await import('./+page.server');
  const result = await mod.actions.complete({} as Parameters<typeof mod.actions.complete>[0]);
  expect(result).toEqual({ completed: true });

  const homeLoad = (await import('../+page.server')).load;
  const home = (await homeLoad({} as Parameters<typeof homeLoad>[0])) as {
    streak: number;
    doneToday: boolean;
    total: number;
  };
  expect(home.total).toBe(1);
  expect(home.doneToday).toBe(true);
  expect(home.streak).toBe(1);
});
