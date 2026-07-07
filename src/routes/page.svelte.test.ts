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

describe('home page (brittle component UI - safe to skip)', () => {
  test('renders the done-today state from a session logged today', () => {
    const today = new Date().toISOString();
    state.sessions = [session({ uuid: 'a', completedAt: today, updatedAt: today })];
    render(Page);
    expect(screen.getByText(/Done today/)).toBeInTheDocument();
    expect(screen.getByText('🔥 1')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('renders the not-done empty state', () => {
    render(Page);
    expect(screen.getByText(/Not done today/)).toBeInTheDocument();
    expect(screen.getByText('🔥 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start today/ })).toBeInTheDocument();
  });
});
