import { afterEach, describe, expect, it, vi } from 'vitest';

type Osc = {
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

// The module caches its AudioContext across calls; reset modules so each test
// gets a fresh, un-cached copy wired to that test's stubs.
async function load(): Promise<typeof import('./audio')> {
  vi.resetModules();
  return await import('./audio');
}

function stubAudio(): Osc[] {
  const oscs: Osc[] = [];
  class FakeAudio {
    currentTime = 1;
    destination = {};
    createOscillator(): Osc {
      const osc: Osc = { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscs.push(osc);
      return osc;
    }
  }
  vi.stubGlobal('AudioContext', FakeAudio);
  return oscs;
}

describe('audio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('plays the documented tone sequences and vibrates', async () => {
    const oscs = stubAudio();
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const audio = await load();

    audio.holdDone();
    expect(oscs.map((o) => o.frequency.value)).toEqual([880]);
    expect(oscs[0].start).toHaveBeenCalledWith(1);
    expect(oscs[0].stop).toHaveBeenCalledWith(1.15);
    expect(vibrate).toHaveBeenCalledWith(200);

    oscs.length = 0;
    audio.lastRep();
    expect(oscs.map((o) => o.frequency.value)).toEqual([880, 880]);

    oscs.length = 0;
    audio.setDone();
    expect(oscs.map((o) => o.frequency.value)).toEqual([880, 660]);

    oscs.length = 0;
    audio.exerciseDone();
    expect(oscs.map((o) => o.frequency.value)).toEqual([660, 880, 1100]);
  });

  it('countdownTick plays a short low tick without vibrating', async () => {
    const oscs = stubAudio();
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const audio = await load();
    audio.countdownTick();
    expect(oscs.map((o) => o.frequency.value)).toEqual([660]);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('reuses a single AudioContext across calls', async () => {
    let instances = 0;
    class FakeAudio {
      currentTime = 0;
      destination = {};
      constructor() {
        instances += 1;
      }
      createOscillator(): Osc {
        return { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      }
    }
    vi.stubGlobal('AudioContext', FakeAudio);
    vi.stubGlobal('navigator', {});
    const audio = await load();
    audio.holdDone();
    audio.holdDone();
    expect(instances).toBe(1);
  });

  it('survives a blocked AudioContext and a missing vibrate', async () => {
    class Blocked {
      constructor() {
        throw new Error('blocked');
      }
    }
    vi.stubGlobal('AudioContext', Blocked);
    vi.stubGlobal('navigator', {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audio = await load();
    expect(() => audio.holdDone()).not.toThrow();
    expect(warn).toHaveBeenCalledWith('audio failed', expect.any(Error));
  });
});
