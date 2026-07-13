import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { Exercise } from '$lib/exercises';

// The program + timers are read from modules (checked-in program, localStorage
// timers). Inject both via mocks whose backing objects we mutate per test.
const hoisted = vi.hoisted(() => ({
  program: [] as Exercise[],
  timers: { restSeconds: 1, repositionSeconds: 1 }
}));
vi.mock('$lib/exercises', () => ({ exercises: hoisted.program }));
vi.mock('$lib/client/settings.svelte', () => ({ timers: hoisted.timers }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/client/sessions.svelte', () => ({ logSession: vi.fn() }));

import Page from './+page.svelte';
import { goto } from '$app/navigation';
import { logSession } from '$lib/client/sessions.svelte';

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
    needsReposition: true,
    cues: [],
    ...partial
  };
}

// One single-side exercise with two holds (rest between) + one per-side exercise
// (reposition between sides and between exercises) => with 1s pauses:
// A·hold, Rest, A·hold, Reposition, B·Left, Reposition, B·Right = 7 steps.
const program: Exercise[] = [
  ex({ slug: 'a', scheme: '2', holdSeconds: 2, perSide: false, video: 'https://youtu.be/demo' }),
  ex({ slug: 'b', holdSeconds: 1, perSide: true })
];

function renderPage(list: Exercise[] = program, rest = 1, reposition = 1) {
  hoisted.program.length = 0;
  hoisted.program.push(...list);
  hoisted.timers.restSeconds = rest;
  hoisted.timers.repositionSeconds = reposition;
  return render(Page);
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
    vi.mocked(goto).mockClear();
    vi.mocked(logSession).mockClear();
  });

  test('shows an empty state when there are no exercises', () => {
    renderPage([]);
    expect(screen.getByText(/No exercises configured/)).toBeInTheDocument();
  });

  test('expands the program into holds with rests and shows instructions', () => {
    renderPage();
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.getByText(/each side/)).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getAllByText('More detail')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Watch a video/ })).toBeInTheDocument();
  });

  test('shows current/next exercise and exercise/total time left with progress', async () => {
    renderPage();
    // Steps: A·2s, Rest·1s, A·2s, Repo·1s, B·L·1s, Repo·1s, B·R·1s → total 9s.
    expect(screen.getByRole('heading', { name: 'A', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Next: B/)).toBeInTheDocument();
    expect(screen.getByText('0:05')).toBeInTheDocument(); // exercise A: 2+1+2
    expect(screen.getByText('0:09')).toBeInTheDocument(); // total

    const skip = () => fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    // On the rest between A's holds, the pause counts toward A.
    await skip();
    expect(screen.getByRole('heading', { name: 'A', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('0:03')).toBeInTheDocument(); // rest 1 + hold 2
    expect(screen.getByText('0:07')).toBeInTheDocument();

    // On the reposition into B, the pause counts toward B; B is the last exercise.
    await skip();
    await skip();
    expect(screen.getByRole('heading', { name: 'B', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Next: Done 🎉/)).toBeInTheDocument();
    // B is the last exercise, so exercise-left === total-left (repo+L+repo+R).
    expect(screen.getAllByText('0:04')).toHaveLength(2);
  });

  test('zero pause times produce a holds-only program', () => {
    renderPage(program, 0, 0);
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

    await vi.advanceTimersByTimeAsync(1000);
    expect(oscStart).not.toHaveBeenCalled();
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1000);
    expect(oscStart).toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(200);
    expect(screen.getByText(/^Rest — /)).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // 1s rest + 2s hold + 1s repo + 1s hold + 1s repo + 1s hold.
    await vi.advanceTimersByTimeAsync(7000);
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();

    // Every unit ran to zero, so completion is full — pauses count for nothing.
    await fireEvent.click(screen.getByRole('button', { name: /Log it/ }));
    expect(vi.mocked(logSession).mock.calls[0][0]).toEqual([
      { slug: 'a', unit: 'hold', target: 2, completed: 2 },
      { slug: 'b', unit: 'hold', target: 2, completed: 2 }
    ]);
    expect(goto).toHaveBeenCalledWith('/history');
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
    expect(screen.getByRole('button', { name: '← Back' })).toBeDisabled();

    const skip = () => fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));

    await skip();
    expect(screen.getByText(/^Rest — /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back' })).toBeEnabled();

    await fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();

    await skip();
    await skip();
    await skip();
    expect(screen.getByText(/^Reposition — /)).toBeInTheDocument();

    await skip();
    await skip();
    await skip();
    await skip();
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('finishing logs the session locally and navigates to history', async () => {
    renderPage(program, 0, 0);
    for (let i = 0; i < 4; i++) {
      await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    }
    await fireEvent.click(screen.getByRole('button', { name: /Log it/ }));
    expect(logSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logSession).mock.calls[0][0]).toEqual([
      { slug: 'a', unit: 'hold', target: 2, completed: 0 },
      { slug: 'b', unit: 'hold', target: 2, completed: 0 }
    ]);
    expect(goto).toHaveBeenCalledWith('/history');
  });

  test('reps mode counts with a Done button instead of a timer', async () => {
    renderPage([ex({ slug: 'r', mode: 'reps', scheme: '2', holdSeconds: undefined })]);
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByText(/rep 1\/2/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.getByText(/, reps$/)).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText(/rep 2\/2/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('a no-reposition per-side exercise alternates sides with rests only', () => {
    renderPage([ex({ slug: 'alt', scheme: '2', perSide: true, needsReposition: false })]);
    // L, Rest, R, Rest, L, Rest, R = 7 steps, none of them a reposition.
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.getByText(/Set 1\/1 · Left · hold 1\/2/)).toBeInTheDocument();
  });

  test('auto-run halts on a rep and resumes when Done is tapped', async () => {
    stubAudio();
    const mixed: Exercise[] = [
      ex({ slug: 'h1' }),
      ex({ slug: 'r', mode: 'reps', holdSeconds: undefined }),
      ex({ slug: 'h2' })
    ];
    renderPage(mixed);
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(screen.getByText(/rep 1\/1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText(/^Reposition — /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });
});
