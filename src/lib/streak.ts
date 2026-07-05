// Pure date logic for the daily streak. Kept free of DB/time-now so it's testable.

/** Local YYYY-MM-DD for a timestamp. */
export function dayKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * Consecutive-day streak ending today (or yesterday — a streak stays alive
 * until a full day is missed). `now` and session dates are compared by local day.
 */
export function currentStreak(sessionDates: Date[], now: Date): number {
	const days = new Set(sessionDates.map(dayKey));
	if (days.size === 0) return 0;

	const cursor = new Date(now);
	// If today isn't done yet, the streak can still be counted from yesterday.
	if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

	let streak = 0;
	while (days.has(dayKey(cursor))) {
		streak++;
		cursor.setDate(cursor.getDate() - 1);
	}
	return streak;
}

export function doneToday(sessionDates: Date[], now: Date): boolean {
	const today = dayKey(now);
	return sessionDates.some((d) => dayKey(d) === today);
}
