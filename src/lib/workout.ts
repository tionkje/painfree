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
