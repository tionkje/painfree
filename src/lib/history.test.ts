import { describe, it, expect } from 'vitest';
import { completionPercent } from './history';

describe('completionPercent', () => {
  it('is null when there is nothing to measure', () => {
    expect(completionPercent([])).toBeNull();
    expect(completionPercent([{ slug: 'x', unit: 'hold', target: 0, completed: 0 }])).toBeNull();
  });

  it('rounds done/target across exercises', () => {
    expect(
      completionPercent([
        { slug: 'a', unit: 'hold', target: 10, completed: 10 },
        { slug: 'b', unit: 'rep', target: 10, completed: 5 }
      ])
    ).toBe(75);
  });
});
