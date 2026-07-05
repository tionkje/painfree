# CLAUDE.md

Daily back-exercise tracker. v1 = McGill Big 3 (curl-up, side plank, bird dog):
guided hold timer + history/streak to nag daily. No auth (tailscale-gated).

## Stack

SvelteKit (adapter-node) · SQLite + Drizzle · Pino · Zod (startup env validation) · Pico CSS (dark/light).

## Layout

- `src/lib/server/{env,logger,db,schema}.ts` — env validation, pino, drizzle conn (migrates at startup), tables
- `src/lib/exercises.ts` — the exercise program (checked-in data + `static/exercises/*.svg` visuals)
- `src/lib/streak.ts` (+ `.test.ts`) — pure streak/day logic, the only unit-tested bit
- `src/hooks.server.ts` — imports db to run migrations at boot
- routes: `/` (streak + banner), `/workout` (client timer), `/history`

## Data model

- The exercise program is **checked in**, not in the DB: `src/lib/exercises.ts` (`scheme` reps-per-set `"6,4,2"`, `holdSeconds`, `perSide`, `description`, `details`, `image`, optional `video`). Visuals are SVGs in `static/exercises/<slug>.svg`. Array order = workout order. Edit the file to change the program.
- `sessions` — the only DB table. One row per completed workout. Streak/history derived from these.

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

- `ORIGIN` env **required** in prod — adapter-node CSRF blocks form actions (POST → 403) without it.
- better-sqlite3 is native; `onlyBuiltDependencies` in package.json allows its build under pnpm.
- Config lives in `svelte.config.js` (adapter-node), not vite.config.ts.
