import { test, expect } from 'vitest';
import { currentStreak, doneToday } from './streak';

const d = (s: string) => new Date(s + 'T12:00:00');
const now = d('2026-07-05');

test('no sessions = no streak', () => {
	expect(currentStreak([], now)).toBe(0);
});

test('done today counts', () => {
	expect(currentStreak([d('2026-07-05')], now)).toBe(1);
	expect(doneToday([d('2026-07-05')], now)).toBe(true);
});

test('consecutive days ending today', () => {
	expect(currentStreak([d('2026-07-03'), d('2026-07-04'), d('2026-07-05')], now)).toBe(3);
});

test('streak survives if today not done but yesterday was', () => {
	expect(currentStreak([d('2026-07-03'), d('2026-07-04')], now)).toBe(2);
	expect(doneToday([d('2026-07-04')], now)).toBe(false);
});

test('gap breaks the streak', () => {
	expect(currentStreak([d('2026-07-01'), d('2026-07-02'), d('2026-07-05')], now)).toBe(1);
});

test('multiple sessions same day count once', () => {
	expect(currentStreak([d('2026-07-05'), d('2026-07-05'), d('2026-07-04')], now)).toBe(2);
});
