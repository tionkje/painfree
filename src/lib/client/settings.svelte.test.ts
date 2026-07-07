import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as settings from './settings.svelte';
import { timers } from './settings.svelte';

beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  settings.setTimers({ restSeconds: 5, repositionSeconds: 15 });
});

describe('timer settings', () => {
  it('read returns defaults when nothing is stored', () => {
    localStorage.clear();
    expect(settings.read()).toEqual({ restSeconds: 5, repositionSeconds: 15 });
  });

  it('read parses stored timers', () => {
    localStorage.setItem('timers', JSON.stringify({ restSeconds: 3, repositionSeconds: 9 }));
    expect(settings.read()).toEqual({ restSeconds: 3, repositionSeconds: 9 });
  });

  it('read returns defaults without localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(settings.read()).toEqual({ restSeconds: 5, repositionSeconds: 15 });
    vi.unstubAllGlobals();
  });

  it('setTimers updates state and persists', () => {
    settings.setTimers({ restSeconds: 2, repositionSeconds: 20 });
    expect(timers.restSeconds).toBe(2);
    expect(timers.repositionSeconds).toBe(20);
    expect(JSON.parse(localStorage.getItem('timers') ?? '{}')).toEqual({
      restSeconds: 2,
      repositionSeconds: 20
    });
  });

  it('setTimers is a no-op on persistence without localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => settings.setTimers({ restSeconds: 1, repositionSeconds: 1 })).not.toThrow();
    vi.unstubAllGlobals();
  });
});
