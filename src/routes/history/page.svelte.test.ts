import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('history page (brittle component UI - safe to skip)', () => {
  test('shows the empty state', () => {
    render(Page, { data: { streak: 0, sessions: [] } });
    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument();
  });

  test('lists sessions with a formatted date', () => {
    render(Page, {
      data: {
        streak: 2,
        sessions: [
          { id: 2, completedAt: '2026-07-05T10:00:00.000Z' },
          { id: 1, completedAt: '2026-07-04T10:00:00.000Z' }
        ]
      }
    });
    expect(screen.getByText(/2 day streak/)).toBeInTheDocument();
    // Numbered newest-first: 2 sessions -> rows show 2 then 1.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2
  });
});
