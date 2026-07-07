import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen, fireEvent } from '@testing-library/svelte';

vi.mock('$app/state', () => ({ page: { url: { pathname: '/' } } }));
vi.mock('$lib/client/sessions.svelte', () => ({ scheduleSync: vi.fn(() => Promise.resolve()) }));

import Layout from './+layout.svelte';
import { scheduleSync } from '$lib/client/sessions.svelte';

const children = createRawSnippet(() => ({ render: () => '<span>page content</span>' }));

describe('layout (brittle component UI - safe to skip)', () => {
  beforeEach(() => vi.mocked(scheduleSync).mockClear());

  test('renders nav with current-page marker and toggles to dark', async () => {
    render(Layout, { children });
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Workout' })).not.toHaveAttribute('aria-current');

    const toggle = screen.getByRole('button', { name: 'Toggle theme' });
    expect(toggle).toHaveTextContent('🌙');
    await fireEvent.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(toggle).toHaveTextContent('☀️');
  });

  test('starts from a saved dark theme and toggles back to light', async () => {
    localStorage.setItem('theme', 'dark');
    render(Layout, { children });
    const toggle = screen.getByRole('button', { name: 'Toggle theme' });
    expect(toggle).toHaveTextContent('☀️');
    await fireEvent.click(toggle);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  test('falls back to the OS dark preference when nothing is saved', async () => {
    vi.mocked(matchMedia).mockReturnValueOnce({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaQueryList);
    render(Layout, { children });
    await fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(localStorage.getItem('theme')).toBe('light');
  });

  test('syncs on mount and again when connectivity returns', () => {
    render(Layout, { children });
    expect(scheduleSync).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));
    expect(scheduleSync).toHaveBeenCalledTimes(2);
  });
});
