# CLAUDE.md

Daily back-exercise tracker. v1 = McGill Big 3 (curl-up, side plank, bird dog):
guided hold timer + history/streak to nag daily. No auth (tailscale-gated).

## Stack

SvelteKit (adapter-node) · SQLite + Drizzle · Pino · Zod (startup env validation) · Pico CSS (dark/light).

## Layout

- `src/lib/server/{env,logger,db,schema}.ts` — env validation, pino, drizzle conn (migrates + seeds at startup), tables
- `src/lib/streak.ts` (+ `.test.ts`) — pure streak/day logic, the only unit-tested bit
- `src/hooks.server.ts` — imports db to run migrations + seed at boot
- routes: `/` (streak + banner), `/workout` (client timer), `/history`

## Data model

- `exercises` — seeded McGill Big 3. `scheme` = reps-per-set (`"6,4,2"`), `hold_seconds`, `per_side`. **No settings UI — edit rows directly** (`pnpm dlx drizzle-kit studio`).
- `sessions` — one row per completed workout. Streak/history derived from these.

## Commands

- `pnpm dev` · `pnpm check` · `pnpm test` · `pnpm build && pnpm start`
- `pnpm db:generate` — new migration after editing `schema.ts`

## Deploy

CI (`.github/workflows/ci.yml`): check+test → build/push `ghcr.io/tionkje/painfree:latest` on push to `main`.
Prod: omv `~/painfree`, port 3002, behind Caddy at https://painfree.omv.deknudtcallens.be. Update: `docker compose pull && up -d`.

## Gotchas

- `ORIGIN` env **required** in prod — adapter-node CSRF blocks form actions (POST → 403) without it.
- better-sqlite3 is native; `onlyBuiltDependencies` in package.json allows its build under pnpm.
- Config lives in `svelte.config.js` (adapter-node), not vite.config.ts.
