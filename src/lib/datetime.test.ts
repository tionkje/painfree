import { describe, it, expect } from 'vitest';
import { toLocalInput } from './datetime';

describe('toLocalInput', () => {
  it('formats a date as zero-padded local YYYY-MM-DDTHH:mm', () => {
    // Constructed in local time so the output matches regardless of TZ.
    expect(toLocalInput(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07');
  });
});
