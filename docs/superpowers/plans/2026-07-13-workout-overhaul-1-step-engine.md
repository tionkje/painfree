# Workout Overhaul 1/4 — Exercise Data + Step Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repositioning an exercise-level property (side plank groups all Left sets then all Right sets; bird dog alternates sides with only rests), add per-exercise form cues and per-side images to the program data, and extract the step-building logic into a tested pure module.

**Architecture:** `src/lib/exercises.ts` (checked-in program data) gains `needsReposition`, `cues`, `imageLeft`, `imageRight`. The `buildSteps` function currently inlined in `src/routes/workout/+page.svelte` moves to a new pure module `src/lib/workout.ts` with a richer `Step` type (kind/side/set/rep/cue) that later plans build on. The page is rewired to import it; its rendering stays byte-identical.

**Tech Stack:** SvelteKit (SPA, SSR off), TypeScript, Vitest.

## Global Constraints

- pnpm only; use `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, `pnpm format`.
- Coverage gate: 100% statements/functions/lines; 100% branches on `.ts` files.
- All function arguments typed; run `pnpm check` after writing `.ts`.
- Commit after each task; pre-commit hooks run lint+check+test — never bypass them.

---

### Task 1: Extend the Exercise type and program data

**Files:**

- Modify: `src/lib/exercises.ts`
- Test: `src/lib/exercises.test.ts`

**Interfaces:**

- Produces: `Exercise` type with new required fields `needsReposition: boolean`, `cues: string[]` and optional `imageLeft?: string`, `imageRight?: string`. All later tasks and plans rely on these exact names.

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe('exercises program', …)` block in `src/lib/exercises.test.ts`:

```ts
it('carries form cues, reposition flags and per-side visuals', () => {
  for (const e of exercises) {
    expect(e.cues.length).toBeGreaterThanOrEqual(3);
    if (e.perSide) {
      expect(e.imageLeft).toBeTruthy();
      expect(e.imageRight).toBeTruthy();
    }
  }
  // Side plank needs repositioning between sides; bird dog alternates freely.
  expect(exercises.find((e) => e.slug === 'side-plank')?.needsReposition).toBe(true);
  expect(exercises.find((e) => e.slug === 'bird-dog')?.needsReposition).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/exercises.test.ts`
Expected: FAIL — `e.cues` is undefined (`Cannot read properties of undefined`) or type errors.

- [ ] **Step 3: Extend the type**

In `src/lib/exercises.ts`, add these fields to the `Exercise` type, after `perSide: boolean;` (keep the existing fields untouched):

```ts
  // Whether switching sides takes setup time. true (side plank) = do all reps
  // of one side, then all of the other, with a reposition pause between sides;
  // false (bird dog) = alternate sides rep-by-rep with only a rest between.
  // Ignored when perSide is false.
  needsReposition: boolean;
  // Form cues; the workout shows one at random per rep. Sourced from McGill's
  // published coaching cues for the Big 3.
  cues: string[];
  // Optional per-side visuals shown during Left/Right units; the workout falls
  // back to `image` when absent.
  imageLeft?: string;
  imageRight?: string;
```

- [ ] **Step 4: Extend the data**

In the same file, add to the **curl-up** object (after `perSide: false`):

```ts
    needsReposition: false,
    cues: [
      'Keep both hands under the lower back — preserve the arch, never flatten it',
      'Brace your abs first, as if about to be poked in the stomach',
      'Lift head and shoulders as one rigid unit — no neck bending',
      'The lift is tiny — only a few centimetres off the floor',
      'Chin tucked, eyes on the ceiling',
      "Keep breathing normally — don't hold your breath"
    ]
```

Add to the **side-plank** object (after `perSide: true`):

```ts
    needsReposition: true,
    imageLeft: '/exercises/side-plank-left.svg',
    imageRight: '/exercises/side-plank-right.svg',
    cues: [
      'Elbow directly under the shoulder',
      "Straight line from head to knees or feet — don't let the hips sag",
      "Don't pike the hips up — stay in one line",
      'Brace the whole trunk before you lift',
      'Lock your rib cage to your pelvis',
      'Breathe steadily through the hold'
    ]
```

Add to the **bird-dog** object (after `perSide: true`):

```ts
    needsReposition: false,
    imageLeft: '/exercises/bird-dog-left.svg',
    imageRight: '/exercises/bird-dog-right.svg',
    cues: [
      'Back flat like a table — no sagging or arching',
      "Keep hips and shoulders square — don't let the pelvis rotate",
      'Raise the arm and leg no higher than the flat back',
      'Reach long through the fingertips and the heel',
      'Make a fist and squeeze the outstretched arm',
      "Brace the core before extending — don't rush the movement"
    ]
```

(The referenced SVGs are created in Task 2; nothing loads them yet.)

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test src/lib/exercises.test.ts` — Expected: PASS.
Run: `pnpm check` — Expected: errors ONLY in `src/routes/workout/page.svelte.test.ts` (its `ex()` helper builds `Exercise` objects and now misses the new required fields). Fix it now: in `src/routes/workout/page.svelte.test.ts`, add two lines to the object literal inside the `ex()` helper, after `perSide: false,`:

```ts
    needsReposition: true,
    cues: [],
```

(`needsReposition: true` preserves the old per-set side ordering for the existing test program, so no other test lines change.)
Run: `pnpm check` again — Expected: clean. Then `pnpm test` — Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exercises.ts src/lib/exercises.test.ts src/routes/workout/page.svelte.test.ts
git commit -m "feat: add reposition flag, form cues and per-side images to the program"
```

---

### Task 2: Per-side SVG variants

**Files:**

- Create: `static/exercises/side-plank-left.svg`
- Create: `static/exercises/side-plank-right.svg`
- Create: `static/exercises/bird-dog-left.svg`
- Create: `static/exercises/bird-dog-right.svg`

**Interfaces:**

- Produces: the four static files referenced by `imageLeft`/`imageRight` in Task 1. The existing `side-plank.svg`/`bird-dog.svg` stay untouched (still used by the instructions list).

The "Right" variants mirror the original drawing by wrapping it in `<g transform="translate(240,0) scale(-1,1)">` (the viewBox is 240 wide); the label text stays unmirrored. There is no test for static assets — visual verification happens in plan 3's screenshot pass.

- [ ] **Step 1: Create `static/exercises/side-plank-left.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" role="img" aria-label="Left side plank: on the left forearm, body in a straight line, hips lifted">
  <g fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <line x1="15" y1="100" x2="225" y2="100" stroke-width="2" stroke-dasharray="4 5"/>
    <circle cx="60" cy="52" r="10"/>
    <path d="M68 58 L200 92"/>
    <path d="M70 60 L64 100"/>
    <path d="M200 92 L165 100"/>
    <path d="M120 76 L128 46"/>
  </g>
  <text x="120" y="18" fill="#888" font-family="sans-serif" font-size="12" text-anchor="middle">Side Plank — Left</text>
</svg>
```

- [ ] **Step 2: Create `static/exercises/side-plank-right.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" role="img" aria-label="Right side plank: on the right forearm, body in a straight line, hips lifted">
  <g transform="translate(240,0) scale(-1,1)">
    <g fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <line x1="15" y1="100" x2="225" y2="100" stroke-width="2" stroke-dasharray="4 5"/>
      <circle cx="60" cy="52" r="10"/>
      <path d="M68 58 L200 92"/>
      <path d="M70 60 L64 100"/>
      <path d="M200 92 L165 100"/>
      <path d="M120 76 L128 46"/>
    </g>
  </g>
  <text x="120" y="18" fill="#888" font-family="sans-serif" font-size="12" text-anchor="middle">Side Plank — Right</text>
</svg>
```

- [ ] **Step 3: Create `static/exercises/bird-dog-left.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" role="img" aria-label="Bird dog, left arm extended: on hands and knees, opposite arm and leg extended level with the flat back">
  <g fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <line x1="15" y1="100" x2="225" y2="100" stroke-width="2" stroke-dasharray="4 5"/>
    <circle cx="70" cy="52" r="10"/>
    <path d="M80 56 L150 60"/>
    <path d="M150 60 L150 100"/>
    <path d="M95 58 L80 100"/>
    <path d="M78 54 L30 40"/>
    <path d="M150 62 L210 46"/>
  </g>
  <text x="120" y="18" fill="#888" font-family="sans-serif" font-size="12" text-anchor="middle">Bird Dog — Left</text>
</svg>
```

- [ ] **Step 4: Create `static/exercises/bird-dog-right.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" role="img" aria-label="Bird dog, right arm extended: on hands and knees, opposite arm and leg extended level with the flat back">
  <g transform="translate(240,0) scale(-1,1)">
    <g fill="none" stroke="#888" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <line x1="15" y1="100" x2="225" y2="100" stroke-width="2" stroke-dasharray="4 5"/>
      <circle cx="70" cy="52" r="10"/>
      <path d="M80 56 L150 60"/>
      <path d="M150 60 L150 100"/>
      <path d="M95 58 L80 100"/>
      <path d="M78 54 L30 40"/>
      <path d="M150 62 L210 46"/>
    </g>
  </g>
  <text x="120" y="18" fill="#888" font-family="sans-serif" font-size="12" text-anchor="middle">Bird Dog — Right</text>
</svg>
```

- [ ] **Step 5: Commit**

```bash
git add static/exercises/side-plank-left.svg static/exercises/side-plank-right.svg static/exercises/bird-dog-left.svg static/exercises/bird-dog-right.svg
git commit -m "feat: mirrored left/right exercise visuals"
```

---

### Task 3: Pure step engine `src/lib/workout.ts`

**Files:**

- Create: `src/lib/workout.ts`
- Test: `src/lib/workout.test.ts`

**Interfaces:**

- Consumes: `Exercise` from `$lib/exercises` (Task 1 fields).
- Produces (later plans depend on these exact signatures):
  - `type Side = 'Left' | 'Right' | null`
  - `type Step = { kind: 'unit' | 'rest' | 'reposition'; slug: string | null; exercise: string; side: Side; set: number; setCount: number; rep: number; repCount: number; hold: number | null; cue: string | null; label: string }`
  - `buildSteps(list: Exercise[], rest: number, reposition: number, rnd?: () => number): Step[]`
  - `nextUnit(steps: Step[], i: number): Step | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/workout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSteps, nextUnit, type Step } from './workout';
import type { Exercise } from './exercises';

function ex(partial: Partial<Exercise> & Pick<Exercise, 'slug'>): Exercise {
  return {
    name: partial.slug.toUpperCase(),
    description: '',
    details: '',
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

const key = (s: Step) => [s.kind, s.slug ?? '-', s.side ?? '-', `${s.set}.${s.rep}`].join(' ');

describe('buildSteps', () => {
  it('groups sides for reposition exercises: all Left sets, then all Right', () => {
    const steps = buildSteps(
      [ex({ slug: 'p', scheme: '2,1', perSide: true, needsReposition: true })],
      5,
      15
    );
    expect(steps.map(key)).toEqual([
      'unit p Left 1.1',
      'rest - - 0.0',
      'unit p Left 1.2',
      'rest - - 0.0',
      'unit p Left 2.1',
      'reposition - - 0.0',
      'unit p Right 1.1',
      'rest - - 0.0',
      'unit p Right 1.2',
      'rest - - 0.0',
      'unit p Right 2.1'
    ]);
    // Exactly one side switch repositions (15s); every other pause is a rest (5s).
    expect(steps.filter((s) => s.kind === 'reposition').map((s) => s.hold)).toEqual([15]);
    expect(steps[6].label).toBe('Set 1/2 · Right · hold 1/2');
  });

  it('alternates sides with only rests when no repositioning is needed', () => {
    const steps = buildSteps(
      [ex({ slug: 'b', scheme: '2', perSide: true, needsReposition: false })],
      5,
      15
    );
    expect(steps.map(key)).toEqual([
      'unit b Left 1.1',
      'rest - - 0.0',
      'unit b Right 1.1',
      'rest - - 0.0',
      'unit b Left 1.2',
      'rest - - 0.0',
      'unit b Right 1.2'
    ]);
  });

  it('repositions between different exercises', () => {
    const steps = buildSteps([ex({ slug: 'a' }), ex({ slug: 'b' })], 5, 15);
    expect(steps.map((s) => s.kind)).toEqual(['unit', 'reposition', 'unit']);
    expect(steps[1].label).toBe('next: B · Set 1/1 · hold 1/1');
  });

  it('skips zero-length pauses', () => {
    const steps = buildSteps([ex({ slug: 'a', scheme: '2' }), ex({ slug: 'b' })], 0, 0);
    expect(steps.every((s) => s.kind === 'unit')).toBe(true);
    // A hold exercise without holdSeconds falls back to a 0s hold.
    expect(buildSteps([ex({ slug: 'z', holdSeconds: undefined })], 0, 0)[0].hold).toBe(0);
  });

  it('never inserts a pause before a tap-paced rep', () => {
    const steps = buildSteps(
      [ex({ slug: 'a' }), ex({ slug: 'r', mode: 'reps', holdSeconds: undefined })],
      5,
      15
    );
    expect(steps.map((s) => s.kind)).toEqual(['unit', 'unit']);
    expect(steps[1].hold).toBeNull();
    expect(steps[1].label).toBe('Set 1/1 · rep 1/1');
  });

  it('picks a cue per unit with the injected rng; no cues gives null', () => {
    const steps = buildSteps(
      [ex({ slug: 'a', scheme: '2', cues: ['one', 'two'] })],
      0,
      0,
      () => 0.9
    );
    expect(steps.map((s) => s.cue)).toEqual(['two', 'two']);
    // Default rng + empty cue list → null.
    expect(buildSteps([ex({ slug: 'b' })], 0, 0)[0].cue).toBeNull();
  });

  it('nextUnit finds the next exercise unit across pauses', () => {
    const steps = buildSteps([ex({ slug: 'a', scheme: '2', holdSeconds: 10 })], 5, 15);
    expect(steps[0].label).toBe('Set 1/1 · hold 1/2');
    expect(nextUnit(steps, 0)?.rep).toBe(2);
    expect(nextUnit(steps, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/workout.test.ts`
Expected: FAIL — `Cannot find module './workout'` (or equivalent resolve error).

- [ ] **Step 3: Implement `src/lib/workout.ts`**

```ts
// Pure step engine for the auto-run workout: flattens the checked-in program
// into a flat list of steps (exercise units + rest/reposition pauses). Kept
// free of Svelte state so it's unit-testable.

import type { Exercise } from '$lib/exercises';

export type Side = 'Left' | 'Right' | null;

export type Step = {
  // 'unit' = one hold/rep of an exercise; 'rest'/'reposition' separate units.
  kind: 'unit' | 'rest' | 'reposition';
  slug: string | null; // exercise slug for units, null for pauses
  exercise: string; // display name; pauses use 'Rest'/'Reposition'
  side: Side; // null for single-side exercises and pauses
  set: number; // 1-based; 0 on pauses
  setCount: number;
  rep: number; // 1-based within the set; 0 on pauses
  repCount: number;
  hold: number | null; // seconds; null = tap-to-count rep (no timer)
  cue: string | null; // random form cue for units, null for pauses
  label: string; // preformatted "Set 1/3 · Left · hold 2/3" line
};

const SIDES = ['Left', 'Right'] as const;

/**
 * Flatten the program into steps. Side ordering depends on the exercise:
 * - perSide + needsReposition (side plank): all sets of one side, then all sets
 *   of the other — a single reposition per exercise instead of one per switch;
 * - perSide + !needsReposition (bird dog): alternate Left/Right every rep; the
 *   switch is only a rest, never a reposition.
 * Pauses are inserted before timed units only: a reposition when the body
 * position changes, a rest otherwise. Zero-length pauses are skipped. `rnd`
 * picks each unit's cue (injectable for tests).
 */
export function buildSteps(
  list: Exercise[],
  rest: number,
  reposition: number,
  rnd: () => number = Math.random
): Step[] {
  const units: { step: Step; pos: string }[] = [];
  for (const ex of list) {
    const setReps = ex.scheme.split(',').map((n) => parseInt(n.trim(), 10));
    const setCount = setReps.length;
    const push = (side: Side, set: number, rep: number, repCount: number): void => {
      const parts = [`Set ${set}/${setCount}`];
      if (side) parts.push(side);
      parts.push(`${ex.mode === 'hold' ? 'hold' : 'rep'} ${rep}/${repCount}`);
      units.push({
        step: {
          kind: 'unit',
          slug: ex.slug,
          exercise: ex.name,
          side,
          set,
          setCount,
          rep,
          repCount,
          hold: ex.mode === 'hold' ? (ex.holdSeconds ?? 0) : null,
          cue: ex.cues.length > 0 ? ex.cues[Math.floor(rnd() * ex.cues.length)] : null,
          label: parts.join(' · ')
        },
        // Same pos = same body position → rest between units; a pos change →
        // reposition. Sides only count as different positions when the
        // exercise needs repositioning to switch.
        pos: ex.perSide && ex.needsReposition ? `${ex.slug}/${side}` : ex.slug
      });
    };
    if (ex.perSide && ex.needsReposition) {
      for (const side of SIDES) {
        setReps.forEach((repCount, i) => {
          for (let r = 1; r <= repCount; r++) push(side, i + 1, r, repCount);
        });
      }
    } else if (ex.perSide) {
      setReps.forEach((repCount, i) => {
        for (let r = 1; r <= repCount; r++) {
          for (const side of SIDES) push(side, i + 1, r, repCount);
        }
      });
    } else {
      setReps.forEach((repCount, i) => {
        for (let r = 1; r <= repCount; r++) push(null, i + 1, r, repCount);
      });
    }
  }

  const steps: Step[] = [];
  units.forEach((u, i) => {
    if (i > 0 && u.step.hold !== null) {
      const move = u.pos !== units[i - 1].pos;
      const seconds = move ? reposition : rest;
      if (seconds > 0) {
        steps.push({
          kind: move ? 'reposition' : 'rest',
          slug: null,
          exercise: move ? 'Reposition' : 'Rest',
          side: null,
          set: 0,
          setCount: 0,
          rep: 0,
          repCount: 0,
          hold: seconds,
          cue: null,
          label: `next: ${u.step.exercise} · ${u.step.label}`
        });
      }
    }
    steps.push(u.step);
  });
  return steps;
}

/** First exercise unit after index i, or null when the workout ends there. */
export function nextUnit(steps: Step[], i: number): Step | null {
  return steps.slice(i + 1).find((s) => s.kind === 'unit') ?? null;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test src/lib/workout.test.ts` — Expected: PASS (7 tests).
Run: `pnpm check` — Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workout.ts src/lib/workout.test.ts
git commit -m "feat: pure step engine with exercise-aware side ordering"
```

---

### Task 4: Rewire the workout page to the engine

**Files:**

- Modify: `src/routes/workout/+page.svelte`
- Test: `src/routes/workout/page.svelte.test.ts` (behavioural expectations mostly unchanged)

**Interfaces:**

- Consumes: `buildSteps` from `$lib/workout` (Task 3).
- Produces: the page renders exactly as before (pause steps have `slug === null`, units have `label`), so existing tests keep passing — except side ordering inside a multi-rep per-side set, covered below.

- [ ] **Step 1: Delete the inlined engine, import the module**

In `src/routes/workout/+page.svelte`:

1. Delete the local `type Step = { slug: string | null; exercise: string; label: string; hold: number | null };` declaration and its comment (lines starting `// hold === null means …` through the type).
2. Delete the whole local `function buildSteps(…) { … }` (the function and its leading comment block `// Flatten the program into …`).
3. Change the exercises import and add the workout import so the top imports read:

```ts
import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { goto as navigate } from '$app/navigation';
import { exercises } from '$lib/exercises';
import { buildSteps } from '$lib/workout';
import { logSession } from '$lib/client/sessions.svelte';
import { timers } from '$lib/client/settings.svelte';
import type { CompletionEntry } from '$lib/sync';
```

(`type Exercise` is no longer imported — nothing else in the page uses it.)

Everything else in the page stays as-is: the `steps` constant, the template's `{step.slug ? step.label : …}` logic, completion, timers — the new `Step` shape is a superset of the old one.

- [ ] **Step 2: Add a page test for the new bird-dog-style ordering**

Append inside the `describe` block of `src/routes/workout/page.svelte.test.ts`:

```ts
test('a no-reposition per-side exercise alternates sides with rests only', () => {
  renderPage([ex({ slug: 'alt', scheme: '2', perSide: true, needsReposition: false })]);
  // L, Rest, R, Rest, L, Rest, R = 7 steps, none of them a reposition.
  expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
  expect(screen.getByText(/Set 1\/1 · Left · hold 1\/2/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the full gates**

Run: `pnpm check` — Expected: clean.
Run: `pnpm test` — Expected: all PASS (the existing workout tests still pass because the test program uses `needsReposition: true` with 1-rep sides, which produces the same order as before).
Run: `pnpm test:coverage` — Expected: thresholds met (workout.ts fully covered by Task 3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/routes/workout/+page.svelte src/routes/workout/page.svelte.test.ts
git commit -m "refactor: workout page uses the shared step engine"
```

---

### Task 5: Ship it

- [ ] **Step 1: Full verification**

Run: `pnpm format && pnpm lint && pnpm check && pnpm test:coverage`
Expected: all clean, coverage thresholds met.

- [ ] **Step 2: Manual sanity check (screenshots for the PR)**

Follow the index doc's "PR requirements" section: launch the dev server per the `verify` skill, open `/workout`, click Start, and screenshot the running workout showing the side-plank sequence going Left-Left-Left → Reposition → Right… Save to `docs/pr-media/<branch>/` and commit.

- [ ] **Step 3: Push branch, open a draft PR**

```bash
git push -u origin HEAD
gh pr create --draft --title "Workout: exercise-aware side ordering + cues data" --body-file <(printf '%s\n' "Plan 1/4 of the workout overhaul (see docs/superpowers/plans/2026-07-13-workout-overhaul-0-index.md)." "" "- Side plank: all Left sets, then all Right — one reposition instead of five" "- Bird dog: alternates sides rep-by-rep, rests only" "- Program data gains form cues and mirrored left/right SVGs (used by plan 3)" "- buildSteps extracted to tested pure module src/lib/workout.ts" "" "![screenshot](https://github.com/tionkje/painfree/blob/<branch>/docs/pr-media/<branch>/workout.png?raw=true)" "" "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```
