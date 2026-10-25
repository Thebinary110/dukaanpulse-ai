/** Calendar helpers. All dataset days are IST calendar days indexed from a start date. */

export const MS_PER_DAY = 86_400_000;
/** IST is a fixed UTC+05:30 offset (no daylight saving). */
export const IST_OFFSET_MS = 5.5 * 3_600_000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parseISODate(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Invalid ISO date: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Epoch ms of IST midnight at the start of `day`. */
export function dayStartTimestamp(startDate: string, day: number): number {
  return parseISODate(startDate) + day * MS_PER_DAY - IST_OFFSET_MS;
}

/** IST calendar date of `day` as YYYY-MM-DD. */
export function dayToISODate(startDate: string, day: number): string {
  return new Date(parseISODate(startDate) + day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for the IST calendar date of `day`. */
export function dayOfWeek(startDate: string, day: number): number {
  return new Date(parseISODate(startDate) + day * MS_PER_DAY).getUTCDay();
}

export function weekdayLabel(startDate: string, day: number): string {
  return WEEKDAYS[dayOfWeek(startDate, day)]!;
}

/** Short label such as "20 Oct". */
export function shortDateLabel(startDate: string, day: number): string {
  const d = new Date(parseISODate(startDate) + day * MS_PER_DAY);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
