# Workout Overhaul 3/4 — Fullscreen Session View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a workout starts, take over the screen with a mobile-friendly session view: a color-coded state banner (GET READY / GO / REST / REPOSITION / PAUSED), big non-jumping Set/Rep readouts, the exercise name with its side, the per-side exercise image, one random form cue per rep, and a "Next:" line that always names the next reposition target or side switch.

**Architecture:** Pure presentation work on `src/routes/workout/+page.svelte` — the engine (plan 1) and sounds (plan 2) are untouched. A new `started` state splits the page into three screens: intro (Start button + instructions), session (fixed-position overlay), done (unchanged; plan 4 replaces it). Pause steps display the unit they lead into (`displayStep`), which is what makes the reposition target and side switch always visible.

**Tech Stack:** Svelte 5 runes, scoped component CSS over Pico variables. No dependencies, no browser Fullscreen API (`position: fixed; inset: 0` works everywhere including iOS Safari).

**Depends on:** Plans 1 and 2 (Step fields `kind/side/set/setCount/rep/repCount/cue`, `nextUnit`, `prep` state, audio module).

## Global Constraints

- pnpm only; use `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, `pnpm format`.
- Coverage gate: 100% statements/functions/lines (Svelte branch coverage is capped in `vite.config.ts`).
- Component tests are brittle by design: keep them in the `describe('… brittle … safe to skip')` block.
- Dynamic state classes must be a `data-mode` attribute, NOT `class="mode-{mode}"` — Svelte's scoped-CSS pruning removes class selectors it can't statically match, but keeps attribute selectors with dynamic values.
- Commit after each task.

---

### Task 1: Replace the workout page

**Files:**

- Modify: `src/routes/workout/+page.svelte` (full replacement below)

**Interfaces:**

- Consumes: `buildSteps`, `nextUnit`, `Step` from `$lib/workout`; audio functions from `$lib/client/audio`; `logSession`, `timers` as before.
- Produces: `started` state + `begin()` entry point; a `.session` element with `data-mode` ∈ `prep|active|rest|reposition|paused`. Plan 4 replaces only the `{:else if done}` branch and `finish()`.

- [ ] **Step 1: Replace the entire file with:**

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { goto as navigate } from '$app/navigation';
  import { exercises } from '$lib/exercises';
  import { buildSteps, nextUnit, type Step } from '$lib/workout';
  import { logSession } from '$lib/client/sessions.svelte';
  import { timers } from '$lib/client/settings.svelte';
  import { countdownTick, exerciseDone, holdDone, lastRep, setDone } from '$lib/client/audio';
  import type { CompletionEntry } from '$lib/sync';

  // The program is static per page load; compute the step list once.
  const steps = untrack(() => buildSteps(exercises, timers.restSeconds, timers.repositionSeconds));

  let index = $state(0);
  let remaining = $state(steps[0]?.hold ?? 0);
  let running = $state(false);
  let started = $state(false);
  let prep = $state(0);
  let done = $state(false);
  // Indices of units the user actually finished (timer hit zero, or tapped Done).
  // Skipping past a unit leaves it out, reducing that exercise's completeness.
  const completed = new SvelteSet<number>();
  let timer: ReturnType<typeof setInterval> | null = null;

  const step = $derived(steps[index]);

  // Time-remaining display. Pauses count toward the exercise they lead into
  // (buildSteps only inserts a pause before a unit, so a pause always has a
  // following unit). Tap-paced reps have no duration and count as 0s.
  const stepSlugs = steps.map(
    (s, i) => s.slug ?? steps.slice(i + 1).find((n) => n.slug)?.slug ?? null
  );
  const durations = steps.map((s) => s.hold ?? 0);
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  const currentSlug = $derived(stepSlugs[index]);
  const currentEx = $derived(exercises.find((e) => e.slug === currentSlug));
  const exerciseDuration = $derived(
    durations.reduce((t, d, j) => (stepSlugs[j] === currentSlug ? t + d : t), 0)
  );
  const exerciseLeft = $derived(
    remaining +
      durations.reduce((t, d, j) => (j > index && stepSlugs[j] === currentSlug ? t + d : t), 0)
  );
  const totalLeft = $derived(remaining + durations.reduce((t, d, j) => (j > index ? t + d : t), 0));

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // What the athlete is doing or about to do: pause steps display the unit they
  // lead into, which keeps the reposition target and side switch on screen.
  const displayStep = $derived(step.kind === 'unit' ? step : nextUnit(steps, index));
  const upcoming = $derived(displayStep ? nextUnit(steps, steps.indexOf(displayStep)) : null);

  // What the athlete should be doing RIGHT NOW, as one word.
  const mode = $derived(
    prep > 0
      ? 'prep'
      : !running && step.hold !== null
        ? 'paused'
        : step.kind === 'unit'
          ? 'active'
          : step.kind
  );
  const MODE_LABEL: Record<string, string> = {
    prep: 'GET READY',
    active: 'GO',
    rest: 'REST',
    reposition: 'REPOSITION',
    paused: 'PAUSED'
  };

  const image = $derived(
    displayStep?.side === 'Left'
      ? (currentEx?.imageLeft ?? currentEx?.image)
      : displayStep?.side === 'Right'
        ? (currentEx?.imageRight ?? currentEx?.image)
        : currentEx?.image
  );

  // "Next:" names what follows the displayed unit — the next exercise (with
  // side), a side switch, or the next rep of the same position.
  function describeNext(u: Step | null, from: Step | null): string {
    if (!u) return 'Done 🎉';
    if (u.slug !== from?.slug) return `${u.exercise}${u.side ? ` — ${u.side}` : ''}`;
    if (u.side !== from.side) return `Switch to ${u.side}`;
    return `${u.hold !== null ? 'Hold' : 'Rep'} ${u.rep}/${u.repCount}`;
  }
  const nextLabel = $derived(describeNext(upcoming, displayStep));

  // Per-exercise completion, logged to the local store on finish. Pause steps
  // have no slug, so they never count towards any exercise.
  const completion = $derived<CompletionEntry[]>(
    exercises.map((ex) => {
      const idxs = steps.map((s, i) => (s.slug === ex.slug ? i : -1)).filter((i) => i >= 0);
      return {
        slug: ex.slug,
        unit: ex.mode === 'hold' ? 'hold' : 'rep',
        target: idxs.length,
        completed: idxs.filter((i) => completed.has(i)).length
      };
    })
  );

  // Local-first: write the session to the store (which syncs in the background)
  // and go straight to history — no network round-trip on the completion path.
  function finish() {
    logSession(completion);
    void navigate('/history');
  }

  function markDone() {
    completed.add(index);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
    prep = 0;
  }

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

  // Intro → session. A tap-paced first step just shows its Done button.
  function begin() {
    started = true;
    if (step.hold !== null) start();
  }

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

  const next = () => goto(index + 1);
  const back = () => goto(index - 1);
</script>

{#if steps.length === 0}
  <p>No exercises configured.</p>
{:else if done}
  <article style="text-align:center">
    <h2>🎉 Session complete</h2>
    <button onclick={finish}>Log it & view history</button>
  </article>
{:else if !started}
  <h1>Workout</h1>
  <article>
    <hgroup>
      <h2>{exercises.map((e) => e.name).join(' · ')}</h2>
      <p>{fmt(totalDuration)} total</p>
    </hgroup>
    <button class="start-big" onclick={begin}>Start workout</button>
  </article>

  <details>
    <summary>Exercise instructions</summary>
    {#each exercises as ex (ex.slug)}
      <article>
        <hgroup>
          <h3 style="margin-bottom:0">{ex.name}</h3>
          <p>
            {ex.scheme}{ex.perSide ? ', each side' : ''}{ex.mode === 'hold'
              ? `, ${ex.holdSeconds}s holds`
              : ', reps'}
          </p>
        </hgroup>
        <img src={ex.image} alt="How to perform the {ex.name}" style="max-width:100%" />
        <p>{ex.description}</p>
        <details>
          <summary>More detail</summary>
          <p>{ex.details}</p>
          {#if ex.video}
            <p><a href={ex.video} target="_blank" rel="noopener">▶ Watch a video</a></p>
          {/if}
        </details>
      </article>
    {/each}
  </details>
{:else}
  <div class="session" data-mode={mode}>
    <div class="banner">{MODE_LABEL[mode]}</div>
    <hgroup class="who">
      <h2>{displayStep?.exercise}{displayStep?.side ? ` — ${displayStep.side}` : ''}</h2>
      <p class="next">Next: {nextLabel}</p>
    </hgroup>

    <div class="counts">
      <div><small>Set</small><strong>{displayStep?.set}/{displayStep?.setCount}</strong></div>
      <div>
        <small>{displayStep?.hold !== null ? 'Hold' : 'Rep'}</small>
        <strong>{displayStep?.rep}/{displayStep?.repCount}</strong>
      </div>
    </div>

    <p class="big-timer">{prep > 0 ? prep : step.hold === null ? '✓' : remaining}</p>
    {#if step.hold !== null && prep === 0}
      <progress value={step.hold - remaining} max={step.hold}></progress>
    {/if}

    {#if image}
      <img src={image} alt="How to perform the {displayStep?.exercise}" />
    {/if}
    <p class="cue">{displayStep?.cue ? `💡 ${displayStep.cue}` : ''}</p>

    <div class="grid controls">
      {#if step.hold === null}
        <button onclick={repDone}>Done ✓</button>
      {:else if running}
        <button class="secondary" onclick={stop}>Pause</button>
      {:else}
        <button onclick={start}>Start</button>
      {/if}
      <button class="outline" onclick={next}>Skip →</button>
    </div>
    <button class="outline secondary" onclick={back} disabled={index === 0}>← Back</button>

    <footer>
      <div class="time-row">
        <span>Exercise</span>
        <strong>{fmt(exerciseLeft)}</strong>
      </div>
      <progress value={exerciseDuration - exerciseLeft} max={exerciseDuration}></progress>
      <div class="time-row">
        <span>Total</span>
        <strong>{fmt(totalLeft)}</strong>
      </div>
      <progress value={totalDuration - totalLeft} max={totalDuration}></progress>
      <small>Step {index + 1} of {steps.length}</small>
    </footer>
  </div>
{/if}

<style>
  .start-big {
    width: 100%;
    font-size: 1.4rem;
  }
  .session {
    /* "Fullscreen": a fixed overlay beats the Fullscreen API (works on iOS). */
    position: fixed;
    inset: 0;
    z-index: 10;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 1rem;
    background: var(--pico-background-color);
    text-align: center;
    --state: #6c757d; /* prep + paused grey */
  }
  .session[data-mode='active'] {
    --state: #2e7d32; /* go green */
  }
  .session[data-mode='rest'] {
    --state: #b58900; /* rest amber */
  }
  .session[data-mode='reposition'] {
    --state: #1565c0; /* reposition blue */
  }
  .banner {
    width: 100%;
    padding: 0.4rem;
    border-radius: var(--pico-border-radius);
    font-weight: 700;
    letter-spacing: 0.25em;
    color: #fff;
    background: var(--state);
  }
  .who {
    margin-bottom: 0;
  }
  .next {
    color: var(--pico-muted-color);
  }
  /* Fixed two-column grid + tabular digits: Set stays left, Hold/Rep stays
     right, and the numbers never shift position during the session. */
  .counts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
    max-width: 22rem;
    font-variant-numeric: tabular-nums;
  }
  .counts small {
    display: block;
    color: var(--pico-muted-color);
  }
  .counts strong {
    font-size: 2.2rem;
  }
  .big-timer {
    font-size: clamp(4rem, 28vw, 8rem);
    line-height: 1;
    margin: 0;
    font-variant-numeric: tabular-nums;
    color: var(--state);
  }
  .session img {
    max-height: 18vh;
    max-width: 100%;
  }
  /* Reserve the cue's space so the layout never jumps between reps. */
  .cue {
    min-height: 2.6rem;
    margin: 0;
  }
  .controls {
    width: 100%;
    max-width: 22rem;
  }
  .session footer {
    width: 100%;
    max-width: 26rem;
    margin-top: auto;
  }
  .time-row {
    display: flex;
    justify-content: space-between;
  }
</style>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm check`
Expected: clean. (If `css-unused-selector` warnings appear, a selector doesn't match the markup — fix the markup/selector, don't suppress.)

---

### Task 2: Rewrite the page tests

**Files:**

- Modify: `src/routes/workout/page.svelte.test.ts` (full replacement below)

- [ ] **Step 1: Replace the entire file with:**

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { Exercise } from '$lib/exercises';

// The program + timers are read from modules (checked-in program, localStorage
// timers). Inject both via mocks whose backing objects we mutate per test.
const hoisted = vi.hoisted(() => ({
  program: [] as Exercise[],
  timers: { restSeconds: 1, repositionSeconds: 1 }
}));
vi.mock('$lib/exercises', () => ({ exercises: hoisted.program }));
vi.mock('$lib/client/settings.svelte', () => ({ timers: hoisted.timers }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/client/sessions.svelte', () => ({ logSession: vi.fn() }));

import Page from './+page.svelte';
import { goto } from '$app/navigation';
import { logSession } from '$lib/client/sessions.svelte';

function ex(partial: Partial<Exercise> & Pick<Exercise, 'slug'>): Exercise {
  return {
    name: partial.slug.toUpperCase(),
    description: `desc ${partial.slug}`,
    details: `details ${partial.slug}`,
    image: `/exercises/${partial.slug}.svg`,
    mode: 'hold',
    scheme: '1',
    holdSeconds: 1,
    perSide: false,
    needsReposition: false,
    cues: [],
    ...partial
  };
}

// A: one set of two 2s holds (rest between); B: side-plank-like per-side with
// repositioning and per-side images.
// Steps: A·1/2, Rest, A·2/2, Reposition, B·Left, Reposition, B·Right.
const program: Exercise[] = [
  ex({
    slug: 'a',
    scheme: '2',
    holdSeconds: 2,
    cues: ['brace hard'],
    video: 'https://youtu.be/demo'
  }),
  ex({
    slug: 'b',
    perSide: true,
    needsReposition: true,
    imageLeft: '/exercises/b-left.svg',
    imageRight: '/exercises/b-right.svg'
  })
];

function renderPage(list: Exercise[] = program, rest = 1, reposition = 1) {
  hoisted.program.length = 0;
  hoisted.program.push(...list);
  hoisted.timers.restSeconds = rest;
  hoisted.timers.repositionSeconds = reposition;
  return render(Page);
}

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

const mode = () => document.querySelector('.session')?.getAttribute('data-mode');
const begin = () => fireEvent.click(screen.getByRole('button', { name: 'Start workout' }));

describe('workout page (brittle component UI - safe to skip)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudio);
    vi.stubGlobal('navigator', { vibrate });
    freqs.length = 0;
    vibrate.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.mocked(goto).mockClear();
    vi.mocked(logSession).mockClear();
  });

  test('shows an empty state when there are no exercises', () => {
    renderPage([]);
    expect(screen.getByText(/No exercises configured/)).toBeInTheDocument();
  });

  test('intro screen shows the program and instructions, no session view', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeInTheDocument();
    expect(document.querySelector('.session')).toBeNull();
    expect(screen.getByText(/each side/)).toBeInTheDocument();
    expect(screen.getAllByText('More detail')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Watch a video/ })).toBeInTheDocument();
  });

  test('begin opens the session view: prep, then active, big readouts + cue', async () => {
    renderPage();
    await begin();
    expect(mode()).toBe('prep');
    expect(screen.getByText('GET READY')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument(); // Set 1/1
    expect(screen.getByText('1/2')).toBeInTheDocument(); // Hold 1/2
    expect(screen.getByText('💡 brace hard')).toBeInTheDocument();
    expect(screen.getByText('Next: Hold 2/2')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3000);
    expect(mode()).toBe('active');
    expect(screen.getByText('GO')).toBeInTheDocument();
  });

  test('rest and reposition display the upcoming unit, side switch and image', async () => {
    renderPage();
    await begin();
    await vi.advanceTimersByTimeAsync(5000); // 3s prep + 2s hold → Rest before A 2/2
    expect(mode()).toBe('rest');
    expect(screen.getByText('REST')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('Next: B — Left')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3000); // rest 1s + hold 2s → Reposition into B·Left
    expect(mode()).toBe('reposition');
    expect(screen.getByText('REPOSITION')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'B — Left', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Next: Switch to Right')).toBeInTheDocument();
    expect(document.querySelector('.session img')?.getAttribute('src')).toBe(
      '/exercises/b-left.svg'
    );

    await vi.advanceTimersByTimeAsync(2000); // repo 1s + B·Left 1s → Reposition into B·Right
    expect(screen.getByRole('heading', { name: 'B — Right', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Next: Done 🎉')).toBeInTheDocument();
    expect(document.querySelector('.session img')?.getAttribute('src')).toBe(
      '/exercises/b-right.svg'
    );
  });

  test('set/rep readouts keep their grid slots across steps', async () => {
    renderPage();
    await begin();
    const cells = () => [...document.querySelectorAll('.counts small')].map((el) => el.textContent);
    expect(cells()).toEqual(['Set', 'Hold']);
    await vi.advanceTimersByTimeAsync(5000); // into the Rest pause
    expect(cells()).toEqual(['Set', 'Hold']);
  });

  test('pause shows PAUSED and Start resumes', async () => {
    renderPage();
    await begin();
    await fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mode()).toBe('paused');
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  test('resuming during a pause step skips the prep countdown', async () => {
    renderPage();
    await begin();
    await vi.advanceTimersByTimeAsync(5000); // on the Rest step
    await fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(mode()).toBe('rest');
  });

  test('start preps 3s, then auto-runs the workout with distinct sounds', async () => {
    renderPage();
    await begin();
    expect(mode()).toBe('prep');
    expect(freqs).toEqual([660]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(freqs).toEqual([660, 660, 660]);

    await vi.advanceTimersByTimeAsync(3000); // prep expires + A's first hold ends
    expect(mode()).toBe('rest');
    expect(freqs.slice(3)).toEqual([880]); // plain hold-done
    expect(vibrate).toHaveBeenCalledWith(200);

    await vi.advanceTimersByTimeAsync(1000); // rest over → set's final rep starts
    expect(freqs.slice(4)).toEqual([880, 880]); // last-rep heads-up

    await vi.advanceTimersByTimeAsync(2000); // A finishes
    expect(freqs.slice(6)).toEqual([660, 880, 1100]); // exercise done

    await vi.advanceTimersByTimeAsync(2000); // reposition + B·Left
    expect(freqs.slice(9)).toEqual([880, 660]); // set done → reposition

    await vi.advanceTimersByTimeAsync(2000); // reposition + B·Right → complete
    expect(freqs.slice(11)).toEqual([660, 880, 1100]);
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('zero pause times produce a holds-only program', async () => {
    renderPage(program, 0, 0);
    await begin();
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
  });

  test('a no-reposition per-side exercise alternates sides with rests only', async () => {
    renderPage([ex({ slug: 'alt', scheme: '2', perSide: true, needsReposition: false })]);
    await begin();
    // L, Rest, R, Rest, L, Rest, R — 7 steps, no repositions.
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ALT — Left', level: 2 })).toBeInTheDocument();
  });

  test('skip and back navigate; skipping to the end completes and logs', async () => {
    renderPage(program, 0, 0); // holds only: A, A, B·L, B·R
    await begin();
    expect(screen.getByRole('button', { name: '← Back' })).toBeDisabled();
    const skip = () => fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));

    await skip();
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();

    for (let i = 0; i < 4; i++) await skip();
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /Log it/ }));
    expect(vi.mocked(logSession).mock.calls[0][0]).toEqual([
      { slug: 'a', unit: 'hold', target: 2, completed: 0 },
      { slug: 'b', unit: 'hold', target: 2, completed: 0 }
    ]);
    expect(goto).toHaveBeenCalledWith('/history');
  });

  test('tap-paced reps show Done and advance without a timer', async () => {
    renderPage([ex({ slug: 'r', mode: 'reps', scheme: '2', holdSeconds: undefined })]);
    await begin(); // first step is a rep → no timer starts
    expect(mode()).toBe('active');
    expect(screen.getByText('✓')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText('2/2')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('auto-run halts on a rep and resumes when Done is tapped', async () => {
    const mixed: Exercise[] = [
      ex({ slug: 'h1' }),
      ex({ slug: 'r', mode: 'reps', holdSeconds: undefined }),
      ex({ slug: 'h2' })
    ];
    renderPage(mixed); // steps: h1, r, Reposition, h2
    await begin();
    await vi.advanceTimersByTimeAsync(4000); // 3s prep + 1s hold → halted on the rep
    expect(screen.getByRole('button', { name: 'Done ✓' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(mode()).toBe('reposition');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000); // reposition 1s + h2 1s
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm test src/routes/workout/page.svelte.test.ts`
Expected: PASS (13 tests). If an assertion about text fails, check the rendered output with `screen.debug()` and align the assertion with the template from Task 1 — do not change the template's information content.

- [ ] **Step 3: Full gates**

Run: `pnpm format && pnpm lint && pnpm check && pnpm test:coverage`
Expected: clean, thresholds met.

- [ ] **Step 4: Commit**

```bash
git add src/routes/workout/+page.svelte src/routes/workout/page.svelte.test.ts
git commit -m "feat: fullscreen mobile session view with state banner, cues and side images"
```

---

### Task 3: Screenshots + video for the PR, then ship

This plan is almost entirely visual — the PR media is **required**, not optional.

- [ ] **Step 1: Launch and drive the app** (see the index doc's "PR requirements" and the `verify` skill)

Capture at mobile size (`browser_resize` 390×844) into `docs/pr-media/<branch>/`:

1. `intro.png` — the Start-workout screen
2. `prep.png` — GET READY (grey banner, big 3/2/1)
3. `active.png` — GO (green) during a curl-up hold, cue visible
4. `rest.png` — REST (amber) showing the upcoming unit
5. `reposition.png` — REPOSITION (blue) before a side-plank Right, mirrored image + "Switch to Right"
6. `paused.png` — PAUSED (grey)
7. `demo.mp4` — 1 screenshot/second for ~30 s of the auto-run, assembled with `ffmpeg -framerate 2 -i frame_%02d.png -pix_fmt yuv420p demo.mp4` (then delete the frames)

Timer states are real-time: click Start, `sleep N`, screenshot.

- [ ] **Step 2: Commit media, push, open a draft PR**

```bash
git add docs/pr-media
git commit -m "docs: PR screenshots + demo video"
git push -u origin HEAD
```

Open the PR with `gh pr create --draft`, embedding every image via
`![name](https://github.com/tionkje/painfree/blob/<branch>/docs/pr-media/<branch>/<name>.png?raw=true)`
plus a link to `demo.mp4`, a summary of the view states, and the footer
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
