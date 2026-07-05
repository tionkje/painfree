import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, vi } from 'vitest';

test('startup hook boots env, db and logger without throwing', async () => {
  vi.stubEnv('DATABASE_PATH', join(mkdtempSync(join(tmpdir(), 'painfree-')), 'hooks.db'));
  vi.resetModules();
  await expect(import('./hooks.server')).resolves.toBeDefined();
});
