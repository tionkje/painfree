# Workout Overhaul — Plan Index

> **For agentic workers:** This is the index for a 4-plan series. Implement the plans **in order** — each builds on the previous one. Use superpowers:subagent-driven-development or superpowers:executing-plans per plan.

**Goal:** Overhaul the guided workout: exercise-aware side ordering, prep countdown + distinct sounds, a fullscreen mobile session view with cues and per-side images, and always-stored sessions with per-exercise difficulty ratings and notes.

## The plans (implement in this order)

1. **`2026-07-13-workout-overhaul-1-step-engine.md`** — Exercise data + pure step engine.
   Adds `needsReposition`, `cues`, `imageLeft/imageRight` to the exercise program; extracts `buildSteps` into a tested pure module `src/lib/workout.ts`; side plank does all Left sets then all Right sets (one reposition), bird dog alternates sides with only rests.
2. **`2026-07-13-workout-overhaul-2-sounds.md`** — Prep countdown + distinct sounds.
   3s get-ready countdown on Start, audible 3-2-1 lead-in before every hold, and distinct sounds for last-rep-of-set / set-finished-needs-reposition / exercise-finished, in a tested `src/lib/client/audio.ts`.
3. **`2026-07-13-workout-overhaul-3-fullscreen-ui.md`** — Fullscreen session view.
   Fixed-position mobile view with a color-coded state banner (GET READY / GO / REST / REPOSITION / PAUSED), big non-jumping Set/Rep readouts, exercise name with side, per-side image, random cue per rep, and a "Next:" line that always names the reposition target / side switch.
4. **`2026-07-13-workout-overhaul-4-session-lifecycle.md`** — Always-stored sessions + ratings + notes.
   Sessions are created the moment the workout starts and updated (and synced) after every unit — no end-of-session save confirmation. The completion screen becomes a rating dialog (5 difficulty options per exercise + notes + Save). Ratings and notes are editable later on /settings and stored in the DB (`notes` column on `sessions`, `rating` on `session_exercises`).

Each plan produces working, testable software on its own; ship each as its own branch + PR, merging before starting the next.

## Rules that apply to every plan (from CLAUDE.md — repeated here because task executors may not see it)

- **pnpm only**, never npm. Use existing scripts: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, `pnpm format`.
- **Coverage is a hard gate:** 100% statements/functions/lines everywhere, 100% branches on all `.ts` (Svelte component branches are capped in `vite.config.ts`). Every new `.ts` module needs tests hitting every branch.
- After writing any `.ts` file, run `pnpm check` to confirm it compiles. All function arguments must have types.
- No swallowed errors: no empty catch blocks; log or rethrow.
- Component/UI tests live in `*.svelte.test.ts` inside a `describe('… brittle … safe to skip')`.
- Pre-commit runs eslint+prettier+check+test on staged files — if a commit fails, fix the reported problem, never bypass hooks.
- Offline-first: the client localStorage store is the source of truth; the server is a background sync target only. Never put a page read on the network path.
- Commit after every task with a conventional message (`feat:`, `test:`, `refactor:`).

## PR requirements for visual changes (plans 3 and 4 especially)

The user must be able to **see** the changes. For every PR whose plan touches UI:

1. Use the project's `verify` skill recipe: launch `DATABASE_PATH=$CLAUDE_JOB_DIR/tmp/verify.db pnpm dev --port 5199` in the background, read the actual port from the "Local:" log line, wait for HTTP 200 on `/workout`.
2. Drive the app with the Playwright MCP browser: navigate to `/workout` (mobile size: `browser_resize` to 390×844 first), click through the flow, and `browser_take_screenshot` at each distinct state the plan introduces (the plan lists which states).
3. Save the screenshots to `docs/pr-media/<branch-name>/*.png` and **commit them on the PR branch**.
4. Record a "video" of the auto-run: take a screenshot every second for ~30 s of a running workout (`frame_00.png` … `frame_29.png`), then assemble with `ffmpeg -framerate 2 -i docs/pr-media/<branch-name>/frame_%02d.png -pix_fmt yuv420p docs/pr-media/<branch-name>/demo.mp4` and commit the mp4 (delete the frames afterwards).
5. Embed in the PR description with raw URLs so they render:
   `![state](https://github.com/tionkje/painfree/blob/<branch-name>/docs/pr-media/<branch-name>/<file>.png?raw=true)`
   and link the mp4 the same way. Note in the PR body that `docs/pr-media/` can be dropped before merge if unwanted.

## Deliberate scope decisions (don't re-open these)

- Prep time is hardcoded at 3 s (the spec says 3 s) — no setting.
- No browser Fullscreen API — a `position: fixed; inset: 0` overlay is the "fullscreen" view (works on iOS Safari where the API doesn't).
- Sync fires after every completed unit. Payloads are tiny and offline is a no-op; no debouncing.
- A started-then-abandoned session counts toward the streak (it's stored with low completion %). This is the requested behavior ("sessions started should be stored").
- `completedAt` is set when the session **starts** (a workout is ~15 min; same day, so streak/history are unaffected).
