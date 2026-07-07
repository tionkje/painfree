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
});
