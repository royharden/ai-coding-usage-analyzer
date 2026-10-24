/** Strict RFC3339 instant parser, independent of host Date parsing heuristics. */
// rule I1
export function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0) || hour > 23 || minute > 59 || second > 59) return undefined;
  const zone = match[8];
  if (zone === '-00:00') return undefined;
  let offset = 0;
  if (zone !== 'Z' && zone !== undefined) {
    const zoneHour = Number(zone.slice(1, 3)), zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return undefined;
    offset = (zoneHour * 60 + zoneMinute) * (zone.startsWith('-') ? -1 : 1);
  }
  // setUTCFullYear avoids Date.UTC's special interpretation of years 00..99.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, Number((match[7] ?? '').padEnd(3, '0').slice(0, 3)));
  return date.getTime() - offset * 60_000;
}
