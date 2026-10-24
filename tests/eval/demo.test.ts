import { describe, expect, it } from 'vitest';
import { demoFixtureIds, formatDemoFixture, runDemo } from '../../scripts/demo';
import { loadFixture, repository, scoreFixture } from '../../scripts/eval-lib';

describe('read-only fixture demo', () => {
  it('shows the fixed dev journey, literal oracle comparisons, incompleteness and a checked recap', async () => {
    let text = '';
    expect(await runDemo([], chunk => { text += chunk; })).toBe(0);
    for (const id of demoFixtureIds) expect(text).toContain(`Fixture ${id} | synthetic development inputs`);
    expect(text).toContain('timezone: Asia/Kolkata');
    expect(text).toContain('codex_total_regressed=2');
    expect(text).toContain('observed_epoch | 18 | 12 | 0 | 0 | 6');
    expect(text).toContain('Unknown-price events: 3 (no_price_row=3)');
    expect(text).toContain('"tokens.input" | "11" | "11"');
    expect(text).toContain('"cost.knownPico" | "101000000" | "101000000"');
    expect(text).toContain('Analyzer per-field differences: 0');
    expect(text).toContain('Recap grounding checker: pass');
    expect(text).toContain('intentionally incorrect negative control');
    expect(text).toContain('No model calls.');
    expect(text).toContain('Demo checks: pass.');
  });

  it('fails on accounting mismatches, a missing required control difference, or an ungrounded recap', async () => {
    const { expected } = await loadFixture(repository, 'dev', 'D01');
    const score = await scoreFixture(repository, 'dev', 'D01');
    expect(formatDemoFixture({ ...score, differences: [{ path: 'tokens.input', expected: '11', actual: '12' }] }, expected).ok).toBe(false);
    expect(formatDemoFixture({ ...score, controlRequired: true, negativeControlDifferences: [] }, expected).ok).toBe(false);
    const report = { ...score.report, recap: { text: 'Ungrounded 99', spans: [] } };
    const output = formatDemoFixture({ ...score, report }, expected);
    expect(output.ok).toBe(false);
    expect(output.text).toContain('Recap grounding checker: FAIL');
    expect(output.text).not.toContain('Ungrounded 99');
  });

  it('rejects arbitrary inputs before opening fixtures and rejects held-out formatting', async () => {
    let text = '';
    expect(await runDemo(['--claude', 'arbitrary-path'], chunk => { text += chunk; })).toBe(1);
    expect(text).toContain('no arguments');
    expect(text).not.toContain('arbitrary-path');
    const { expected } = await loadFixture(repository, 'dev', 'D01');
    const score = await scoreFixture(repository, 'dev', 'D01');
    expect(() => formatDemoFixture({ ...score, split: 'heldout' }, expected)).toThrow('Demo fixture contract mismatch');
  });
});
