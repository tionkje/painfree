// Web-audio blips for the auto-run workout. Fire-and-forget: a blocked
// AudioContext must never break the timer, so play() catches and warns.
// One shared context (created lazily on the first user-triggered sound, so
// autoplay policies allow it) instead of one per blip.

type Note = [freq: number, at: number, dur: number];

let ctx: AudioContext | null = null;

function play(notes: Note[], vibrateMs: number): void {
  try {
    ctx ??= new AudioContext();
    for (const [freq, at, dur] of notes) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + dur);
    }
  } catch (e) {
    console.warn('audio failed', e);
  }
  if (vibrateMs > 0) navigator.vibrate?.(vibrateMs);
}

/** Short low tick for each get-ready / lead-in second before a hold. */
export function countdownTick(): void {
  play([[660, 0, 0.1]], 0);
}

/** A hold finished; more of the same set to come. */
export function holdDone(): void {
  play([[880, 0, 0.15]], 200);
}

/** Heads-up: the rep that just started is the last one of its set. */
export function lastRep(): void {
  play(
    [
      [880, 0, 0.1],
      [880, 0.15, 0.1]
    ],
    200
  );
}

/** Set finished — reposition next. Descending pair. */
export function setDone(): void {
  play(
    [
      [880, 0, 0.15],
      [660, 0.2, 0.3]
    ],
    300
  );
}

/** Whole exercise finished (also marks the end of the workout). Ascending triad. */
export function exerciseDone(): void {
  play(
    [
      [660, 0, 0.12],
      [880, 0.15, 0.12],
      [1100, 0.3, 0.35]
    ],
    500
  );
}
