import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/analyze';
import { csvCell, toCsv } from '../../src/core/exports/csv';
import { escapeMarkdown, toMarkdown } from '../../src/core/exports/md';
import { zeroBuckets } from '../../src/core/types';
import { assistant, platform } from './helpers';

async function exampleReport(records: Record<string, unknown>[] = [assistant()], fullPaths = false) {
  const bytes = new TextEncoder().encode(records.map(record => JSON.stringify(record)).join('\n') + '\n');
  return analyze([{
    agent: 'claude', fileId: 'f1', name: 'synthetic.jsonl', relativePath: 'claude/synthetic.jsonl',
    size: bytes.byteLength, read: async function* () { yield bytes; },
  }], { tz: 'America/New_York', since: '2026-10-14', until: '2026-10-14', fullPaths,
    priceTableText: '{"schema":"pricetable/1","currency":"USD","unit":"micro_usd_per_mtok","rows":[]}' }, platform);
}

describe('rule 4.7: spreadsheet formula defenses and RFC 4180 cells', () => {
  it('defangs all formula prefixes, including whitespace and control prefixes', () => {
    expect(csvCell('=1')).toBe(`"'=1"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('-1')).toBe(`"'-1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('  +1')).toBe(`"'  +1"`);
    expect(csvCell('\tplain')).toBe(`"'\tplain"`);
    expect(csvCell('\rplain')).toBe(`"'\rplain"`);
    expect(csvCell(' \tplain')).toBe(`"' \tplain"`);
    expect(csvCell(' \rplain')).toBe(`"' \rplain"`);
  });

  it('quotes commas, quotes and line breaks without corrupting text', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell('ordinary')).toBe('"ordinary"');
  });
});

describe('rule 4.7: Markdown data stays text', () => {
  it('escapes HTML, links, table separators, code and emphasis', () => {
    expect(escapeMarkdown('<img>')).toBe('\\<img\\>');
    expect(escapeMarkdown('[link]|`x`_*#')).toBe('\\[link\\]\\|\\`x\\`\\_\\*\\#');
    expect(escapeMarkdown('a\\b\nc')).toBe('a\\\\b c');
  });
});

describe('rules P5/I7: safe report formats share metadata and privacy allowlist', () => {
  it('uses basename collision ordinals in both formats and reveals paths only on opt-in', async () => {
    const paths = ['/synthetic/one/app', '/synthetic/two/app'];
    const records = paths.map((cwd, index) => assistant(`project-${index}`, {}, { cwd }));
    const report = await exampleReport(records);
    const csv = toCsv(report), markdown = toMarkdown(report);
    expect(csv).toContain('"app"');
    expect(csv).toContain('"app #2"');
    expect(markdown).toContain('| app |');
    expect(markdown).toContain('| app \\#2 |');
    for (const path of paths) {
      expect(csv).not.toContain(path);
      expect(markdown).not.toContain(path);
    }
    const full = await exampleReport(records, true);
    for (const path of paths) {
      expect(toCsv(full)).toContain(path);
      expect(toMarkdown(full)).toContain(path);
    }
  });

  it('exports timezone, filters, digest, unknown and unresolved counts', async () => {
    const report = await exampleReport();
    report.unresolved.set('no_identity', 1);
    report.complete = false;
    for (const text of [toCsv(report), toMarkdown(report)]) {
      expect(text).toContain('America/New_York');
      expect(text).toContain('2026-10-14');
      expect(text).toContain(report.metadata.priceTableDigest);
      expect(text).toContain('no_price_row');
      expect(text).toContain('no_identity');
      expect(text).toContain('false');
      expect(text).not.toContain('/synthetic/a');
    }
  });

  it('preserves large exact values and handles hostile labels as inert text', async () => {
    const report = await exampleReport();
    report.groupings.project.push({ key: '=HYPERLINK("x")', label: '<img onerror=x>|[x]',
      tokens: { ...zeroBuckets(), input: 9_007_199_254_740_993n }, knownPico: 9_007_199_254_740_995n,
      events: 1, unknownPriceEvents: 1, byQuality: { verified: 1, observed_snapshot: 0, observed_epoch: 0 } });
    const csv = toCsv(report), markdown = toMarkdown(report);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('9007199254740993');
    expect(csv).toContain('9007199254740995');
    expect(markdown).toContain('\\<img onerror=x\\>\\|\\[x\\]');
    expect(markdown).toContain('9007199254740995');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('does not serialize transient or injected raw fields', async () => {
    const report = await exampleReport();
    Object.assign(report, { inputHash: 'PLANTED-RETRY-HASH', rawPrompt: 'PLANTED-PROMPT' });
    for (const text of [toCsv(report), toMarkdown(report)]) {
      expect(text).not.toContain('PLANTED-RETRY-HASH');
      expect(text).not.toContain('PLANTED-PROMPT');
      expect(text).not.toContain('inputHash');
    }
  });
});
