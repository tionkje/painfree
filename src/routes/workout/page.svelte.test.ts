import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { Exercise } from '$lib/exercises';

const hoisted = vi.hoisted(() => ({
  submit: null as null | ((arg: unknown) => (cb: unknown) => Promise<void>)
}));

vi.mock('$app/forms', () => ({
  enhance: (_form: HTMLFormElement, submit: (arg: unknown) => (cb: unknown) => Promise<void>) => {
    hoisted.submit = submit;
    return { destroy() {} };
  }
}));

import Page from './+page.svelte';

function ex(partial: Partial<Exercise> & Pick<Exercise, 'slug'>): Exercise {
  return {
    name: partial.slug.toUpperCase(),
    description: `desc ${partial.slug}`,
    details: `details ${partial.slug}`,
    image: `/exercises/${partial.slug}.svg`,
    scheme: '1',
    holdSeconds: 1,
    perSide: false,
    ...partial
  };
}

// One single-side exercise with two holds (rest between) + one per-side
// exercise (reposition between sides and between exercises) => with 1s
// pauses: A·hold, Rest, A·hold, Reposition, B·Left, Reposition, B·Right.
const program: Exercise[] = [
  ex({ slug: 'a', scheme: '2', holdSeconds: 2, perSide: false, video: 'https://youtu.be/demo' }),
  ex({ slug: 'b', holdSeconds: 1, perSide: true })
];
const settings = { id: 1, restSeconds: 1, repositionSeconds: 1 };

function renderPage(overrides: Partial<typeof settings> = {}) {
  return render(Page, { data: { exercises: program, settings: { ...settings, ...overrides } } });
}

describe('workout page (brittle component UI - safe to skip)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('shows an empty state when there are no exercises', () => {
    render(Page, { data: { exercises: [], settings } });
    expect(screen.getByText(/No exercises configured/)).toBeInTheDocument();
  });

  test('expands the program into holds with rests and shows instructions', () => {
    renderPage();
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    // per-side label present in instructions
    expect(screen.getByText(/each side/)).toBeInTheDocument();
    // each exercise has a visual + an expandable detail; the one with a video links out
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getAllByText('More detail')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Watch a video/ })).toBeInTheDocument();
  });

  test('zero pause times produce a holds-only program', () => {
    renderPage({ restSeconds: 0, repositionSeconds: 0 });
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
  });

  test('one start runs the whole workout through rests to completion', async () => {
    const oscStart = vi.fn();
    class FakeAudio {
      currentTime = 0;
      destination = {};
      createOscillator() {
        return { frequency: { value: 0 }, connect: vi.fn(), start: oscStart, stop: vi.fn() };
      }
    }
    vi.stubGlobal('AudioContext', FakeAudio);
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // First tick: 2s -> 1s, still holding (no beep yet).
    await vi.advanceTimersByTimeAsync(1000);
    expect(oscStart).not.toHaveBeenCalled();
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();

    // Second tick: hits zero -> beep, vibrate, auto-advance into the rest.
    await vi.advanceTimersByTimeAsync(1000);
    expect(oscStart).toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(200);
    expect(screen.getByRole('heading', { name: 'Rest' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 7')).toBeInTheDocument();
    // Still running — no button press needed between steps.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // Remaining steps: 1s rest + 2s hold + 1s repo + 1s hold + 1s repo + 1s hold.
    await vi.advanceTimersByTimeAsync(7000);
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('beep survives a blocked AudioContext and a missing vibrate', async () => {
    class BlockedAudio {
      constructor() {
        throw new Error('blocked');
      }
    }
    vi.stubGlobal('AudioContext', BlockedAudio);
    vi.stubGlobal('navigator', {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(warn).toHaveBeenCalledWith('beep failed', expect.any(Error));
  });

  test('pause stops the countdown', async () => {
    renderPage();
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  test('skip and back navigate steps; skipping past the end completes', async () => {
    renderPage();
    const back = screen.getByRole('button', { name: '← Back' });
    expect(back).toBeDisabled();

    const skip = () => fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));

    await skip();
    expect(screen.getByRole('heading', { name: 'Rest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back' })).toBeEnabled();

    await fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();

    await skip();
    await skip();
    await skip();
    expect(screen.getByRole('heading', { name: 'Reposition' })).toBeInTheDocument();

    await skip();
    await skip();
    await skip();
    await skip();
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('completing the session redirects on success and updates otherwise', async () => {
    renderPage({ restSeconds: 0, repositionSeconds: 0 });
    for (let i = 0; i < 4; i++) {
      await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    }
    expect(hoisted.submit).not.toBeNull();

    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
    const update = vi.fn();
    const callback = hoisted.submit!({});
    await callback({ result: { type: 'success' }, update });
    expect(window.location.href).toBe('/history');

    await callback({ result: { type: 'failure' }, update });
    expect(update).toHaveBeenCalled();
  });
});
