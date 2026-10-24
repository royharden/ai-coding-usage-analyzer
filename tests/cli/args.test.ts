import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../../src/cli/args';
import { formatReport, runCli, toTable } from '../../src/cli/main';
import { analyze } from '../../src/core/analyze';
import { toJson } from '../../src/core/exports/json';
import { toCsv } from '../../src/core/exports/csv';
import { toMarkdown } from '../../src/core/exports/md';
import { nodePlatform } from '../../src/node/platform';

const defaults = { home: join('synthetic', 'home'), timezone: 'America/New_York' };
const prices = JSON.stringify({ schema: 'pricetable/1', currency: 'USD', unit: 'micro_usd_per_mtok', rows: [] });
describe('Plan 4.10 argument matrix', () => {
  it('scans only selected agents, with optional home defaults and Codex archives', () => {
    expect(parseArgs(['--claude'], defaults).roots).toEqual([{ agent: 'claude', path: join(defaults.home, '.claude', 'projects') }]);
    expect(parseArgs(['--codex'], defaults).roots).toEqual([
      { agent: 'codex', path: join(defaults.home, '.codex', 'sessions') },
      { agent: 'codex', path: join(defaults.home, '.codex', 'archived_sessions'), optional: true },
    ]);
    expect(parseArgs(['--claude', 'a', '--codex', 'b'], defaults).roots).toEqual([
      { agent: 'claude', path: 'a' }, { agent: 'codex', path: 'b' },
    ]);
  });
  it('supports every value and switch flag, including equals syntax', () => {
    expect(parseArgs(['--claude=a', '--codex=b', '--tz', 'UTC', '--since', '2026-10-01', '--until=2026-10-31',
      '--format', 'md', '--prices', 'custom.json', '--out=report.md', '--full-paths', '--allow-large'], defaults)).toEqual({
      roots: [{ agent: 'claude', path: 'a' }, { agent: 'codex', path: 'b' }], tz: 'UTC', since: '2026-10-01', until: '2026-10-31',
      format: 'md', prices: 'custom.json', out: 'report.md', fullPaths: true, allowLarge: true, help: false,
    });
  });
  it.each(['table', 'json', 'csv', 'md'])('accepts format %s', format => {
    expect(parseArgs(['--claude', '--format', format], defaults).format).toBe(format);
  });
  it('defaults to local IANA timezone, table, privacy and small-import mode', () => {
    const args = parseArgs(['--claude'], defaults);
    expect(args).toMatchObject({ tz: 'America/New_York', format: 'table', fullPaths: false, allowLarge: false });
    expect(parseArgs(['--help'], defaults)).toMatchObject({ help: true, roots: [] });
    expect(parseArgs(['--claude']).tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
  it.each(['--tz', '--since', '--until', '--format', '--prices', '--out'])('requires a value for %s', flag => {
    expect(() => parseArgs(['--claude', flag], defaults)).toThrow();
    expect(() => parseArgs(['--claude', flag, '--full-paths'], defaults)).toThrow();
    expect(() => parseArgs(['--claude', `${flag}=`], defaults)).toThrow();
  });
  it.each([
    [], ['--bogus'], ['a'], ['--claude='], ['--claude', '--claude'], ['--claude', '--format', 'yaml'],
    ['--claude', '--full-paths=true'], ['--claude', '--allow-large=no'], ['--claude', '--tz', 'Not/AZone'], ['--claude', '--tz', '+01:00'],
    ['--claude', '--since', '2026-02-30'], ['--claude', '--until', '2026-13-01'],
    ['--claude', '--since', '2026-10-02', '--until', '2026-10-01'], ['--claude', '--since', '2026-1-01'],
  ].map(argv => ({ argv })))('rejects invalid arguments before intake: $argv', ({ argv }) => { expect(() => parseArgs(argv, defaults)).toThrow(); });
  it.each([
    ['--claude', '--tz', 'Not/AZone'], ['--claude', '--tz', '+01:00'], ['--claude', '--since', '2026-02-30'],
    ['--claude', '--since', '2026-10-02', '--until', '2026-10-01'], ['--claude', '--format', 'yaml'],
    ['--claude', '--prices'],
  ].map(argv => ({ argv })))('I6 performs no walk or content read on invalid flags: $argv', async ({ argv }) => {
    const walk = vi.fn(), readPriceText = vi.fn(), stderr = vi.fn();
    expect(await runCli(argv, { defaults, walk, readPriceText, stderr })).toBe(1);
    expect(walk).not.toHaveBeenCalled(); expect(readPriceText).not.toHaveBeenCalled();
  });
  it('prints help without walking, and sanitizes OS errors', async () => {
    const walk = vi.fn().mockRejectedValue(new Error('EACCES C:/private/secret.jsonl raw-line'));
    const stdout = vi.fn(), stderr = vi.fn();
    expect(await runCli(['--help'], { defaults, walk, stdout, stderr })).toBe(0);
    expect(walk).not.toHaveBeenCalled();
    expect(await runCli(['--claude'], { defaults, walk, stdout, stderr })).toBe(1);
    expect(stderr.mock.calls.flat().join('')).not.toMatch(/private|secret|raw-line/);
  });
  it('refuses an over-budget discovery before reading prices or invoking analysis', async () => {
    const walk = vi.fn().mockResolvedValue({ sources: [], diagnostics: [], totalBytes: 500_000_001 });
    const readPriceText = vi.fn(), analyzeMock = vi.fn(), stderr = vi.fn();
    expect(await runCli(['--claude'], { defaults, walk, readPriceText, analyze: analyzeMock, stderr })).toBe(1);
    expect(readPriceText).not.toHaveBeenCalled(); expect(analyzeMock).not.toHaveBeenCalled();
    expect(stderr.mock.calls.flat().join('')).toContain('--allow-large');
  });
  it('uses the exact core exporter in each machine format, and prints timezone in the table', async () => {
    const report = await analyze([], { tz: defaults.timezone, priceTableText: prices }, nodePlatform);
    expect(formatReport(report, 'json')).toBe(toJson(report));
    expect(formatReport(report, 'csv')).toBe(toCsv(report));
    expect(formatReport(report, 'md')).toBe(toMarkdown(report));
    expect(toTable(report)).toContain('timezone: America/New_York');
    const stdout = vi.fn();
    expect(await runCli(['--claude', '--format', 'json'], { defaults, stdout,
      walk: async () => ({ sources: [], diagnostics: [], totalBytes: 0 }), readPriceText: async () => prices })).toBe(0);
    expect(stdout).toHaveBeenCalledTimes(1); expect(stdout).toHaveBeenCalledWith(toJson(report));
  });
});
