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

// One single-side exercise with two holds (rest between) + one per-side
// exercise (reposition between sides and between exercises) => with 1s
// pauses: A·hold, Rest, A·hold, Reposition, B·Left, Reposition, B·Right.
const program: Exercise[] = [
  ex({ slug: 'a', scheme: '2', holdSeconds: 2, perSide: false, video: 'https://youtu.be/demo' }),
  ex({ slug: 'b', holdSeconds: 1, perSide: true })
];
const settings = { id: 1, restSeconds: 1, repositionSeconds: 1 };

function renderPage(exercises: Exercise[] = program, overrides: Partial<typeof settings> = {}) {
  return render(Page, { data: { exercises, settings: { ...settings, ...overrides } } });
}

function stubAudio() {
  class FakeAudio {
    currentTime = 0;
    destination = {};
    createOscillator() {
      return { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    }
  }
  vi.stubGlobal('AudioContext', FakeAudio);
  vi.stubGlobal('navigator', { vibrate: vi.fn() });
}

describe('workout page (brittle component UI - safe to skip)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('shows an empty state when there are no exercises', () => {
    renderPage([]);
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
    renderPage(program, { restSeconds: 0, repositionSeconds: 0 });
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

    // Every unit ran to zero, so completion is full — pauses count for nothing.
    const payload = JSON.parse(
      (document.querySelector('input[name="completion"]') as HTMLInputElement).value
    );
    expect(payload).toEqual([
      { slug: 'a', unit: 'hold', target: 2, completed: 2 },
      { slug: 'b', unit: 'hold', target: 2, completed: 2 }
    ]);
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
    renderPage(program, { restSeconds: 0, repositionSeconds: 0 });
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

  test('reps mode counts with a Done button instead of a timer', async () => {
    const reps: Exercise[] = [ex({ slug: 'r', mode: 'reps', scheme: '2', holdSeconds: undefined })];
    renderPage(reps);
    // No timer controls and no pauses — reps are tap-paced.
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByText(/rep 1\/2/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    // Instructions show a reps label, not a holds label.
    expect(screen.getByText(/, reps$/)).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText(/rep 2\/2/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('auto-run halts on a rep and resumes when Done is tapped', async () => {
    stubAudio();
    // Hold -> rep (no pause before a rep) -> reposition -> hold.
    const mixed: Exercise[] = [
      ex({ slug: 'h1' }),
      ex({ slug: 'r', mode: 'reps', holdSeconds: undefined }),
      ex({ slug: 'h2' })
    ];
    renderPage(mixed);
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    // Hold finishes and the run halts on the tap-paced rep.
    await vi.advanceTimersByTimeAsync(1000);
    expect(screen.getByText(/rep 1\/1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();

    // Done resumes the auto-run into the reposition pause.
    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByRole('heading', { name: 'Reposition' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // Reposition then the final hold run out on their own.
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });
});
