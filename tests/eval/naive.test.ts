import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { naiveSum } from '../../src/baseline/naive';
import { nodePlatform } from '../../src/node/platform';
import { fixtureIds, loadFixture, repository, scoreFixture } from '../../scripts/eval-lib';

describe('runnable intentionally incorrect accounting control', () => {
  it('shares only lines.ts with core, including type imports', async () => {
    const source = await readFile(join(repository, 'src/baseline/naive.ts'), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
    expect(imports).toEqual(['../core/lines']);
  });
  it('double counts nested split+total and every repeated row, and unknown cost becomes zero', async () => {
    const text = '{"message":{"model":"unknown","usage":{"input_tokens":2,"output_tokens":1,"cache_creation_input_tokens":3,"cache_creation":{"ephemeral_5m_input_tokens":2,"ephemeral_1h_input_tokens":1}}}}\n';
    const data = new TextEncoder().encode(text + text);
    const result = await naiveSum([{ agent: 'claude', fileId: 'f1', name: 'synthetic.jsonl', read: async function* () { yield data; } }],
      { rows: [] }, nodePlatform, { tz: 'UTC', since: null, until: null });
    expect(result.tokens).toEqual({ input: '4', output: '2', cacheWrite5m: '10', cacheWrite1h: '2', cacheRead: '0' });
    expect(result.cost.knownPico).toBe('0');
  });
  it('differs from every tagged dev accounting-control oracle on supported accounting fields', async () => {
    let controls = 0;
    for (const id of await fixtureIds(repository, 'dev')) {
      const fixture = await loadFixture(repository, 'dev', id);
      if (!fixture.expected.tags.includes('accounting-control')) continue;
      const score = await scoreFixture(repository, 'dev', id); controls += 1;
      expect(score.negativeControlDifferences.length, id).toBeGreaterThan(0);
    }
    expect(controls).toBeGreaterThan(0);
  });
});
