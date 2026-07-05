import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeAll, expect, test, vi } from 'vitest';

type SettingsData = { sessions: { id: number; completedAt: string }[] };

function post(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return { request: new Request('http://localhost', { method: 'POST', body: fd }) } as never;
}

beforeAll(() => {
  vi.stubEnv('DATABASE_PATH', join(mkdtempSync(join(tmpdir(), 'painfree-')), 'settings.db'));
});

async function seedSession() {
  const { actions } = await import('../workout/+page.server');
  await actions.complete({} as Parameters<typeof actions.complete>[0]);
}

test('load maps sessions to datetime-local strings', async () => {
  await seedSession();
  const { load } = await import('./+page.server');
  const data = (await load({} as Parameters<typeof load>[0])) as SettingsData;
  expect(data.sessions).toHaveLength(1);
  expect(data.sessions[0].completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('update rejects an invalid date', async () => {
  const { actions } = await import('./+page.server');
  const res = await actions.update(post({ id: '1', completedAt: 'nope' }));
  expect(res).toMatchObject({ status: 400 });
});

test('update changes completedAt', async () => {
  const { load, actions } = await import('./+page.server');
  const before = (await load({} as Parameters<typeof load>[0])) as SettingsData;
  const id = String(before.sessions[0].id);

  const res = await actions.update(post({ id, completedAt: '2020-01-02T03:04' }));
  expect(res).toEqual({ updated: true });

  const after = (await load({} as Parameters<typeof load>[0])) as SettingsData;
  expect(after.sessions[0].completedAt).toBe('2020-01-02T03:04');
});

test('delete rejects an invalid id', async () => {
  const { actions } = await import('./+page.server');
  const res = await actions.delete(post({ id: 'abc' }));
  expect(res).toMatchObject({ status: 400 });
});

test('delete removes the session', async () => {
  const { load, actions } = await import('./+page.server');
  const id = String(
    ((await load({} as Parameters<typeof load>[0])) as SettingsData).sessions[0].id
  );

  const res = await actions.delete(post({ id }));
  expect(res).toEqual({ deleted: true });

  const after = (await load({} as Parameters<typeof load>[0])) as SettingsData;
  expect(after.sessions).toHaveLength(0);
});
