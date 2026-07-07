import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { store as state } from '$lib/client/sessions.svelte';
import { timers, setTimers } from '$lib/client/settings.svelte';
import type { ClientSession } from '$lib/sync';
import Page from './+page.svelte';

function session(over: Partial<ClientSession>): ClientSession {
  return {
    uuid: 'u',
    completedAt: '2026-01-02T03:04:00.000Z',
    updatedAt: '2026-01-02T03:04:00.000Z',
    deleted: false,
    synced: true,
    exercises: [],
    ...over
  };
}

function rowInputs(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')];
}

beforeEach(() => {
  // Background sync fires on every session mutation; keep it pending so we assert
  // the optimistic local write, not the post-sync state (sync is tested elsewhere).
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {}))
  );
  state.sessions = [];
  setTimers({ restSeconds: 5, repositionSeconds: 15 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('settings page (brittle component UI - safe to skip)', () => {
  test('shows the empty state with the timers + backfill forms', () => {
    render(Page);
    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save timers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  test('saving timers persists the new values', async () => {
    render(Page);
    const rest = screen.getByRole('spinbutton', { name: /Rest between holds/ });
    const repo = screen.getByRole('spinbutton', { name: /Repositioning time/ });
    await fireEvent.input(rest, { target: { value: '3' } });
    await fireEvent.input(repo, { target: { value: '9' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save timers' }));
    expect(timers.restSeconds).toBe(3);
    expect(timers.repositionSeconds).toBe(9);
  });

  test('lists sessions with an editable date and a delete button', () => {
    state.sessions = [session({ uuid: 'a' })];
    render(Page);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    // backfill input + the row's datetime-local input.
    expect(rowInputs()).toHaveLength(2);
  });

  test('editing a date updates the session and marks it unsynced', async () => {
    state.sessions = [session({ uuid: 'a', synced: true })];
    render(Page);
    await fireEvent.change(rowInputs()[1], { target: { value: '2026-02-02T08:00' } });
    expect(state.sessions[0].completedAt).toBe(new Date('2026-02-02T08:00').toISOString());
    expect(state.sessions[0].synced).toBe(false);
  });

  test('backfill adds a new session for the chosen date', async () => {
    render(Page);
    await fireEvent.input(rowInputs()[0], { target: { value: '2026-03-03T09:00' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].completedAt).toBe(new Date('2026-03-03T09:00').toISOString());
    expect(state.sessions[0].exercises).toEqual([]);
  });

  test('delete is cancelled when the confirm dialog is declined', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false)
    );
    state.sessions = [session({ uuid: 'a' })];
    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(state.sessions[0].deleted).toBe(false);
  });

  test('delete tombstones the session when confirmed', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    state.sessions = [session({ uuid: 'a' })];
    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(state.sessions[0].deleted).toBe(true);
  });
});
