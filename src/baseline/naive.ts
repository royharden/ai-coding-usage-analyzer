import { asRecord, readJsonLines } from '../core/lines';

// Deliberately wrong accounting negative control. The only shared core module is lines.ts.
// No deduplication, terminal selection, delta calculation, cache subtraction, dated rates or unresolved quarantine.
export interface NaiveSource { agent: 'claude' | 'codex'; fileId: string; name: string; read: () => AsyncIterable<Uint8Array> }
export interface NaivePlatform { decodeUtf8(bytes: Uint8Array): string; sha256(text: string): Promise<string> }
const bucketNames = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'] as const;
type Bucket = typeof bucketNames[number];
type Totals = Record<Bucket, bigint>;
function empty(): Totals { return { input: 0n, output: 0n, cacheWrite5m: 0n, cacheWrite1h: 0n, cacheRead: 0n }; }
function integer(value: unknown): bigint { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : 0n; }
function strings(value: Totals) { return Object.fromEntries(bucketNames.map(key => [key, value[key].toString()])) as Record<Bucket, string>; }

/** Sum every usage vector encountered, including both total and last and nested cache splits plus total.
 * Unassigned total_tokens and reasoning_output_tokens are deliberately added to output too.
 * Unknown models are priced at zero. Unsupported behavioral/quality/reason populations are omitted, not invented.
 */
export async function naiveSum(sources: readonly NaiveSource[], priceValue: unknown, platform: NaivePlatform,
  filters: { tz: string; since: string | null; until: string | null }) {
  const tokens = empty();
  let knownPico = 0n, usageVectors = 0;
  const prices = asRecord(priceValue), rows = Array.isArray(prices?.rows) ? prices.rows : [];
  const firstRates = new Map<string, Record<string, unknown>>();
  for (const item of rows) { const row = asRecord(item); if (row && typeof row.model === 'string' && !firstRates.has(row.model)) firstRates.set(row.model, row); }
  const rateKeys: Record<Bucket, string> = { input: 'input', output: 'output', cacheWrite5m: 'cache_write_5m', cacheWrite1h: 'cache_write_1h', cacheRead: 'cache_read' };
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: filters.tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const source of sources) {
    if (!source.name.toLowerCase().endsWith('.jsonl')) continue;
    // A single file model is intentionally a primitive baseline assumption, not the core's context resolver.
    let fileModel = '';
    for await (const line of readJsonLines(source.read(), source.fileId, platform)) {
      if (line.kind !== 'record') continue;
      const row = line.value, message = asRecord(row.message), payload = asRecord(row.payload);
      if (typeof payload?.model === 'string') fileModel = payload.model;
      if (filters.since !== null || filters.until !== null) {
        if (typeof row.timestamp !== 'string' || !Number.isFinite(Date.parse(row.timestamp))) continue;
        const parts = formatter.formatToParts(new Date(row.timestamp));
        const part = (kind: string) => parts.find(value => value.type === kind)?.value ?? '';
        const day = `${part('year')}-${part('month')}-${part('day')}`;
        if ((filters.since !== null && day < filters.since) || (filters.until !== null && day > filters.until)) continue;
      }
      const model = typeof message?.model === 'string' ? message.model : fileModel;
      const stack: unknown[] = [row];
      while (stack.length > 0) {
        const object = asRecord(stack.pop());
        if (!object) continue;
        if (Object.keys(object).some(key => key.endsWith('_tokens'))) {
          const vector = empty();
          vector.input = integer(object.input_tokens);
          vector.output = integer(object.output_tokens) + integer(object.reasoning_output_tokens) + integer(object.total_tokens);
          vector.cacheRead = integer(object.cache_read_input_tokens) + integer(object.cached_input_tokens);
          vector.cacheWrite5m = integer(object.cache_creation_input_tokens) + integer(object.cache_write_input_tokens) + integer(object.ephemeral_5m_input_tokens);
          vector.cacheWrite1h = integer(object.ephemeral_1h_input_tokens);
          usageVectors += 1;
          const rate = firstRates.get(model);
          for (const bucket of bucketNames) { tokens[bucket] += vector[bucket]; knownPico += vector[bucket] * integer(rate?.[rateKeys[bucket]]); }
        }
        for (const value of Object.values(object)) {
          if (Array.isArray(value)) stack.push(...value); else if (asRecord(value)) stack.push(value);
        }
      }
    }
  }
  return { tokens: strings(tokens), cost: { knownPico: knownPico.toString() }, usageVectors,
    limitations: 'Negative control: raw usage fields per row; totals/last/reasoning/splits double counted; one rate per model; unknown cost zero. No behavior, quality or reason metrics.' };
}
