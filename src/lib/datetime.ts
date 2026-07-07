// Date -> value for <input type="datetime-local"> in local time (the same clock
// the streak logic uses), i.e. "YYYY-MM-DDTHH:mm". Parsing back is just
// `new Date(value)`, which reads the value as local time.

export function toLocalInput(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
