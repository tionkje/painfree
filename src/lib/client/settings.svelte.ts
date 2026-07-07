// Client-local timer settings — the rest/reposition pauses for the auto-run
// workout. Offline-first: lives in localStorage, not the DB. Single user, so no
// cross-device sync (edit on /settings; a reload picks up the value).

const KEY = 'timers';

export type Timers = { restSeconds: number; repositionSeconds: number };

const DEFAULTS: Timers = { restSeconds: 5, repositionSeconds: 15 };

export function read(): Timers {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Timers) : { ...DEFAULTS };
}

export const timers = $state<Timers>(read());

export function setTimers(next: Timers): void {
  timers.restSeconds = next.restSeconds;
  timers.repositionSeconds = next.repositionSeconds;
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next));
}
