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
