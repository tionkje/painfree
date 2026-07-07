# CLAUDE.md

Daily back-exercise tracker. v1 = McGill Big 3 (curl-up, side plank, bird dog):
guided hold timer + history/streak to nag daily. No auth (tailscale-gated).

## Stack

SvelteKit (adapter-node, **SSR off** — SPA) · SQLite + Drizzle · Pino · Zod (startup env validation) · Pico CSS (dark/light).

## Offline-first (IMPORTANT — durable principle)

**The client (localStorage) is the source of truth. The server is a sync/backup
target, never on the read path.** All features must keep working offline; pages
read the client store and derive everything locally. Sync is background-only.
See `docs/offline-first-plan.md`. Consequences:

- **First launch must be online** — an empty cache + no network has nothing to show.
- No CRDTs: single user/writer, so merge is last-write-wins by `updatedAt` (`src/lib/sync.ts`).
- SSR/prerender disabled in `src/routes/+layout.ts`. Data comes from the store, not `load`.

## Layout

- `src/lib/server/{env,logger,db,schema}.ts` — env validation, pino, drizzle conn (migrates at startup), tables
- `src/lib/exercises.ts` — the exercise program (checked-in data + `static/exercises/*.svg` visuals; ships in the bundle, so it's offline for free)
- `src/lib/client/sessions.svelte.ts` — reactive localStorage session store (source of truth) + `syncNow`/`scheduleSync`
- `src/lib/client/settings.svelte.ts` — client-local timer settings (rest/reposition pauses), localStorage-backed, no DB
- `src/lib/sync.ts` (+ `.test.ts`) — pure `reconcile` (LWW merge) + `dirty`
- `src/lib/streak.ts`, `src/lib/history.ts`, `src/lib/datetime.ts` (+ `.test.ts`) — pure helpers (streak/day, completeness %, datetime-local formatting)
- `src/service-worker.ts` — precache-and-serve shell for offline boot (installable via `static/manifest.webmanifest`)
- `src/hooks.server.ts` — imports db to run migrations at boot
- routes: `/` (streak + banner), `/workout` (auto-run hold timer with rest/reposition pauses), `/history`, `/settings` (timers + edit/delete/backfill sessions), `/api/sync` (`POST` upsert-by-uuid, returns live set)

## Data model

- The exercise program is **checked in**, not in the DB: `src/lib/exercises.ts` (`mode` `'hold'|'reps'`, `scheme` reps-per-set `"6,4,2"`, `holdSeconds` (hold mode only), `perSide`, `description`, `details`, `image`, optional `video`). Visuals are SVGs in `static/exercises/<slug>.svg`. Array order = workout order. Edit the file to change the program.
- Timer settings (rest/reposition pauses for the auto-run workout) are **client-local** (localStorage, `src/lib/client/settings.svelte.ts`), not the DB — consistent with offline-first.
- `sessions` — one row per completed workout. Streak/history derived from these. Carries a client-generated `uuid` (sync identity, unique) + `updatedAt` (LWW). Client-side each session also holds `deleted`/`synced` bookkeeping (never sent as columns; deletes hard-delete server-side).
- `session_exercises` — one row per exercise per session: `exerciseSlug` + `unit` (`hold`/`rep`) + `targetUnits`/`completedUnits` (all snapshots). Completeness = `completed/target`; a session is 100% when every row is full. Snapshotting the slug/unit keeps old history valid when the checked-in program changes.

## Commands

- `pnpm dev` · `pnpm build && pnpm start`
- `pnpm check` (typecheck) · `pnpm lint` · `pnpm format` · `pnpm format:check`
- `pnpm test` · `pnpm test:coverage` (enforces thresholds)
- `pnpm db:generate` — new migration after editing `schema.ts`

## Quality gates

- **Pre-commit** (husky + lint-staged): eslint --fix + prettier on staged files, then `check` + `test`.
- **CI** runs format/lint/typecheck/coverage on every PR + push to `main` (and tags), then builds the image.
- **Coverage**: 100% statements/functions/lines everywhere and 100% branches on all `.ts`. Svelte components can't reach 100% branches (the compiler injects phantom branches on text interpolations), so `src/**/*.svelte` branches are capped in `vite.config.ts`.
- Component/UI tests are **brittle by nature** — each lives in its own `*.svelte.test.ts` inside a `describe('… brittle … safe to skip')`, so flip to `describe.skip` if they get costly.

## Deploy

CI (`.github/workflows/ci.yml`): gates → build/push `ghcr.io/tionkje/painfree:latest` on push to `main`.
Prod: omv `~/painfree`, port 3002, behind Caddy at https://painfree.omv.deknudtcallens.be. Update: `docker compose pull && up -d`.

## Gotchas

- No form actions anymore — writes go through `/api/sync` (JSON POST), which SvelteKit's CSRF check doesn't block, so `ORIGIN` is no longer required for correctness (kept harmless).
- better-sqlite3 is native; `onlyBuiltDependencies` in package.json allows its build under pnpm.
- Config lives in `svelte.config.js` (adapter-node), not vite.config.ts.
- `src/service-worker.ts` is **excluded from coverage** (config-shaped shell needing a real SW runtime); all sync logic lives in tested pure modules.
- Adding a `sessions` column? SQLite can't `ADD COLUMN NOT NULL`/`UNIQUE` on a populated table — hand-edit the generated migration to add nullable + backfill + `CREATE UNIQUE INDEX` (see `drizzle/0003_*`).
