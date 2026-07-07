// Pure completeness tally for a session's per-exercise units. Percent is null
// when there's nothing to measure (no exercise rows) so the UI can show "—".

import type { CompletionEntry } from './sync';

export function completionPercent(exercises: CompletionEntry[]): number | null {
  const total = exercises.reduce((a, e) => a + e.target, 0);
  if (total === 0) return null;
  const done = exercises.reduce((a, e) => a + e.completed, 0);
  return Math.round((done / total) * 100);
}
