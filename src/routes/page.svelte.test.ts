import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('home page (brittle component UI - safe to skip)', () => {
  test('renders the done-today state', () => {
    render(Page, { data: { streak: 3, doneToday: true, total: 5 } });
    expect(screen.getByText(/Done today/)).toBeInTheDocument();
    expect(screen.getByText('🔥 3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('renders the not-done state', () => {
    render(Page, { data: { streak: 0, doneToday: false, total: 0 } });
    expect(screen.getByText(/Not done today/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start today/ })).toBeInTheDocument();
  });
});
