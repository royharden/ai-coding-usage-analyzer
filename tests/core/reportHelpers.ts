import { analyze } from '../../src/core/analyze';
import type { AnalyzeOptions, InputSource } from '../../src/core/analyze';
import type { Agent } from '../../src/core/types';
import { platform } from './helpers';

export const priceTableText = JSON.stringify({ schema: 'pricetable/1', currency: 'USD', unit: 'micro_usd_per_mtok', rows: [
  { model: 'claude-test-a', effective_from: '2026-01-01T00:00:00Z', input: 2, output: 10,
    cache_write_5m: 3, cache_write_1h: 4, cache_read: 1, source_url: 'https://example.invalid/synthetic', retrieved: '2026-10-24' },
  { model: 'gpt-test-x', effective_from: '2026-01-01T00:00:00Z', input: 1, output: 4,
    cache_read: 1, source_url: 'https://example.invalid/synthetic', retrieved: '2026-10-24' },
] });
export function source(agent: Agent, records: readonly unknown[], fileId = 'f1', name = 'sample.jsonl'): InputSource {
  return textSource(agent, records.map(record => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), fileId, name);
}
export function textSource(agent: Agent, text: string, fileId = 'f1', name = 'sample.jsonl'): InputSource {
  const data = new TextEncoder().encode(text);
  return { agent, fileId, name, relativePath: `synthetic/${name}`, size: data.length,
    read: async function* () { for (let offset = 0; offset < data.length; offset += 7) yield data.subarray(offset, offset + 7); } };
}
export function report(sources: readonly InputSource[] = [], options: Partial<AnalyzeOptions> = {}) {
  return analyze(sources, { tz: 'UTC', priceTableText, ...options }, platform);
}
