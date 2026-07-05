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

test('creates dir, migrates and seeds the McGill Big 3 on first run', async () => {
  vi.stubEnv('DATABASE_PATH', tmpDbPath());
  vi.resetModules();
  const { db } = await import('./db');
  const { exercises } = await import('./schema');
  const rows = db.select().from(exercises).all();
  expect(rows.map((r) => r.slug)).toEqual(['curl-up', 'side-plank', 'bird-dog']);
});

test('does not re-seed when exercises already exist', async () => {
  const path = tmpDbPath();

  vi.stubEnv('DATABASE_PATH', path);
  vi.resetModules();
  const first = await import('./db');
  const { exercises } = await import('./schema');
  expect(first.db.select().from(exercises).all()).toHaveLength(3);

  // Re-import against the same file: migrations re-run (idempotent), seed skipped.
  vi.resetModules();
  const second = await import('./db');
  expect(second.db.select().from(exercises).all()).toHaveLength(3);
});
