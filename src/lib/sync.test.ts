import { describe, it, expect } from 'vitest';
import { dirty, reconcile, type ClientSession, type ServerSession } from './sync';

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

describe('dirty', () => {
  it('returns only unsynced sessions', () => {
    const a = cs({ uuid: 'a', synced: false });
    const b = cs({ uuid: 'b', synced: true });
    expect(dirty([a, b])).toEqual([a]);
  });
});

describe('reconcile', () => {
  it('adds server sessions the client has never seen (marked synced)', () => {
    const merged = reconcile([], [srv({ uuid: 'x', updatedAt: '2026-02-01T00:00:00.000Z' })]);
    expect(merged).toEqual([
      cs({ uuid: 'x', updatedAt: '2026-02-01T00:00:00.000Z', synced: true })
    ]);
  });

  it('drops synced tombstones (server already deleted them)', () => {
    const local = [cs({ uuid: 'gone', deleted: true, synced: true })];
    expect(reconcile(local, [])).toEqual([]);
  });

  it('keeps unsynced tombstones even when the server still returns them', () => {
    const local = [cs({ uuid: 'del', deleted: true, synced: false })];
    const merged = reconcile(local, [srv({ uuid: 'del' })]);
    expect(merged).toEqual(local);
  });

  it('takes the server version when it is newer or equal', () => {
    const local = [cs({ uuid: 'e', updatedAt: '2026-01-01T00:00:00.000Z', synced: false })];
    const merged = reconcile(local, [srv({ uuid: 'e', updatedAt: '2026-03-01T00:00:00.000Z' })]);
    expect(merged[0].updatedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(merged[0].synced).toBe(true);
  });

  it('keeps the local version when it is newer (unsynced edit)', () => {
    const local = [cs({ uuid: 'e', updatedAt: '2026-05-01T00:00:00.000Z', synced: false })];
    const merged = reconcile(local, [srv({ uuid: 'e', updatedAt: '2026-01-01T00:00:00.000Z' })]);
    expect(merged[0].updatedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(merged[0].synced).toBe(false);
  });
});
