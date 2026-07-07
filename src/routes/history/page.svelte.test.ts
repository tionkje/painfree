import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { store as state } from '$lib/client/sessions.svelte';
import type { ClientSession } from '$lib/sync';
import Page from './+page.svelte';

function session(over: Partial<ClientSession>): ClientSession {
  return {
    uuid: 'u',
    completedAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    deleted: false,
    synced: true,
    exercises: [],
    ...over
  };
}

beforeEach(() => {
  state.sessions = [];
});

describe('history page (brittle component UI - safe to skip)', () => {
  test('shows the empty state', () => {
    render(Page);
    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument();
  });

  test('lists sessions with a formatted date and completeness', () => {
    state.sessions = [
      session({
        uuid: 'c',
        completedAt: '2026-07-06T10:00:00.000Z',
        exercises: [{ slug: 'a', unit: 'hold', target: 10, completed: 10 }]
      }),
      session({
        uuid: 'b',
        completedAt: '2026-07-05T10:00:00.000Z',
        exercises: [{ slug: 'a', unit: 'hold', target: 36, completed: 24 }]
      }),
      session({ uuid: 'a', completedAt: '2026-07-04T10:00:00.000Z', exercises: [] })
    ];
    render(Page);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3
    // The three completeness renderings: full, partial, unknown.
    expect(screen.getByText('🎯 100%')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
