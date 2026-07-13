# Workout Overhaul 2/4 — Prep Countdown + Distinct Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing Start gives a 3-second get-ready countdown with audible ticks; every rest/reposition pause ticks its last 3 seconds; and unit completions play distinct sounds — plain hold-done, last-rep-of-set heads-up, set-finished-reposition-next, and exercise-finished.

**Architecture:** A new `src/lib/client/audio.ts` owns all Web Audio blips (one lazily-created shared `AudioContext`, everything wrapped so blocked audio never breaks the timer). The workout page replaces its inline `beep()` with calls to that module and gains a `prep` countdown state driven by the existing 1 s `setInterval`.

**Tech Stack:** Web Audio API (`AudioContext` + `OscillatorNode` — no new dependencies), `navigator.vibrate`, Vitest with stubbed globals.

**Depends on:** Plan 1 (`$lib/workout`'s `Step.kind`, `rep`, `repCount`, and `nextUnit`).

## Global Constraints

- pnpm only; use `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, `pnpm format`.
- Coverage gate: 100% statements/functions/lines; 100% branches on `.ts` files — `audio.ts` needs its blocked-context and missing-vibrate branches tested.
- All function arguments typed; run `pnpm check` after writing `.ts`.
- No swallowed errors: the audio catch must `console.warn` the error.
- Commit after each task.

## Sound vocabulary (referenced by every task)

| Event                                         | Function          | Notes played (Hz)            | Vibration |
| --------------------------------------------- | ----------------- | ---------------------------- | --------- |
| Each get-ready / lead-in second               | `countdownTick()` | 660 short                    | none      |
| Hold done, more of the set left               | `holdDone()`      | 880                          | 200 ms    |
| The rep that just started is the set's last   | `lastRep()`       | 880, 880 (double blip)       | 200 ms    |
| Set finished — reposition next                | `setDone()`       | 880 → 660 (descending)       | 300 ms    |
| Exercise finished (also fires on workout end) | `exerciseDone()`  | 660 → 880 → 1100 (ascending) | 500 ms    |

---

### Task 1: The audio module

**Files:**

- Create: `src/lib/client/audio.ts`
- Test: `src/lib/client/audio.test.ts`

**Interfaces:**

- Produces: `countdownTick(): void`, `holdDone(): void`, `lastRep(): void`, `setDone(): void`, `exerciseDone(): void` — all fire-and-forget, never throw.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/client/audio.test.ts`. The module caches one `AudioContext`, so every test re-imports a fresh copy via `vi.resetModules()`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

type Osc = {
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

// The module caches its AudioContext across calls; reset modules so each test
// gets a fresh, un-cached copy wired to that test's stubs.
async function load(): Promise<typeof import('./audio')> {
  vi.resetModules();
  return await import('./audio');
}

function stubAudio(): Osc[] {
  const oscs: Osc[] = [];
  class FakeAudio {
    currentTime = 1;
    destination = {};
    createOscillator(): Osc {
      const osc: Osc = { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscs.push(osc);
      return osc;
    }
  }
  vi.stubGlobal('AudioContext', FakeAudio);
  return oscs;
}

describe('audio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('plays the documented tone sequences and vibrates', async () => {
    const oscs = stubAudio();
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const audio = await load();

    audio.holdDone();
    expect(oscs.map((o) => o.frequency.value)).toEqual([880]);
    expect(oscs[0].start).toHaveBeenCalledWith(1);
    expect(oscs[0].stop).toHaveBeenCalledWith(1.15);
    expect(vibrate).toHaveBeenCalledWith(200);

    oscs.length = 0;
    audio.lastRep();
    expect(oscs.map((o) => o.frequency.value)).toEqual([880, 880]);

    oscs.length = 0;
    audio.setDone();
    expect(oscs.map((o) => o.frequency.value)).toEqual([880, 660]);

    oscs.length = 0;
    audio.exerciseDone();
    expect(oscs.map((o) => o.frequency.value)).toEqual([660, 880, 1100]);
  });

  it('countdownTick plays a short low tick without vibrating', async () => {
    const oscs = stubAudio();
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const audio = await load();
    audio.countdownTick();
    expect(oscs.map((o) => o.frequency.value)).toEqual([660]);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('reuses a single AudioContext across calls', async () => {
    let instances = 0;
    class FakeAudio {
      currentTime = 0;
      destination = {};
      constructor() {
        instances += 1;
      }
      createOscillator(): Osc {
        return { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      }
    }
    vi.stubGlobal('AudioContext', FakeAudio);
    vi.stubGlobal('navigator', {});
    const audio = await load();
    audio.holdDone();
    audio.holdDone();
    expect(instances).toBe(1);
  });

  it('survives a blocked AudioContext and a missing vibrate', async () => {
    class Blocked {
      constructor() {
        throw new Error('blocked');
      }
    }
    vi.stubGlobal('AudioContext', Blocked);
    vi.stubGlobal('navigator', {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audio = await load();
    expect(() => audio.holdDone()).not.toThrow();
    expect(warn).toHaveBeenCalledWith('audio failed', expect.any(Error));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/client/audio.test.ts`
Expected: FAIL — `Cannot find module './audio'`.

- [ ] **Step 3: Implement `src/lib/client/audio.ts`**

```ts
// Web-audio blips for the auto-run workout. Fire-and-forget: a blocked
// AudioContext must never break the timer, so play() catches and warns.
// One shared context (created lazily on the first user-triggered sound, so
// autoplay policies allow it) instead of one per blip.

type Note = [freq: number, at: number, dur: number];

let ctx: AudioContext | null = null;

function play(notes: Note[], vibrateMs: number): void {
  try {
    ctx ??= new AudioContext();
    for (const [freq, at, dur] of notes) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + dur);
    }
  } catch (e) {
    console.warn('audio failed', e);
  }
  if (vibrateMs > 0) navigator.vibrate?.(vibrateMs);
}

/** Short low tick for each get-ready / lead-in second before a hold. */
export function countdownTick(): void {
  play([[660, 0, 0.1]], 0);
}

/** A hold finished; more of the same set to come. */
export function holdDone(): void {
  play([[880, 0, 0.15]], 200);
}

/** Heads-up: the rep that just started is the last one of its set. */
export function lastRep(): void {
  play(
    [
      [880, 0, 0.1],
      [880, 0.15, 0.1]
    ],
    200
  );
}

/** Set finished — reposition next. Descending pair. */
export function setDone(): void {
  play(
    [
      [880, 0, 0.15],
      [660, 0.2, 0.3]
    ],
    300
  );
}

/** Whole exercise finished (also marks the end of the workout). Ascending triad. */
export function exerciseDone(): void {
  play(
    [
      [660, 0, 0.12],
      [880, 0.15, 0.12],
      [1100, 0.3, 0.35]
    ],
    500
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test src/lib/client/audio.test.ts` — Expected: PASS (4 tests).
Run: `pnpm check` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/audio.ts src/lib/client/audio.test.ts
git commit -m "feat: workout sound vocabulary (countdown, hold/set/exercise done)"
```

---

### Task 2: Wire prep countdown and sounds into the workout page

**Files:**

- Modify: `src/routes/workout/+page.svelte`
- Test: `src/routes/workout/page.svelte.test.ts`

**Interfaces:**

- Consumes: everything from Task 1 plus `nextUnit` from `$lib/workout` (plan 1).
- Produces: page state `prep: number` (>0 while getting ready) — plan 3's UI reads it.

**Behaviour being implemented:**

- Pressing Start on a timed unit sets `prep = 3` and ticks; the next two seconds tick; the hold's own countdown only begins after prep hits 0. Pressing Start during a rest/reposition does not prep (the pause is the preparation).
- During rest/reposition steps, the last 3 seconds each play `countdownTick()` — the audible "get ready to start" lead-in.
- When a timed unit finishes: `exerciseDone()` if the next unit is a different exercise (or nothing is left), `setDone()` if the very next step is a reposition (same exercise, side switch), otherwise `holdDone()`. Tap-paced reps trigger the same logic on Done.
- When the timer lands on a unit that is the last rep of a multi-rep set, `lastRep()` fires as a heads-up.

- [ ] **Step 1: Update the script**

In `src/routes/workout/+page.svelte`:

1. Change the workout import and add the audio import:

```ts
import { buildSteps, nextUnit } from '$lib/workout';
import { countdownTick, exerciseDone, holdDone, lastRep, setDone } from '$lib/client/audio';
```

2. Add the prep state next to the other `$state` declarations:

```ts
let prep = $state(0);
```

3. Delete the whole `function beep() { … }` (including its `try/catch` and the `navigator.vibrate?.(200);` line).

4. Replace `tick()` and `start()` with:

```ts
// One start runs the whole workout: hitting zero rolls straight into the
// next step; the timer only stops on pause, a tap-rep, or completion. The
// first `prep` ticks after a Start press count down the get-ready phase
// before the hold's own clock begins.
function tick() {
  if (prep > 0) {
    prep -= 1;
    if (prep > 0) countdownTick();
    return;
  }
  remaining -= 1;
  if (remaining > 0) {
    // Audible 3-2-1 lead-in to the next hold during rest/reposition.
    if (step.kind !== 'unit' && remaining <= 3) countdownTick();
    return;
  }
  if (step.kind === 'unit') {
    markDone();
    finishSound();
  }
  next();
}

// Distinct completion sounds: exercise finished > set finished (reposition
// next) > plain hold done. The last-rep heads-up fires in goto().
function finishSound() {
  const upcoming = nextUnit(steps, index);
  if (!upcoming || upcoming.slug !== step.slug) exerciseDone();
  else if (steps[index + 1]?.kind === 'reposition') setDone();
  else holdDone();
}

function start() {
  running = true;
  // 3s get-ready before a hold; pauses are their own preparation.
  if (step.kind === 'unit' && step.hold !== null) {
    prep = 3;
    countdownTick();
  }
  timer = setInterval(tick, 1000);
}
```

5. Replace `repDone()` and `goto()` with:

```ts
// Reps have no timer: tapping Done counts the rep and advances, resuming the
// auto-run when the next step is timed.
function repDone() {
  markDone();
  finishSound();
  next();
  if (!done && !running && step.hold !== null) start();
}

// Manual skip/back keeps a running timer running; landing on a tap-paced rep
// halts it until Done is tapped.
function goto(i: number) {
  if (i >= steps.length) {
    stop();
    done = true;
    return;
  }
  prep = 0;
  index = Math.max(0, i);
  remaining = steps[index].hold ?? 0;
  if (steps[index].hold === null) stop();
  const s = steps[index];
  // Heads-up when the final rep of a multi-rep set starts mid-run.
  if (running && s.kind === 'unit' && s.rep === s.repCount && s.repCount > 1) lastRep();
}
```

- [ ] **Step 2: Show the prep countdown in the template**

Replace the timer block

```svelte
{#if step.hold === null}
  <p class="timer">✓</p>
{:else}
  <p class="timer" class:running>{remaining}</p>
  <progress value={step.hold - remaining} max={step.hold}></progress>
{/if}
```

with:

```svelte
{#if step.hold === null}
  <p class="timer">✓</p>
{:else if prep > 0}
  <p class="timer">{prep}</p>
  <p>Get ready…</p>
{:else}
  <p class="timer" class:running>{remaining}</p>
  <progress value={step.hold - remaining} max={step.hold}></progress>
{/if}
```

- [ ] **Step 3: Update the page tests**

In `src/routes/workout/page.svelte.test.ts`:

1. Replace the `function stubAudio() { … }` helper with a file-level recorder (the audio module caches its `AudioContext`, so one stable stub must serve the whole file):

```ts
// audio.ts caches one AudioContext, so stub it once at file level and record
// every played frequency; beforeEach clears the recording.
const freqs: number[] = [];
const vibrate = vi.fn();
class FakeAudio {
  currentTime = 0;
  destination = {};
  createOscillator() {
    const osc = {
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(() => freqs.push(osc.frequency.value)),
      stop: vi.fn()
    };
    return osc;
  }
}
```

2. Update the `beforeEach` to install the stubs and clear the recording:

```ts
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', FakeAudio);
  vi.stubGlobal('navigator', { vibrate });
  freqs.length = 0;
  vibrate.mockClear();
});
```

(Keep the existing `afterEach` as-is; it already unstubs globals.)

3. **Delete** the test `'beep survives a blocked AudioContext and a missing vibrate'` — the page no longer owns that branch; `audio.test.ts` covers it.

4. Remove any remaining `stubAudio()` calls inside tests (e.g. in `'auto-run halts on a rep …'`) — the beforeEach stub covers them.

5. **Replace** the test `'one start runs the whole workout through rests to completion'` with:

```ts
test('start preps 3s, then auto-runs the workout with distinct sounds', async () => {
  renderPage();
  await fireEvent.click(screen.getByRole('button', { name: 'Start' }));

  // Get-ready countdown: tick at the press, then at 1s and 2s.
  expect(screen.getByText('Get ready…')).toBeInTheDocument();
  expect(freqs).toEqual([660]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(freqs).toEqual([660, 660, 660]);

  // Prep expires, then A's first 2s hold runs out → plain hold-done.
  await vi.advanceTimersByTimeAsync(3000);
  expect(screen.queryByText('Get ready…')).not.toBeInTheDocument();
  expect(freqs.slice(3)).toEqual([880]);
  expect(vibrate).toHaveBeenCalledWith(200);
  expect(screen.getByText(/^Rest — /)).toBeInTheDocument();

  // Rest over → landing on the set's final rep → double-blip heads-up.
  await vi.advanceTimersByTimeAsync(1000);
  expect(freqs.slice(4)).toEqual([880, 880]);

  // A finishes → ascending exercise-done triad.
  await vi.advanceTimersByTimeAsync(2000);
  expect(freqs.slice(6)).toEqual([660, 880, 1100]);

  // Reposition + B·Left → descending set-done (reposition to the other side).
  await vi.advanceTimersByTimeAsync(2000);
  expect(freqs.slice(9)).toEqual([880, 660]);

  // Reposition + B·Right → workout complete with the exercise-done triad.
  await vi.advanceTimersByTimeAsync(2000);
  expect(freqs.slice(11)).toEqual([660, 880, 1100]);
  expect(screen.getByText(/Session complete/)).toBeInTheDocument();

  await fireEvent.click(screen.getByRole('button', { name: /Log it/ }));
  expect(vi.mocked(logSession).mock.calls[0][0]).toEqual([
    { slug: 'a', unit: 'hold', target: 2, completed: 2 },
    { slug: 'b', unit: 'hold', target: 2, completed: 2 }
  ]);
  expect(goto).toHaveBeenCalledWith('/history');
});
```

6. In the test `'auto-run halts on a rep and resumes when Done is tapped'`, change the first `await vi.advanceTimersByTimeAsync(1000);` to `await vi.advanceTimersByTimeAsync(4000);` (3 s prep + the 1 s hold) and update its inline comment accordingly. The rest of that test is unchanged — resuming after the rep lands on a reposition pause, which does not prep.

7. Add a test that Start during a pause does not prep:

```ts
test('start during a rest/reposition pause skips the prep countdown', async () => {
  renderPage();
  await fireEvent.click(screen.getByRole('button', { name: 'Skip →' })); // on the Rest step
  await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  expect(screen.queryByText('Get ready…')).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run the full gates**

Run: `pnpm check` — Expected: clean.
Run: `pnpm test` — Expected: all PASS.
Run: `pnpm test:coverage` — Expected: thresholds met (audio.ts fully covered).

- [ ] **Step 5: Commit**

```bash
git add src/routes/workout/+page.svelte src/routes/workout/page.svelte.test.ts
git commit -m "feat: 3s prep countdown and distinct workout sounds"
```

---

### Task 3: Ship it

- [ ] **Step 1: Full verification**

Run: `pnpm format && pnpm lint && pnpm check && pnpm test:coverage`
Expected: all clean.

- [ ] **Step 2: Manual sanity check**

Follow the index doc's "PR requirements": run the app, press Start, confirm you hear three ticks then the hold begins; let a side-plank set finish and confirm the descending set-done sound before the reposition. Screenshot the "Get ready…" state for the PR.

- [ ] **Step 3: Push branch, open a draft PR**

```bash
git push -u origin HEAD
gh pr create --draft --title "Workout: 3s prep countdown + distinct sounds" --body-file <(printf '%s\n' "Plan 2/4 of the workout overhaul (see docs/superpowers/plans/2026-07-13-workout-overhaul-0-index.md)." "" "- Start gives a 3s get-ready countdown with ticks" "- Rest/reposition pauses tick their last 3 seconds" "- Distinct sounds: hold done / last rep of set / set done (reposition) / exercise done" "" "![get ready](https://github.com/tionkje/painfree/blob/<branch>/docs/pr-media/<branch>/prep.png?raw=true)" "" "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```
