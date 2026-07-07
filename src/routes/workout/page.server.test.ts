import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll, expect, test, vi } from 'vitest';
import type { Exercise } from '$lib/exercises';

beforeAll(() => {
  vi.stubEnv('DATABASE_PATH', join(mkdtempSync(join(tmpdir(), 'painfree-')), 'workout.db'));
});

function post(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return { request: new Request('http://localhost', { method: 'POST', body: fd }) } as never;
}

test('load returns the checked-in program in order plus the seeded settings', async () => {
  const { load } = await import('./+page.server');
  const data = (await load({} as Parameters<typeof load>[0])) as {
    exercises: Exercise[];
    settings: { restSeconds: number; repositionSeconds: number };
  };
  expect(data.exercises.map((e) => e.slug)).toEqual(['curl-up', 'side-plank', 'bird-dog']);
  expect(data.settings).toMatchObject({ restSeconds: 5, repositionSeconds: 15 });
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

type HistoryData = { sessions: { id: number; percent: number | null }[] };

async function latestPercent(): Promise<number | null> {
  const { load } = await import('../history/+page.server');
  const data = (await load({} as Parameters<typeof load>[0])) as HistoryData;
  return data.sessions[0].percent;
}

test('complete stores per-exercise completion and derives the percent', async () => {
  const { actions } = await import('./+page.server');
  const completion = JSON.stringify([
    { slug: 'curl-up', unit: 'hold', target: 12, completed: 12 },
    { slug: 'side-plank', unit: 'hold', target: 24, completed: 12 }
  ]);
  const res = await actions.complete(post({ completion }));
  expect(res).toEqual({ completed: true });
  // 24 of 36 units done -> 67%.
  expect(await latestPercent()).toBe(67);
});

test('complete with no completion field logs a bare session (unknown percent)', async () => {
  const { actions } = await import('./+page.server');
  await actions.complete(post({}));
  expect(await latestPercent()).toBeNull();
});

test('complete rejects malformed JSON', async () => {
  const { actions } = await import('./+page.server');
  const res = await actions.complete(post({ completion: 'not json' }));
  expect(res).toMatchObject({ status: 400 });
});

test('complete rejects a payload with the wrong shape', async () => {
  const { actions } = await import('./+page.server');
  const res = await actions.complete(post({ completion: JSON.stringify({ nope: true }) }));
  expect(res).toMatchObject({ status: 400 });
});
