import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll, expect, test, vi } from 'vitest';
import type { ServerSession } from '$lib/sync';

beforeAll(() => {
  vi.stubEnv('DATABASE_PATH', join(mkdtempSync(join(tmpdir(), 'painfree-')), 'sync.db'));
});

function req(body: unknown): never {
  return {
    request: new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  } as never;
}

async function sync(changes: unknown[]): Promise<ServerSession[]> {
  const { POST } = await import('./+server');
  const res = await POST(req({ changes }));
  const data = (await res.json()) as { sessions: ServerSession[] };
  return data.sessions;
}

const iso = '2026-05-05T10:00:00.000Z';

test('rejects an invalid payload', async () => {
  const { POST } = await import('./+server');
  await expect(POST(req({ nope: true }))).rejects.toMatchObject({ status: 400 });
});

test('upserts a session with exercises and returns it', async () => {
  const out = await sync([
    {
      uuid: 'a',
      completedAt: iso,
      updatedAt: iso,
      deleted: false,
      exercises: [{ slug: 'curl-up', unit: 'hold', target: 12, completed: 6, rating: 3 }]
    }
  ]);
  const a = out.find((s) => s.uuid === 'a');
  expect(a?.exercises).toEqual([
    { slug: 'curl-up', unit: 'hold', target: 12, completed: 6, rating: 3 }
  ]);
  expect(a?.notes).toBe('');
});

test('stores a backfilled session with no exercises', async () => {
  const out = await sync([
    { uuid: 'b', completedAt: iso, updatedAt: iso, deleted: false, exercises: [] }
  ]);
  expect(out.find((s) => s.uuid === 'b')?.exercises).toEqual([]);
});

test('updates an existing session on conflict', async () => {
  const later = '2026-06-06T10:00:00.000Z';
  const out = await sync([
    { uuid: 'a', completedAt: later, updatedAt: later, deleted: false, exercises: [] }
  ]);
  const a = out.find((s) => s.uuid === 'a');
  expect(a?.completedAt).toBe(later);
  expect(a?.exercises).toEqual([]);
});

test('hard-deletes a session', async () => {
  const out = await sync([
    { uuid: 'a', completedAt: iso, updatedAt: iso, deleted: true, exercises: [] }
  ]);
  expect(out.find((s) => s.uuid === 'a')).toBeUndefined();
});

test('deleting an unknown uuid is a no-op', async () => {
  const out = await sync([
    { uuid: 'ghost', completedAt: iso, updatedAt: iso, deleted: true, exercises: [] }
  ]);
  expect(out.find((s) => s.uuid === 'ghost')).toBeUndefined();
});

test('stores notes and defaults missing ratings to null', async () => {
  const out = await sync([
    {
      uuid: 'n',
      completedAt: iso,
      updatedAt: iso,
      deleted: false,
      notes: 'felt strong',
      exercises: [{ slug: 'bird-dog', unit: 'hold', target: 6, completed: 6 }]
    }
  ]);
  const n = out.find((s) => s.uuid === 'n');
  expect(n?.notes).toBe('felt strong');
  expect(n?.exercises).toEqual([
    { slug: 'bird-dog', unit: 'hold', target: 6, completed: 6, rating: null }
  ]);
});

test('rejects an out-of-range rating', async () => {
  const { POST } = await import('./+server');
  const change = {
    uuid: 'x',
    completedAt: iso,
    updatedAt: iso,
    deleted: false,
    exercises: [{ slug: 's', unit: 'hold', target: 1, completed: 1, rating: 9 }]
  };
  await expect(POST(req({ changes: [change] }))).rejects.toMatchObject({ status: 400 });
});
