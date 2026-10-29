import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { behavioralMetrics, formatPercent, makeMetricTable } from '../../src/core/metrics';
import { metricDefs } from '../../src/core/metricDefs';
import type { ToolFact } from '../../src/core/types';
import { report } from './reportHelpers';
const tool = (id: string, status: ToolFact['status'], agent: ToolFact['agent'] = 'claude'): ToolFact => ({
  agent, sessionId: 's', callId: id, name: 'mcp__server__action', tsMs: 1, sourceRef: { fileId: 'f1', line: 1 }, status,
});
describe('I7 exact metric formatting and behavior populations', () => {
  it('rounds cache-hit half up to one decimal without floating-point conversion', () => {
    expect(formatPercent(0n, 0n)).toBe('n/a'); expect(formatPercent(1n, 3n)).toBe('33.3%');
    expect(formatPercent(1n, 16n)).toBe('6.3%'); expect(formatPercent(999_999_999_999_999_999n, 1_000_000_000_000_000_000n)).toBe('100.0%');
  });
  it('counts MCP once in total and once in each relevant subgroup; Claude explicit statuses alone form error coverage', () => {
    const value = behavioralMetrics([tool('a', 'error'), tool('b', 'ok'), tool('c', 'unknown'), tool('d', 'unknown', 'codex')], [], []);
    expect(value.tools.total).toBe(4); expect(value.tools.byName.get('mcp__server__action')).toBe(4);
    expect(value.tools.byMcpServer.get('server')).toBe(4);
    expect(value.toolResults).toEqual({ error: 1, ok: 1, unknown: 1 });
    expect(value.errorRate.claude).toEqual({ numerator: 1, denominator: 2, display: '50.0%', coverage: '2 of 3' });
    expect(value.errorRate.codex).toBe('not available');
  });
  it('duration is recognized last minus first within the caller-filtered population, isolated by agent and session', () => {
    const value = behavioralMetrics([], [], [{ agent: 'claude', sessionId: 's', tsMs: 200 },
      { agent: 'claude', sessionId: 's', tsMs: 100 }, { agent: 'codex', sessionId: 's', tsMs: 300 }]);
    expect(value.sessionDurations).toMatchObject([{ agent: 'claude', durationMs: 100, label: 'within filter' }, { agent: 'codex', durationMs: 0 }]);
  });
  it('MCP server names may begin with underscore; only the separating double underscores define the split', () => {
    const value = behavioralMetrics([{ ...tool('underscore', 'ok'), name: 'mcp___server__tool' }], [], []);
    expect(value.tools.byMcpServer.get('_server')).toBe(1);
  });
  it('metric definitions cover every generated table entry and match the committed definitions document', async () => {
    const table = makeMetricTable(await report());
    expect([...table.keys()].sort()).toEqual(Object.keys(metricDefs).sort());
    const document = readFileSync(new URL('../../docs/METRICS.md', import.meta.url), 'utf8');
    for (const definition of Object.values(metricDefs)) expect(document).toContain(definition.definition);
  });
});
