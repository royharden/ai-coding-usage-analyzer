import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareExternal, runCrosscheck } from '../../scripts/crosscheck';

const own = { schema: 's22-report/1', tokens: { input: '10', output: '2', cacheWrite5m: '3', cacheWrite1h: '1', cacheRead: '4' },
  cost: { knownPico: '10000000000' } };
const usage = { totals: { inputTokens: 10, outputTokens: 2, cacheCreationTokens: 4, cacheReadTokens: 4, totalCost: 0.01 } };

describe('M4 external comparison: supplied numbers only', () => {
  it('compares ccusage totals without inventing a cache TTL split', () => {
    const result = compareExternal(own, usage, 'ccusage', 'pinned-test-version');
    expect(result.status).toBe('measured');
    expect(result.fields.find(row => row.field === 'input')?.status).toBe('agree');
    expect(result.fields.find(row => row.field === 'knownCostPico')?.external).toBe('10000000000');
    expect(result.fields.find(row => row.field === 'cacheWriteTotal')?.status).toBe('agree');
    expect(result.fields.find(row => row.field === 'cacheWrite5m')?.status).toBe('not measured');
    expect(result.fields.find(row => row.field === 'cacheWrite1h')?.external).toBeNull();
  });

  it('sums only top-level ccstats periods and subtracts the 1h subset', () => {
    const rows = [
      { input_tokens: 5, output_tokens: 1, cache_creation_tokens: 2, cache_creation_1h_tokens: 1, cache_read_tokens: 2,
        cost: '0.005', breakdown: [{ input_tokens: 999999, cost: 99 }] },
      { input_tokens: 5, output_tokens: 1, cache_creation_tokens: 2, cache_creation_1h_tokens: 0, cache_read_tokens: 2, cost: 0.005 },
    ];
    const result = compareExternal(own, rows, 'ccstats', 'pinned-test-version');
    expect(result.fields.every(row => row.status === 'agree')).toBe(true);
  });

  it('does not guess aggregate semantics for a ccusage top-level array', () => {
    const result = compareExternal(own, [usage.totals, usage.totals], 'ccusage', 'pinned-test-version');
    expect(result.status).toBe('not measured');
    expect(result.fields.every(row => row.external === null)).toBe(true);
  });

  it('shows codeburn differences without treating them as billing truth', () => {
    const result = compareExternal(own, { inputTokens: 11, outputTokens: 2, cacheCreationInputTokens: 4,
      cacheReadInputTokens: 4, costUSD: '0.01' }, 'codeburn', 'pinned-test-version');
    expect(result.fields.find(row => row.field === 'input')).toMatchObject({ analyzer: '10', external: '11', status: 'different' });
    expect(result.notes.join(' ')).toContain('Diagnostic comparison only');
  });

  it('does not silently zero missing, unsafe, or fractional-pico fields', () => {
    const result = compareExternal(own, { totals: { inputTokens: Number.MAX_SAFE_INTEGER + 1, totalCost: '0.0000000000001' } },
      'ccusage', 'pinned-test-version');
    expect(result.status).toBe('not measured');
    expect(result.fields.every(row => row.external === null && row.status === 'not measured')).toBe(true);
  });

  it('refuses a partial external sum when a period omits its field', () => {
    const result = compareExternal(own, [{ input_tokens: 10 }, {}], 'ccstats', 'pinned-test-version');
    expect(result.fields.find(row => row.field === 'input')?.external).toBeNull();
  });

  it('marks an unsupported external shape unmeasured and never returns its raw strings', () => {
    const result = compareExternal(own, { rawPrompt: 'DO-NOT-EXPORT-ME', sessions: [] }, 'ccusage', 'pinned-test-version');
    expect(result.status).toBe('not measured');
    expect(JSON.stringify(result)).not.toContain('DO-NOT-EXPORT-ME');
  });

  it('reports not measured without reading anything when no external file is given', async () => {
    let output = '', reads = 0;
    await runCrosscheck([], { readJson: async () => { reads += 1; return {}; }, write: text => { output += text; } });
    expect(reads).toBe(0);
    expect(output).toBe('not measured: no external JSON supplied\n');
  });

  it('requires pinned metadata before I/O and writes field-level JSON for supplied files', async () => {
    let reads = 0, output = '';
    const io = { readJson: async (path: string) => { reads += 1; return path === 'own.json' ? own : usage; },
      write: (text: string) => { output += text; } };
    await expect(runCrosscheck(['--json', 'external.json', '--tool', 'ccusage', '--analyzer', 'own.json'], io)).rejects.toThrow();
    expect(reads).toBe(0);
    await expect(runCrosscheck(['--json', 'external.json', '--tool', 'ccusage', '--tool-version', 'bad\nversion', '--analyzer', 'own.json'], io)).rejects.toThrow();
    expect(reads).toBe(0);
    await runCrosscheck(['--json', 'external.json', '--tool', 'ccusage', '--tool-version', '1.2.3', '--analyzer', 'own.json'], io);
    expect(reads).toBe(2);
    expect(JSON.parse(output)).toMatchObject({ schema: 's22-crosscheck/1', toolVersion: '1.2.3', status: 'measured' });
  });

  it('has no subprocess or network dependency', () => {
    const source = readFileSync(new URL('../../scripts/crosscheck.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/(?:child_process|node:https?['"]|node:net['"]|node:tls['"]|node:dgram['"])/u);
  });
});
