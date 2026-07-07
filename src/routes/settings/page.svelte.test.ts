import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

// Neutralise SvelteKit's enhance so submitting a form doesn't hit the network.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

import Page from './+page.svelte';

const settings = { id: 1, restSeconds: 5, repositionSeconds: 15 };

describe('settings page (brittle component UI - safe to skip)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('shows the empty state', () => {
    render(Page, { data: { sessions: [], settings } });
    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument();
  });

  test('shows the timer settings form with current values', () => {
    render(Page, { data: { sessions: [], settings } });
    expect(screen.getByLabelText(/Rest between holds/)).toHaveValue(5);
    expect(screen.getByLabelText(/Repositioning time/)).toHaveValue(15);
    expect(screen.getByRole('button', { name: 'Save timers' })).toBeInTheDocument();
  });

  test('lists sessions with editable date and delete', () => {
    render(Page, { data: { sessions: [{ id: 1, completedAt: '2026-01-02T03:04' }], settings } });
    expect(screen.getByDisplayValue('2026-01-02T03:04')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('delete is cancelled when the confirm dialog is declined', () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false)
    );
    render(Page, { data: { sessions: [{ id: 1, completedAt: '2026-01-02T03:04' }], settings } });
    const form = screen.getByRole('button', { name: 'Delete' }).closest('form')!;
    const submit = new SubmitEvent('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
  });

  test('delete proceeds when the confirm dialog is accepted', () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    );
    render(Page, { data: { sessions: [{ id: 1, completedAt: '2026-01-02T03:04' }], settings } });
    const form = screen.getByRole('button', { name: 'Delete' }).closest('form')!;
    const submit = new SubmitEvent('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(false);
  });
});
