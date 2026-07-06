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
    mode: 'hold',
    scheme: '1',
    holdSeconds: 1,
    perSide: false,
    ...partial
  };
}

// One single-side exercise (2s hold, with a video) + one per-side exercise
// (no video) => 3 holds total and both video branches exercised.
const program: Exercise[] = [
  ex({ slug: 'a', holdSeconds: 2, perSide: false, video: 'https://youtu.be/demo' }),
  ex({ slug: 'b', holdSeconds: 1, perSide: true })
];

describe('workout page (brittle component UI - safe to skip)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('shows an empty state when there are no exercises', () => {
    render(Page, { data: { exercises: [] } });
    expect(screen.getByText(/No exercises configured/)).toBeInTheDocument();
  });

  test('expands the program into per-side holds and shows instructions', () => {
    render(Page, { data: { exercises: program } });
    expect(screen.getByText('Unit 1 of 3')).toBeInTheDocument();
    // per-side label present in instructions
    expect(screen.getByText(/each side/)).toBeInTheDocument();
    // each exercise has a visual + an expandable detail; the one with a video links out
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getAllByText('More detail')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Watch a video/ })).toBeInTheDocument();
  });

  test('start -> tick to zero beeps, vibrates and advances', async () => {
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

    render(Page, { data: { exercises: program } });
    await fireEvent.click(screen.getByRole('button', { name: 'Start hold' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // First tick: 2s -> 1s, still holding (no beep yet).
    await vi.advanceTimersByTimeAsync(1000);
    expect(oscStart).not.toHaveBeenCalled();
    expect(screen.getByText('Unit 1 of 3')).toBeInTheDocument();

    // Second tick: hits zero -> beep, vibrate, advance.
    await vi.advanceTimersByTimeAsync(1000);
    expect(oscStart).toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(200);
    expect(screen.getByText('Unit 2 of 3')).toBeInTheDocument();
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

    render(Page, { data: { exercises: program } });
    await fireEvent.click(screen.getByRole('button', { name: 'Start hold' }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(warn).toHaveBeenCalledWith('beep failed', expect.any(Error));
  });

  test('pause stops the countdown', async () => {
    render(Page, { data: { exercises: program } });
    await fireEvent.click(screen.getByRole('button', { name: 'Start hold' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Start hold' })).toBeInTheDocument();
  });

  test('skip and back navigate holds; skipping past the end completes', async () => {
    render(Page, { data: { exercises: program } });
    const back = screen.getByRole('button', { name: '← Back' });
    expect(back).toBeDisabled();

    await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    expect(screen.getByText('Unit 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back' })).toBeEnabled();

    await fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByText('Unit 1 of 3')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('completing the session redirects on success and updates otherwise', async () => {
    render(Page, { data: { exercises: program } });
    await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    expect(hoisted.submit).not.toBeNull();

    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
    const update = vi.fn();
    const callback = hoisted.submit!({});
    await callback({ result: { type: 'success' }, update });
    expect(window.location.href).toBe('/history');

    await callback({ result: { type: 'failure' }, update });
    expect(update).toHaveBeenCalled();
  });

  test('reps mode counts with a Done button instead of a timer', async () => {
    const reps: Exercise[] = [ex({ slug: 'r', mode: 'reps', scheme: '2', holdSeconds: undefined })];
    render(Page, { data: { exercises: reps } });
    // No timer controls; a rep is completed by tapping Done.
    expect(screen.getByText(/rep 1\/2/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start hold' })).not.toBeInTheDocument();
    // Instructions show a reps label, not a holds label.
    expect(screen.getByText(/, reps$/)).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText(/rep 2\/2/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });
});
