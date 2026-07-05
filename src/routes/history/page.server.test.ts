import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll, expect, test, vi } from 'vitest';

type HistoryData = { streak: number; sessions: { id: number; completedAt: string }[] };

beforeAll(() => {
  vi.stubEnv('DATABASE_PATH', join(mkdtempSync(join(tmpdir(), 'painfree-')), 'history.db'));
});

test('history load is empty with no sessions', async () => {
  const { load } = await import('./+page.server');
  const result = await load({} as Parameters<typeof load>[0]);
  expect(result).toEqual({ streak: 0, sessions: [] });
});

test('history load returns a completed session', async () => {
  const { actions } = await import('../workout/+page.server');
  await actions.complete({} as Parameters<typeof actions.complete>[0]);

  const { load } = await import('./+page.server');
  const result = (await load({} as Parameters<typeof load>[0])) as HistoryData;
  expect(result.streak).toBe(1);
  expect(result.sessions).toHaveLength(1);
  expect(typeof result.sessions[0].completedAt).toBe('string');
});
