import { parseTimestamp } from './timestamp';

export interface FilterWindow { tz: string; since: string | null; until: string | null }
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseTimestamp(`${value}T00:00:00Z`) !== undefined;
}
// rule I6: validation happens before callers open input files.
export function validateFilters(tz: string, since?: string, until?: string): FilterWindow {
  if (/^[+-]/.test(tz)) throw new Error('Invalid report time zone');
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0); }
  catch { throw new Error('Invalid report time zone'); }
  if (!tz || (since !== undefined && !validDate(since)) || (until !== undefined && !validDate(until)))
    throw new Error('Invalid civil date filter');
  if (since !== undefined && until !== undefined && since > until) throw new Error('Reversed civil date filter');
  return { tz, since: since ?? null, until: until ?? null };
}
// rule 4.5: derive civil day in the requested zone; never assume a day is 24 hours.
export function dayKey(tsMs: number, tz: string): string {
  return makeDayKey(tz)(tsMs);
}
export function makeDayKey(tz: string): (tsMs: number) => string {
  const formatter = new Intl.DateTimeFormat('en-US-u-ca-iso8601-nu-latn', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', era: 'short',
  });
  return tsMs => {
    const parts = formatter.formatToParts(tsMs);
    const value = (kind: Intl.DateTimeFormatPartTypes): string => parts.find(part => part.type === kind)?.value ?? '';
    const year = value('era') === 'BC' ? 1 - Number(value('year')) : Number(value('year'));
    const yearText = year < 0 ? `-${(-year).toString().padStart(4, '0')}` : year.toString().padStart(4, '0');
    return `${yearText}-${value('month')}-${value('day')}`;
  };
}
/** Civil-key comparison equals the inclusive local-day window, including short/long DST days. */
export function withinFilters(tsMs: number, filters: FilterWindow): boolean {
  return filterPredicate(filters)(tsMs);
}
export function filterPredicate(filters: FilterWindow): (tsMs: number) => boolean {
  const key = makeDayKey(filters.tz);
  return tsMs => { const day = key(tsMs); return (filters.since === null || compareCivilDays(day, filters.since) >= 0) &&
    (filters.until === null || compareCivilDays(day, filters.until) <= 0); };
}
/** Offset normalization can cross year0000/9999; compare expanded years numerically. */
export function compareCivilDays(a: string, b: string): number {
  const parts = (day: string): number[] => {
    const match = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(day);
    if (!match) throw new Error('Invalid civil day key');
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const left = parts(a), right = parts(b);
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0); if (delta) return delta;
  }
  return 0;
}
export function localTimeZone(): string { return new Intl.DateTimeFormat().resolvedOptions().timeZone; }
