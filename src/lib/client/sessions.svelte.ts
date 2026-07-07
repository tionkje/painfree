// Client-side session store — the source of truth for this offline-first app.
// Sessions live in localStorage; the server (/api/sync) is a backup/sync target
// only, never on the read path. Mutations write locally first (optimistic) and
// fire a background sync.

import {
  dirty,
  reconcile,
  type ClientSession,
  type CompletionEntry,
  type ServerSession
} from '$lib/sync';

const KEY = 'sessions';

// localStorage access is isolated here so the browser guard is testable and the
// rest of the module can assume a plain array.
export function read(): ClientSession[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as ClientSession[]) : [];
}

export function write(sessions: ClientSession[]): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(sessions));
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

// Reactive store. Mutate `store.sessions` in place (or reassign the property) —
// components reading it re-render.
export const store = $state<{ sessions: ClientSession[] }>({ sessions: read() });

/** Live (non-deleted) sessions, newest first. */
export function orderedLive(): ClientSession[] {
  return store.sessions
    .filter((s) => !s.deleted)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
}

function stamp(): string {
  return new Date().toISOString();
}

export function logSession(exercises: CompletionEntry[]): void {
  const t = stamp();
  store.sessions.push({
    uuid: crypto.randomUUID(),
    completedAt: t,
    updatedAt: t,
    deleted: false,
    synced: false,
    exercises
  });
  write(store.sessions);
  void scheduleSync();
}

export function backfill(completedAt: Date): void {
  store.sessions.push({
    uuid: crypto.randomUUID(),
    completedAt: completedAt.toISOString(),
    updatedAt: stamp(),
    deleted: false,
    synced: false,
    exercises: []
  });
  write(store.sessions);
  void scheduleSync();
}

export function editCompletedAt(uuid: string, completedAt: Date): void {
  const s = store.sessions.find((x) => x.uuid === uuid);
  if (!s) return;
  s.completedAt = completedAt.toISOString();
  s.updatedAt = stamp();
  s.synced = false;
  write(store.sessions);
  void scheduleSync();
}

export function deleteSession(uuid: string): void {
  const s = store.sessions.find((x) => x.uuid === uuid);
  if (!s) return;
  s.deleted = true;
  s.updatedAt = stamp();
  s.synced = false;
  write(store.sessions);
  void scheduleSync();
}

/**
 * Push unsynced sessions to the server and merge back the live set. Offline is a
 * no-op — the local write already happened and the `online` trigger retries.
 * Throws on HTTP failure so callers see it (see scheduleSync for fire-and-forget).
 */
export async function syncNow(): Promise<void> {
  if (!isOnline()) return;
  const changes = dirty(store.sessions);
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ changes })
  });
  if (!res.ok) throw new Error(`sync failed: ${res.status}`);
  const data = (await res.json()) as { sessions: ServerSession[] };
  // Everything we pushed is now on the server, so mark it synced before merging;
  // synced tombstones then get dropped by reconcile.
  const sent = changes.map((s) => s.uuid);
  for (const s of store.sessions) if (sent.includes(s.uuid)) s.synced = true;
  store.sessions = reconcile(store.sessions, data.sessions);
  write(store.sessions);
}

/** Fire-and-forget sync that logs failures instead of throwing. */
export function scheduleSync(): Promise<void> {
  return syncNow().catch((e) => {
    console.error('sync failed', e);
  });
}
