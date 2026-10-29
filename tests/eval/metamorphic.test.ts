import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/analyze';
import type { InputSource } from '../../src/core/analyze';
import { toFixturePopulations } from '../../src/core/serialize';
import { nodePlatform } from '../../src/node/platform';
import { comparePopulations, loadFixture, repository } from '../../scripts/eval-lib';

type Transform = 'shuffle' | 'split' | 'copy' | 'malformed';
async function bytes(source: InputSource): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of source.read()) { chunks.push(chunk); size += chunk.byteLength; }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; } return result;
}
function memory(source: InputSource, data: Uint8Array, suffix = ''): InputSource {
  return { ...source, fileId: '', relativePath: `${suffix}${source.relativePath}`, size: data.byteLength,
    read: async function* () { yield data; } };
}
async function transform(sources: readonly InputSource[], mode: Transform): Promise<InputSource[]> {
  const output: InputSource[] = [];
  for (const source of sources) {
    const data = await bytes(source);
    // Only complete, UTF-8, LF-terminated candidate files are selected below.
    const lines = new TextDecoder('utf-8', { fatal: true }).decode(data).split('\n');
    expect(lines.pop()).toBe('');
    const encode = (items: string[]) => new TextEncoder().encode(`${items.join('\n')}\n`);
    if (mode === 'shuffle') output.push(memory(source, encode([...lines].reverse())));
    if (mode === 'split') {
      const pivot = Math.ceil(lines.length / 2);
      output.push(memory(source, encode(lines.slice(0, pivot)), 'part-a/'));
      if (pivot < lines.length) output.push(memory(source, encode(lines.slice(pivot)), 'part-b/'));
    }
    if (mode === 'copy') output.push(memory(source, data), memory(source, data, 'copy/'));
    if (mode === 'malformed') output.push(memory(source, output.length === 0 ? encode([...lines, '{malformed']) : data));
  }
  return output.map((source, index) => ({ ...source, fileId: `f${index + 1}` }));
}
const variantCounters = new Set(['rowsRead', 'rowsRecognised', 'claude_duplicate_rows', 'duplicate_copy', 'ignored_record_kind',
  'codex_token_count_empty', 'codex_embedded_parent_meta', 'claude_duplicate_tool_use', 'claude_duplicate_turn']);
function invariants(value: ReturnType<typeof toFixturePopulations>, mode: Transform) {
  // PLAN §5 excludes only these per-line/extra-copy counters, skips and complete after an added malformed line.
  // All remaining row-uuid/event/group/step/session counters must remain exact.
  return { tz: value.tz, since: value.since, until: value.until, tokens: value.tokens, tokensByQuality: value.tokensByQuality,
    cost: value.cost, cacheHit: value.cacheHit, events: value.events, modelCalls: value.modelCalls, byDay: value.byDay,
    unresolved: value.unresolved, turns: value.turns, tools: value.tools, toolResults: value.toolResults,
    retries: value.retries, retryAmbiguous: value.retryAmbiguous,
    counters: Object.fromEntries(Object.entries(value.counters).filter(([code]) => !variantCounters.has(code))),
    ...(mode === 'malformed' ? {} : { complete: value.complete }) };
}

describe('M4 deterministic metamorphic accounting contracts (dev only)', () => {
  // No tied retry candidates, timestamp-divergent tool copies, evidence-selection claims, malformed/capped inputs.
  // D17 is excluded: same tool identity with differing timestamps and missing-uuid fallback row units.
  const suitable = ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11', 'D13', 'D15', 'D16', 'D19', 'D20', 'D21'];
  for (const id of suitable) for (const mode of ['shuffle', 'split', 'copy', 'malformed'] as const)
    it(`${id}: ${mode} preserves required populations`, async () => {
      const { expected, walked, priceTableText, analysisOptions } = await loadFixture(repository, 'dev', id);
      expect(analysisOptions).toBeUndefined();
      const options = { tz: expected.tz, since: expected.since ?? undefined, until: expected.until ?? undefined,
        priceTableText, intakeDiagnostics: walked.diagnostics };
      const original = toFixturePopulations(await analyze(walked.sources, options, nodePlatform));
      const changed = toFixturePopulations(await analyze(await transform(walked.sources, mode), options, nodePlatform));
      expect(comparePopulations(invariants(original, mode), invariants(changed, mode))).toEqual([]);
    });
  it('retains the explicit ambiguous-order diagnostic instead of claiming split invariance for tied retry D18', async () => {
    const { expected, walked, priceTableText } = await loadFixture(repository, 'dev', 'D18');
    const report = await analyze(await transform(walked.sources, 'shuffle'), { tz: expected.tz, priceTableText }, nodePlatform);
    expect(report.retryAmbiguous).toBeGreaterThan(0);
    expect(report.counters.get('retry_ambiguous_order')).toBe(report.retryAmbiguous);
  });
  for (const mode of ['shuffle', 'split', 'copy', 'malformed'] as const)
    it(`D17 stable subset: ${mode} preserves orphan/status-conflict counters`, async () => {
      const { expected, walked, priceTableText } = await loadFixture(repository, 'dev', 'D17');
      // A declared suitable subset removes the timestamp-divergent tool copy and missing-uuid fallback row.
      // This is a metamorphic relation, not a score against the full D17 oracle.
      const subset: InputSource[] = [];
      for (const source of walked.sources) {
        const lines = new TextDecoder().decode(await bytes(source)).trimEnd().split('\n').filter(line => {
          const row = JSON.parse(line) as Record<string, unknown>;
          return row.uuid !== undefined && row.uuid !== 'D17-unresolved-copy-row';
        });
        subset.push({ ...memory(source, new TextEncoder().encode(`${lines.join('\n')}\n`)), fileId: `f${subset.length + 1}` });
      }
      const options = { tz: expected.tz, priceTableText };
      const original = toFixturePopulations(await analyze(subset, options, nodePlatform));
      expect(original.counters.orphan_tool_result).toBe(1); expect(original.counters.claude_tool_status_conflict).toBe(1);
      const changed = toFixturePopulations(await analyze(await transform(subset, mode), options, nodePlatform));
      expect(comparePopulations(invariants(original, mode), invariants(changed, mode))).toEqual([]);
    });
});
