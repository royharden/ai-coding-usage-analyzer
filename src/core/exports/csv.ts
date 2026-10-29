import { serializeReport } from '../serialize';
import type { Report } from '../types';
import { flatFields } from './flat';

const columns = ['record_type', 'group', 'key', 'label', 'input', 'output', 'cache_write_5m',
  'cache_write_1h', 'cache_read', 'cost_pico_usd', 'events', 'unknown_price_events', 'field', 'value'] as const;
type CsvRow = Partial<Record<typeof columns[number], string | number | boolean>>;

// rule 4.7: defang spreadsheet formulas before applying RFC 4180 quoting to every cell.
export function csvCell(value: string | number | boolean | undefined): string {
  let text = value === undefined ? '' : String(value);
  if (/^\s*[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// rule P5 / rule I7: exact decimal strings, safe display keys, and shared report metadata.
export function toCsv(report: Report): string {
  const safe = serializeReport(report);
  const rows: CsvRow[] = [];
  const tokens = (value: typeof safe.tokens) => ({ input: value.input, output: value.output,
    cache_write_5m: value.cacheWrite5m, cache_write_1h: value.cacheWrite1h, cache_read: value.cacheRead });
  rows.push({ record_type: 'total', ...tokens(safe.tokens), cost_pico_usd: safe.cost.knownPico,
    events: safe.events.total, unknown_price_events: safe.cost.unknownPriceEvents.total });
  for (const [name, groups] of Object.entries(safe.groupings)) {
    for (const row of groups) rows.push({ record_type: 'group', group: name, key: row.key, label: row.label,
      ...tokens(row.tokens), cost_pico_usd: row.knownPico, events: row.events, unknown_price_events: row.unknownPriceEvents });
  }
  // These rows include tz/filters/digest/complete, qualities, unknown/unresolved counts and behavior metrics.
  for (const [name, value] of Object.entries(safe)) {
    if (name === 'groupings') continue;
    for (const [field, leaf] of flatFields(value, [name])) rows.push({ record_type: 'field', field, value: leaf });
  }
  return [columns.map(csvCell).join(','), ...rows.map(row => columns.map(name => csvCell(row[name])).join(','))]
    .join('\r\n') + '\r\n';
}
