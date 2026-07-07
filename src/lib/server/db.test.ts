import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, test, vi } from 'vitest';

function tmpDbPath() {
  return join(mkdtempSync(join(tmpdir(), 'painfree-')), 'nested', 'test.db');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test('creates the (nested) db dir, migrates and seeds the settings row', async () => {
  vi.stubEnv('DATABASE_PATH', tmpDbPath());
  vi.resetModules();
  const { db } = await import('./db');
  const { sessions, settings } = await import('./schema');
  // Migrations ran, so the table exists and is queryable — and starts empty.
  expect(db.select().from(sessions).all()).toEqual([]);
  // The single settings row is seeded with schema defaults.
  expect(db.select().from(settings).all()).toEqual([
    { id: 1, restSeconds: 5, repositionSeconds: 15 }
  ]);
});
