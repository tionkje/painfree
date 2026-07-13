import { describe, it, expect } from 'vitest';
import { exercises } from './exercises';

describe('exercises program', () => {
  it('ships the McGill Big 3 in workout order', () => {
    expect(exercises.map((e) => e.slug)).toEqual(['curl-up', 'side-plank', 'bird-dog']);
    // Hold-mode exercises must define holdSeconds so the timer has a duration.
    for (const e of exercises) {
      if (e.mode === 'hold') expect(typeof e.holdSeconds).toBe('number');
    }
  });

  it('every exercise takes the same total hold time, all holds equal length', () => {
    const totals = exercises.map((e) => {
      const reps = e.scheme.split(',').reduce((sum, n) => sum + parseInt(n, 10), 0);
      return reps * (e.perSide ? 2 : 1) * (e.holdSeconds ?? 0);
    });
    expect(new Set(totals).size).toBe(1);
    expect(new Set(exercises.map((e) => e.holdSeconds)).size).toBe(1);
  });
});
