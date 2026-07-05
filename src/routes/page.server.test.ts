import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll, expect, test, vi } from 'vitest';

beforeAll(() => {
  vi.stubEnv('DATABASE_PATH', join(mkdtempSync(join(tmpdir(), 'painfree-')), 'home.db'));
});

test('home load reports empty streak with no sessions', async () => {
  const { load } = await import('./+page.server');
  const result = await load({} as Parameters<typeof load>[0]);
  expect(result).toEqual({ streak: 0, doneToday: false, total: 0 });
});
