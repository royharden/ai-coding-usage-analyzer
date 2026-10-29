import { asRecord } from './lines';
import { identityTooLong } from './limits';
import { parseTimestamp } from './timestamp';
import { count } from './validation';
import type { Buckets, Cost, UsageEvent } from './types';

export interface PriceRow {
  model: string; effectiveFromMs: number; effective_from: string;
  input?: bigint; output?: bigint; cache_write_5m?: bigint; cache_write_1h?: bigint; cache_read?: bigint;
  max_input_tokens_per_call?: bigint;
  supported_service_tiers?: string[]; supported_speeds?: string[]; supported_inference_geos?: string[];
  source_url: string; retrieved: string;
}
export interface PriceTable { schema: 'pricetable/1'; currency: 'USD'; unit: 'micro_usd_per_mtok'; rows: PriceRow[] }
const rates = ['input', 'output', 'cache_write_5m', 'cache_write_1h', 'cache_read'] as const;
const lists = ['supported_service_tiers', 'supported_speeds', 'supported_inference_geos'] as const;

// rule P1
// rule P3: reject the entire table; do not silently drop malformed price rows.
export function validatePriceTable(value: unknown): PriceTable {
  const object = asRecord(value);
  if (!object || object.schema !== 'pricetable/1' || object.currency !== 'USD' || object.unit !== 'micro_usd_per_mtok' || !Array.isArray(object.rows))
    throw new Error('Invalid price table header');
  const identities = new Map<string, Set<number>>();
  const rows: PriceRow[] = [];
  for (const [index, candidate] of object.rows.entries()) {
    const row = asRecord(candidate);
    function fail(): never { throw new Error(`Invalid price row ${index + 1}`); }
    if (!row || typeof row.model !== 'string' || row.model === '' || identityTooLong([row.model]) ||
      typeof row.effective_from !== 'string' || !row.effective_from.endsWith('Z') || typeof row.source_url !== 'string' ||
      !/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(row.source_url) || typeof row.retrieved !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.retrieved) || parseTimestamp(`${row.retrieved}T00:00:00Z`) === undefined) fail();
    const effectiveFromMs = parseTimestamp(row.effective_from);
    if (effectiveFromMs === undefined) fail();
    const typed: PriceRow = { model: row.model, effective_from: row.effective_from, effectiveFromMs,
      source_url: row.source_url, retrieved: row.retrieved };
    for (const key of rates) {
      if (row[key] === undefined) continue;
      const rate = count(row[key]);
      if (rate === undefined) fail();
      typed[key] = rate;
    }
    if (row.max_input_tokens_per_call !== undefined) {
      const maximum = count(row.max_input_tokens_per_call);
      if (maximum === undefined) fail();
      typed.max_input_tokens_per_call = maximum;
    }
    for (const key of lists) {
      const list = row[key];
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.some(item => typeof item !== 'string' || item === '' || identityTooLong([item]))) fail();
      typed[key] = list as string[];
    }
    let dates = identities.get(typed.model);
    if (!dates) { dates = new Set(); identities.set(typed.model, dates); }
    if (dates.has(typed.effectiveFromMs)) fail();
    dates.add(typed.effectiveFromMs); rows.push(typed);
  }
  return { schema: 'pricetable/1', currency: 'USD', unit: 'micro_usd_per_mtok', rows };
}

// rule P2: exact model id and latest UTC instant <= event; no alias fallback.
export function selectPrice(table: PriceTable, model: string, tsMs: number): PriceRow | undefined {
  let selected: PriceRow | undefined;
  for (const row of table.rows) if (row.model === model && row.effectiveFromMs <= tsMs &&
    (!selected || row.effectiveFromMs > selected.effectiveFromMs)) selected = row;
  return selected;
}
function supported(value: string | undefined, values: readonly string[]): boolean {
  return value === undefined || value === '' || values.includes(value);
}
const bucketRates: readonly [keyof Buckets, typeof rates[number]][] = [
  ['input', 'input'], ['output', 'output'], ['cacheWrite5m', 'cache_write_5m'],
  ['cacheWrite1h', 'cache_write_1h'], ['cacheRead', 'cache_read'],
];

/** Price status is independent of token completeness. Never coerce unknown into zero. */
export function priceEvent(event: UsageEvent, table: PriceTable): Cost {
  const row = selectPrice(table, event.model, event.tsMs);
  // rule P2 / rule I6: precedence no row > modifier > long context > missing rate.
  if (!row) return { kind: 'unknown', reason: 'no_price_row' };
  // rule P4
  if (event.modifiers.invalidModifier || event.modifiers.tierAmbiguous ||
    !supported(event.modifiers.serviceTier, row.supported_service_tiers ?? ['standard', 'default']) ||
    !supported(event.modifiers.speed, row.supported_speeds ?? ['standard']) ||
    !supported(event.modifiers.inferenceGeo, row.supported_inference_geos ?? ['global', 'not_available']))
    return { kind: 'unknown', reason: 'tier_unsupported' };
  const prompt = event.input + event.cacheRead + event.cacheWrite5m + event.cacheWrite1h;
  if (row.max_input_tokens_per_call !== undefined && prompt > row.max_input_tokens_per_call)
    return { kind: 'unknown', reason: 'tier_unsupported' };
  let pico = 0n;
  // rule P5: integer micro-USD / million tokens * tokens = integer pico-USD.
  for (const [bucket, rateKey] of bucketRates) {
    if (event[bucket] === 0n) continue;
    const rate = row[rateKey];
    if (rate === undefined) return { kind: 'unknown', reason: 'rate_missing' };
    pico += event[bucket] * rate;
  }
  return { kind: 'known', pico };
}
