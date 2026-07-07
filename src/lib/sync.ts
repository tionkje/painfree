// Pure sync logic. The client (localStorage) is the source of truth; the server
// is a backup/sync target. Merging is last-write-wins by `updatedAt` — single
// user, single writer, so no CRDTs are needed. Kept free of fetch/state so it's
// unit-testable.

export type CompletionEntry = {
  slug: string;
  unit: 'hold' | 'rep';
  target: number;
  completed: number;
};

// A session as held on the client. `deleted`/`synced` are client-only
// bookkeeping: `deleted` is a tombstone awaiting push, `synced` = the server has
// this exact version.
export type ClientSession = {
  uuid: string;
  completedAt: string; // ISO
  updatedAt: string; // ISO
  deleted: boolean;
  synced: boolean;
  exercises: CompletionEntry[];
};

// What the server stores/returns: live sessions only, no client bookkeeping.
export type ServerSession = Omit<ClientSession, 'deleted' | 'synced'>;

/** Sessions with unsynced local changes — these get pushed to the server. */
export function dirty(sessions: ClientSession[]): ClientSession[] {
  return sessions.filter((s) => !s.synced);
}

/**
 * Merge the server's live set back into local, last-write-wins by `updatedAt`.
 * - synced tombstones are dropped (the server has already deleted them);
 * - unsynced tombstones are kept (their delete hasn't been confirmed — don't
 *   resurrect from the server);
 * - otherwise the newer `updatedAt` wins; server wins ties (it's now synced).
 */
export function reconcile(local: ClientSession[], server: ServerSession[]): ClientSession[] {
  const byUuid = new Map<string, ClientSession>();
  for (const s of local) {
    if (s.deleted && s.synced) continue;
    byUuid.set(s.uuid, s);
  }
  for (const srv of server) {
    const cur = byUuid.get(srv.uuid);
    const incoming: ClientSession = { ...srv, deleted: false, synced: true };
    if (!cur) {
      byUuid.set(srv.uuid, incoming);
    } else if (
      !(cur.deleted && !cur.synced) &&
      Date.parse(srv.updatedAt) >= Date.parse(cur.updatedAt)
    ) {
      byUuid.set(srv.uuid, incoming);
    }
  }
  return [...byUuid.values()];
}
