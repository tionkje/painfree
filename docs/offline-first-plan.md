# Offline-first plan

Make painfree local-first: instant navigation, works fully offline, syncs the
session log to the server in the background. Established via `/grill-me`; adapted
to the current codebase (checked-in exercises + `session_exercises`).

## Principle (durable)

**The client (localStorage) is the source of truth. The server is a sync/backup
target, never on the read path.** All future features must keep working offline.
First launch must be online (empty cache + no network = nothing to show).

## Why no CRDTs

Single user, single writer. Sessions are immutable except for
timestamp-edit/delete/backfill. Merge is last-write-wins by `updatedAt` — a pure
function, no CRDT machinery.

## Data model

- **Exercises**: already in the bundle (`src/lib/exercises.ts`) → offline-free,
  no sync.
- **Sessions**: client holds the full log in localStorage, each:
  `{ uuid, completedAt, updatedAt, deleted, synced, exercises: [{slug,unit,target,completed}] }`.
  `uuid` = `crypto.randomUUID()`. `deleted`/`synced` are client-only bookkeeping.
- **Server schema migration** (data-preserving, additive): keep integer `id` PK
  and `session_exercises` as-is; add to `sessions`: `uuid TEXT NOT NULL UNIQUE`
  (backfill random per existing row), `updated_at` (backfill = `completed_at`).
  No server `deleted` column — deletes hard-delete the row + its exercises.

## Runtime (SSR off — Option A)

- `src/routes/+layout.ts`: `export const ssr = false; export const prerender = false;`
- `src/lib/client/sessions.svelte.ts` — reactive `$state` store, hydrated from /
  persisted to localStorage. Mutations: `logSession(completion)`, `editCompletedAt`,
  `deleteSession`, `backfill(date)`. Each mutation stamps `updatedAt`, sets
  `synced=false`, persists, and fires `sync()`.
- `src/lib/sync.ts` — **pure** `reconcile(local, server)`: LWW by `updatedAt`,
  drops synced tombstones, returns merged list. Unit-tested to 100%.
- `src/lib/history.ts` — **pure** `tally(session)` → percent (moved from the old
  `history/+page.server.ts`). Unit-tested.
- Pages read the store directly (no `load`):
  - `/` — `currentStreak`, `doneToday`, total from store.
  - `/workout` — reads bundle exercises; on finish `logSession(...)` then goto `/history`.
  - `/history` — lists store sessions with `tally` percent.
  - `/settings` — edit datetime / delete / **backfill** (new) via store mutations.
- **Delete** all four `+page.server.ts` + their `page.server.test.ts`.

## Sync

- `src/routes/api/sync/+server.ts` — `POST`: body `{ changes: ClientSession[] }`.
  For each: `deleted` → hard-delete by uuid (+ its exercise rows); else upsert by
  uuid (insert/update `completedAt`,`updatedAt`) and replace its `session_exercises`
  rows. Returns `{ sessions: <all live sessions with exercises> }`. Tested like the
  existing server tests (real better-sqlite3 test db).
- `sync()` client wrapper: collect dirty (unsynced incl. tombstones) → POST →
  `reconcile` response into store → mark synced → persist. Thin; `fetch` mocked in tests.
- **Triggers**: on boot (layout `onMount`) + `window 'online'`. No focus-pull, no polling.

## Offline shell

- `src/service-worker.ts` — SvelteKit built-in `$service-worker`: precache
  `build` + `files` + `prerendered` on install, cache-first serve, drop old caches
  on activate, versioned by `version`. Update-on-next-load (no `skipWaiting`).
  **Excluded from coverage** in `vite.config.ts` (config-shaped shell).
- Installable: `static/manifest.webmanifest` + `static/icons/*.png` +
  `<link rel="manifest">` and theme-color in `src/app.html`.

## Coverage strategy (100% gate)

- Tested to 100%: `sync.ts` (`reconcile`), `history.ts` (`tally`),
  `sessions.svelte.ts` (jsdom has localStorage; drive every mutation + hydrate
  paths), `api/sync/+server.ts`, `streak.ts` (already).
- Excluded: `src/service-worker.ts`.
- Svelte components: existing 85% branch cap stays.

## CLAUDE.md updates

Offline-first principle · client-is-source-of-truth · first-launch-online ·
sync-on-boot/online · SW excluded from coverage · new files in Layout section.

## Deviations from the grill (codebase drifted after grilling)

- Exercises no longer synced (now bundle-shipped).
- Editing stays on `/settings` (already implements edit+delete) instead of inline
  on `/history`; adds backfill there. Reuse over rebuild.
- Single `POST /api/sync` instead of GET+POST `/api/sessions`.
