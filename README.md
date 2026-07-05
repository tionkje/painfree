# painfree

A dead-simple daily back-exercise tracker. v1 is the **McGill Big 3** (curl-up,
side plank, bird dog) — a timer to guide the holds and a history/streak to nag
you into doing it every day. Runs on a home lab behind Tailscale, so no auth.

## Stack

SvelteKit (adapter-node) · SQLite + Drizzle ORM · Pino · Zod (env validation) · Pico CSS (dark/light).

## Develop

```sh
pnpm install
pnpm dev
```

- `pnpm test` — streak logic unit tests
- `pnpm check` — svelte-check / typecheck
- `pnpm build && pnpm start` — production build

DB migrations + the McGill Big 3 seed run automatically on server startup.

## Editing the program

There's no settings UI (YAGNI). The program lives in the `exercises` table —
edit rows directly (`scheme` is reps-per-set like `6,4,2`, `hold_seconds` the
hold length). Open the DB with `pnpm dlx drizzle-kit studio` or any SQLite tool.

## Environment

| var             | default              | note                                                                                               |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_PATH` | `./data/painfree.db` | SQLite file location                                                                               |
| `LOG_LEVEL`     | `info`               | pino level                                                                                         |
| `ORIGIN`        | —                    | required behind a reverse proxy (adapter-node CSRF), e.g. `https://painfree.omv.deknudtcallens.be` |

## Deploy

CI builds and pushes `ghcr.io/tionkje/painfree:latest` on every push to `main`.
On the server:

```sh
cd ~/painfree
docker compose pull && docker compose up -d
```
