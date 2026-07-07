import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as store from './sessions.svelte';
import { store as state } from './sessions.svelte';
import type { ClientSession, ServerSession } from '$lib/sync';

function cs(over: Partial<ClientSession>): ClientSession {
  return {
    uuid: 'u',
    completedAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    deleted: false,
    synced: true,
    exercises: [],
    ...over
  };
}
function srv(over: Partial<ServerSession>): ServerSession {
  return {
    uuid: 'u',
    completedAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    exercises: [],
    ...over
  };
}
function fetchOk(sessions: ServerSession[] = []): ReturnType<typeof vi.fn> {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sessions }) });
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  state.sessions = [];
});

describe('read / write', () => {
  it('read returns [] when nothing stored', () => {
    expect(store.read()).toEqual([]);
  });
  it('read parses stored sessions', () => {
    localStorage.setItem('sessions', JSON.stringify([cs({ uuid: 'a' })]));
    expect(store.read()).toEqual([cs({ uuid: 'a' })]);
  });
  it('read returns [] without localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(store.read()).toEqual([]);
    vi.unstubAllGlobals(); // restore before the shared afterEach clears localStorage
  });
  it('write persists', () => {
    store.write([cs({ uuid: 'w' })]);
    expect(JSON.parse(localStorage.getItem('sessions') ?? '[]')).toEqual([cs({ uuid: 'w' })]);
  });
  it('write is a no-op without localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => store.write([])).not.toThrow();
    vi.unstubAllGlobals(); // restore before the shared afterEach clears localStorage
  });
});

describe('orderedLive', () => {
  it('drops deleted and sorts newest first', () => {
    state.sessions = [
      cs({ uuid: 'old', completedAt: '2026-01-01T00:00:00.000Z' }),
      cs({ uuid: 'new', completedAt: '2026-02-01T00:00:00.000Z' }),
      cs({ uuid: 'del', deleted: true })
    ];
    expect(store.orderedLive().map((s) => s.uuid)).toEqual(['new', 'old']);
  });
});

describe('mutations', () => {
  it('logSession appends an unsynced session and persists', async () => {
    const f = fetchOk();
    store.logSession([{ slug: 'a', unit: 'hold', target: 10, completed: 10 }]);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].synced).toBe(false);
    expect(localStorage.getItem('sessions')).toContain('"slug":"a"');
    await vi.waitFor(() => expect(f).toHaveBeenCalled());
  });
  it('backfill adds a dated empty session', async () => {
    const f = fetchOk();
    store.backfill(new Date('2026-03-03T09:00:00.000Z'));
    expect(state.sessions[0].completedAt).toBe('2026-03-03T09:00:00.000Z');
    expect(state.sessions[0].exercises).toEqual([]);
    await vi.waitFor(() => expect(f).toHaveBeenCalled());
  });
  it('editCompletedAt updates an existing session', async () => {
    fetchOk();
    state.sessions = [cs({ uuid: 'e', synced: true })];
    store.editCompletedAt('e', new Date('2026-04-04T08:00:00.000Z'));
    expect(state.sessions[0].completedAt).toBe('2026-04-04T08:00:00.000Z');
    expect(state.sessions[0].synced).toBe(false);
  });
  it('editCompletedAt is a no-op for an unknown uuid', () => {
    store.editCompletedAt('nope', new Date());
    expect(state.sessions).toEqual([]);
  });
  it('deleteSession tombstones an existing session', async () => {
    fetchOk();
    state.sessions = [cs({ uuid: 'd', synced: true })];
    store.deleteSession('d');
    expect(state.sessions[0].deleted).toBe(true);
    expect(state.sessions[0].synced).toBe(false);
  });
  it('deleteSession is a no-op for an unknown uuid', () => {
    store.deleteSession('nope');
    expect(state.sessions).toEqual([]);
  });
});

describe('syncNow', () => {
  it('is a no-op when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await store.syncNow();
    expect(f).not.toHaveBeenCalled();
  });
  it('proceeds when navigator is undefined', async () => {
    vi.stubGlobal('navigator', undefined);
    const f = fetchOk();
    await store.syncNow();
    expect(f).toHaveBeenCalled();
  });
  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(store.syncNow()).rejects.toThrow('sync failed: 500');
  });
  it('marks pushed sessions synced and merges the server set', async () => {
    state.sessions = [cs({ uuid: 'dirty', synced: false }), cs({ uuid: 'clean', synced: true })];
    fetchOk([srv({ uuid: 'srv', updatedAt: '2030-01-01T00:00:00.000Z' })]);
    await store.syncNow();
    const byUuid = Object.fromEntries(state.sessions.map((s) => [s.uuid, s]));
    expect(byUuid['dirty'].synced).toBe(true);
    expect(byUuid['clean']).toBeDefined();
    expect(byUuid['srv'].synced).toBe(true);
  });
});

describe('scheduleSync', () => {
  it('logs and swallows sync failures', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await store.scheduleSync();
    expect(err).toHaveBeenCalledWith('sync failed', expect.any(Error));
  });
  it('resolves on success', async () => {
    fetchOk();
    await expect(store.scheduleSync()).resolves.toBeUndefined();
  });
});
