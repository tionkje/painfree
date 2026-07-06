import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('history page (brittle component UI - safe to skip)', () => {
  test('shows the empty state', () => {
    render(Page, { data: { streak: 0, sessions: [] } });
    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument();
  });

  test('lists sessions with a formatted date and completeness', () => {
    render(Page, {
      data: {
        streak: 3,
        sessions: [
          { id: 3, completedAt: '2026-07-06T10:00:00.000Z', percent: 100 },
          { id: 2, completedAt: '2026-07-05T10:00:00.000Z', percent: 67 },
          { id: 1, completedAt: '2026-07-04T10:00:00.000Z', percent: null }
        ]
      }
    });
    expect(screen.getByText(/3 day streak/)).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3
    // The three completeness renderings: full, partial, unknown.
    expect(screen.getByText('🎯 100%')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
