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
vi.mock('$lib/client/sessions.svelte', () => ({
  startSession: vi.fn(() => 'uuid-1'),
  updateSession: vi.fn()
}));

import Page from './+page.svelte';
import { goto } from '$app/navigation';
import { startSession, updateSession } from '$lib/client/sessions.svelte';

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
    needsReposition: false,
    cues: [],
    ...partial
  };
}

// A: one set of two 2s holds (rest between); B: side-plank-like per-side with
// repositioning and per-side images.
// Steps: A·1/2, Rest, A·2/2, Reposition, B·Left, Reposition, B·Right.
const program: Exercise[] = [
  ex({
    slug: 'a',
    scheme: '2',
    holdSeconds: 2,
    cues: ['brace hard'],
    video: 'https://youtu.be/demo'
  }),
  ex({
    slug: 'b',
    perSide: true,
    needsReposition: true,
    imageLeft: '/exercises/b-left.svg',
    imageRight: '/exercises/b-right.svg'
  })
];

function renderPage(list: Exercise[] = program, rest = 1, reposition = 1) {
  hoisted.program.length = 0;
  hoisted.program.push(...list);
  hoisted.timers.restSeconds = rest;
  hoisted.timers.repositionSeconds = reposition;
  return render(Page);
}

// audio.ts caches one AudioContext, so stub it once at file level and record
// every played frequency; beforeEach clears the recording.
const freqs: number[] = [];
const vibrate = vi.fn();
class FakeAudio {
  currentTime = 0;
  destination = {};
  createOscillator() {
    const osc = {
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(() => freqs.push(osc.frequency.value)),
      stop: vi.fn()
    };
    return osc;
  }
}

const mode = () => document.querySelector('.session')?.getAttribute('data-mode');
const begin = () => fireEvent.click(screen.getByRole('button', { name: 'Start workout' }));

describe('workout page (brittle component UI - safe to skip)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudio);
    vi.stubGlobal('navigator', { vibrate });
    freqs.length = 0;
    vibrate.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.mocked(goto).mockClear();
    vi.mocked(startSession).mockClear();
    vi.mocked(updateSession).mockClear();
  });

  test('shows an empty state when there are no exercises', () => {
    renderPage([]);
    expect(screen.getByText(/No exercises configured/)).toBeInTheDocument();
  });

  test('intro screen shows the program and instructions, no session view', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeInTheDocument();
    expect(document.querySelector('.session')).toBeNull();
    expect(screen.getByText(/each side/)).toBeInTheDocument();
    expect(screen.getAllByText('More detail')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Watch a video/ })).toBeInTheDocument();
  });

  test('begin opens the session view: prep, then active, big readouts + cue', async () => {
    renderPage();
    await begin();
    expect(mode()).toBe('prep');
    expect(screen.getByText('GET READY')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument(); // Set 1/1
    expect(screen.getByText('1/2')).toBeInTheDocument(); // Hold 1/2
    expect(screen.getByText('💡 brace hard')).toBeInTheDocument();
    expect(screen.getByText('Next: Hold 2/2')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3000);
    expect(mode()).toBe('active');
    expect(screen.getByText('GO')).toBeInTheDocument();
  });

  test('rest and reposition display the upcoming unit, side switch and image', async () => {
    renderPage();
    await begin();
    await vi.advanceTimersByTimeAsync(5000); // 3s prep + 2s hold → Rest before A 2/2
    expect(mode()).toBe('rest');
    expect(screen.getByText('REST')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('Next: B — Left')).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3000); // rest 1s + hold 2s → Reposition into B·Left
    expect(mode()).toBe('reposition');
    expect(screen.getByText('REPOSITION')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'B — Left', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Next: Switch to Right')).toBeInTheDocument();
    expect(document.querySelector('.session img')?.getAttribute('src')).toBe(
      '/exercises/b-left.svg'
    );

    await vi.advanceTimersByTimeAsync(2000); // repo 1s + B·Left 1s → Reposition into B·Right
    expect(screen.getByRole('heading', { name: 'B — Right', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Next: Done 🎉')).toBeInTheDocument();
    expect(document.querySelector('.session img')?.getAttribute('src')).toBe(
      '/exercises/b-right.svg'
    );
  });

  test('set/rep readouts keep their grid slots across steps', async () => {
    renderPage();
    await begin();
    const cells = () => [...document.querySelectorAll('.counts small')].map((el) => el.textContent);
    expect(cells()).toEqual(['Set', 'Hold']);
    await vi.advanceTimersByTimeAsync(5000); // into the Rest pause
    expect(cells()).toEqual(['Set', 'Hold']);
  });

  test('pause shows PAUSED and Start resumes', async () => {
    renderPage();
    await begin();
    await fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mode()).toBe('paused');
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  test('resuming during a pause step skips the prep countdown', async () => {
    renderPage();
    await begin();
    await vi.advanceTimersByTimeAsync(5000); // on the Rest step
    await fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(mode()).toBe('rest');
  });

  test('start preps 3s, then auto-runs the workout with distinct sounds', async () => {
    renderPage();
    await begin();
    expect(mode()).toBe('prep');
    expect(freqs).toEqual([660]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(freqs).toEqual([660, 660, 660]);

    await vi.advanceTimersByTimeAsync(3000); // prep expires + A's first hold ends
    expect(mode()).toBe('rest');
    expect(freqs.slice(3)).toEqual([880]); // plain hold-done
    expect(vibrate).toHaveBeenCalledWith(200);

    await vi.advanceTimersByTimeAsync(1000); // rest over → set's final rep starts
    expect(freqs.slice(4)).toEqual([880, 880]); // last-rep heads-up

    await vi.advanceTimersByTimeAsync(2000); // A finishes
    expect(freqs.slice(6)).toEqual([660, 880, 1100]); // exercise done

    await vi.advanceTimersByTimeAsync(2000); // reposition + B·Left
    expect(freqs.slice(9)).toEqual([880, 660]); // set done → reposition

    await vi.advanceTimersByTimeAsync(2000); // reposition + B·Right → complete
    expect(freqs.slice(11)).toEqual([660, 880, 1100]);
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('a rest pause ticks its last 3 seconds as a lead-in to the next hold', async () => {
    renderPage(program, 4, 1); // 4s rest so it can count 3-2-1 into the next hold
    await begin();
    await vi.advanceTimersByTimeAsync(5000); // 3s prep + 2s hold → Rest (4s remaining)
    expect(mode()).toBe('rest');
    freqs.length = 0;
    await vi.advanceTimersByTimeAsync(3000); // rest 4→1: three lead-in ticks
    expect(freqs).toEqual([660, 660, 660]);
  });

  test('zero pause times produce a holds-only program', async () => {
    renderPage(program, 0, 0);
    await begin();
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
  });

  test('a no-reposition per-side exercise alternates sides with rests only', async () => {
    renderPage([ex({ slug: 'alt', scheme: '2', perSide: true, needsReposition: false })]);
    await begin();
    // L, Rest, R, Rest, L, Rest, R — 7 steps, no repositions.
    expect(screen.getByText('Step 1 of 7')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ALT — Left', level: 2 })).toBeInTheDocument();
  });

  test('skip and back navigate; skipping to the end completes', async () => {
    renderPage(program, 0, 0); // holds only: A, A, B·L, B·R
    await begin();
    expect(screen.getByRole('button', { name: '← Back' })).toBeDisabled();
    const skip = () => fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));

    await skip();
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();

    for (let i = 0; i < 4; i++) await skip();
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('begin stores the session immediately; each unit updates it', async () => {
    renderPage(program, 0, 0); // holds only: A, A, B·L, B·R
    await begin();
    expect(vi.mocked(startSession).mock.calls[0][0]).toEqual([
      { slug: 'a', unit: 'hold', target: 2, completed: 0, rating: null },
      { slug: 'b', unit: 'hold', target: 2, completed: 0, rating: null }
    ]);
    await vi.advanceTimersByTimeAsync(5000); // 3s prep + 2s hold → first unit done
    expect(updateSession).toHaveBeenCalledWith('uuid-1', {
      exercises: [
        { slug: 'a', unit: 'hold', target: 2, completed: 1, rating: null },
        { slug: 'b', unit: 'hold', target: 2, completed: 0, rating: null }
      ],
      notes: ''
    });
  });

  test('completion shows the rating dialog; Save stores ratings + notes', async () => {
    renderPage(program, 0, 0);
    await begin();
    for (let i = 0; i < 4; i++) {
      await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    }
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(10); // 5 options × 2 exercises

    await fireEvent.click(screen.getAllByRole('radio', { name: 'Just right' })[0]);
    await fireEvent.click(screen.getAllByRole('radio', { name: 'Too hard' })[1]);
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'left side weak' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(vi.mocked(updateSession).mock.lastCall).toEqual([
      'uuid-1',
      {
        exercises: [
          { slug: 'a', unit: 'hold', target: 2, completed: 0, rating: 3 },
          { slug: 'b', unit: 'hold', target: 2, completed: 0, rating: 4 }
        ],
        notes: 'left side weak'
      }
    ]);
    expect(goto).toHaveBeenCalledWith('/history');
  });

  test('tap-paced reps show Done and advance without a timer', async () => {
    renderPage([ex({ slug: 'r', mode: 'reps', scheme: '2', holdSeconds: undefined })]);
    await begin(); // first step is a rep → no timer starts
    expect(mode()).toBe('active');
    expect(screen.getByText('✓')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText('2/2')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });

  test('auto-run halts on a rep and resumes when Done is tapped', async () => {
    const mixed: Exercise[] = [
      ex({ slug: 'h1' }),
      ex({ slug: 'r', mode: 'reps', holdSeconds: undefined }),
      ex({ slug: 'h2' })
    ];
    renderPage(mixed); // steps: h1, r, Reposition, h2
    await begin();
    await vi.advanceTimersByTimeAsync(4000); // 3s prep + 1s hold → halted on the rep
    expect(screen.getByRole('button', { name: 'Done ✓' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    expect(mode()).toBe('reposition');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000); // reposition 1s + h2 1s
    expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  });
});
