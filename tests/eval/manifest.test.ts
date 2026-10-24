import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEvalArgs, reserveHeldoutRun } from '../../scripts/eval';
import { checkFixtures, devHashes, heldoutIdentity } from '../../scripts/fixture-lib';
import { comparePopulations, fixturePopulations, jsonFile, loadFixture, object, readFixtureOptions, repository, validateActual,
  validateExpected } from '../../scripts/eval-lib';

describe('frozen oracle and explicit dev-only defaults', () => {
  it('checks every dev file hash, closed schema, population relations and declared direct-test coverage', async () => {
    const checked = await checkFixtures(repository); expect(checked.ids.length).toBeGreaterThanOrEqual(24);
    const manifest = object(await jsonFile(join(repository, 'fixtures/MANIFEST.json')));
    expect(await devHashes(repository)).toEqual(object(manifest.dev).files);
    // Deliberately read metadata only: no heldout directory is opened by this default test.
    expect((object(manifest.heldout).fixtureIds as unknown[]).length).toBeGreaterThanOrEqual(10);
  });
  it('compares each scored family with exact decimal strings; only sparse map entries default to zero', async () => {
    const { expected, schema } = await loadFixture(repository, 'dev', 'D01');
    expect(validateExpected(expected, schema)).toBe(expected);
    const actual = fixturePopulations(expected);
    expect(comparePopulations(actual, { ...actual, counters: { ...object(actual.counters), assumed5m: 0 } })).toEqual([]);
    const tokens = object(actual.tokens);
    expect(comparePopulations(actual, { ...actual, tokens: { ...tokens, input: Number(tokens.input) } }).length).toBeGreaterThan(0);
    expect(() => validateActual({ ...actual, counters: { ...object(actual.counters), invented_reason: 0 } }, expected, schema)).toThrow();
    for (const [key, value] of Object.entries(actual)) {
      expect(comparePopulations(actual, { ...actual, [key]: value === null ? '__mutated__' : value === false ? true : null }).length, key).toBeGreaterThan(0);
    }
  });
  it('requires explicit heldout and does not reset frozen identity when dev metadata changes', async () => {
    expect(parseEvalArgs([])).toEqual({ heldout: false }); expect(parseEvalArgs(['--heldout']).heldout).toBe(true);
    expect(() => parseEvalArgs(['--heldout', '--heldout'])).toThrow();
    const manifest = object(await jsonFile(join(repository, 'fixtures/MANIFEST.json')));
    expect(heldoutIdentity(manifest)).toBe(heldoutIdentity({ ...manifest, dev: { modified: true } }));
  });
  it('retains immutable first-run admission and appends diagnostic attempts', async () => {
    const temp = await mkdtemp(join(tmpdir(), 's22-ledger-'));
    const first = { timestamp: '2026-10-24T00:00:00.000Z', manifestHash: 'a'.repeat(64), codeCommit: 'b'.repeat(40) };
    const admitted = await reserveHeldoutRun(temp, 'c'.repeat(64), first);
    const firstBytes = await readFile(join(admitted.folder, 'first-run.json'), 'utf8');
    await writeFile(join(admitted.folder, 'first-results.jsonl'), 'immutable\n', { flag: 'wx' });
    const later = await reserveHeldoutRun(temp, 'c'.repeat(64), { ...first, timestamp: '2026-10-25T00:00:00.000Z' });
    expect(admitted.diagnostic).toBe(false); expect(later.diagnostic).toBe(true); expect(later.stem).toMatch(/^diagnostic-/);
    expect(await readFile(join(admitted.folder, 'first-run.json'), 'utf8')).toBe(firstBytes);
    expect(await readFile(join(admitted.folder, 'first-results.jsonl'), 'utf8')).toBe('immutable\n');
    await expect(writeFile(join(admitted.folder, 'first-results.jsonl'), 'overwrite', { flag: 'wx' })).rejects.toThrow();
    expect((await readFile(join(temp, 'heldout-runs.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(2);
  });
  it('admits only closed safe dev options and refuses heldout sidecars', async () => {
    const temp = await mkdtemp(join(tmpdir(), 's22-options-')); await mkdir(join(temp, 'fixture'));
    const folder = join(temp, 'fixture'), path = join(folder, 'analysis-options.json');
    expect(await readFixtureOptions(folder, 'dev')).toBeUndefined();
    for (const invalid of [{ schema: 's22-analysis-options/1', metadataCap: -1 }, { schema: 's22-analysis-options/1', metadataCap: 1.5 },
      { schema: 's22-analysis-options/1', metadataCap: 1_000_001 }, { schema: 's22-analysis-options/1', metadataCap: 0, unknown: 1 }]) {
      await writeFile(path, JSON.stringify(invalid)); await expect(readFixtureOptions(folder, 'dev')).rejects.toThrow();
    }
    await writeFile(path, '{"schema":"s22-analysis-options/1","metadataCap":0}');
    expect((await readFixtureOptions(folder, 'dev'))?.metadataCap).toBe(0);
    await expect(readFixtureOptions(folder, 'heldout')).rejects.toThrow();
  });
});
