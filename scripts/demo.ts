import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTable } from '../src/cli/main';
import { serializeReport } from '../src/core/serialize';
import { bucketNames } from '../src/core/types';
import { fixturePopulations, jsonFile, object, repository, scoreFixture } from './eval-lib';
import type { Difference, Expected } from './eval-lib';

/** Fixed committed development fixtures only: never discover logs, accept paths, or open held-out data. */
export const demoFixtureIds = ['D01', 'D02', 'D10', 'D11', 'D21'] as const;
type Score = Awaited<ReturnType<typeof scoreFixture>>;
const qualities = ['verified', 'observed_snapshot', 'observed_epoch'] as const;
const literal = (value: unknown): string => JSON.stringify(value) ?? '<absent>';

/** Display literal values only. Exact comparison remains exclusively in eval-lib. */
function populationRows(expected: unknown, actual: unknown, path = ''): string[] {
  if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
    const entries = Object.entries(expected);
    if (entries.length > 0) {
      const right = object(actual);
      return entries.flatMap(([key, value]) => populationRows(value, right[key], path ? `${path}.${key}` : key));
    }
  }
  return [`${literal(path)} | ${literal(expected)} | ${literal(actual)}`];
}
function differences(title: string, values: readonly Difference[]): string[] {
  return [`${title}: ${values.length}`, ...values.map(value =>
    `${literal(value.path)}: expected ${literal(value.expected)}; actual ${literal(value.actual)}`)];
}

export function formatDemoFixture(score: Score, expected: Expected): { text: string; ok: boolean } {
  if (score.split !== 'dev' || score.id !== expected.id || expected.prices !== 'fixtures/prices.test.json' ||
    !demoFixtureIds.some(id => id === score.id)) throw new Error('Demo fixture contract mismatch');
  const safe = serializeReport(score.report);
  const grounded = safe.recapStatus.ok && safe.recap !== undefined;
  const controlPass = !score.controlRequired || score.negativeControlDifferences.length > 0;
  const lines = [`\nFixture ${score.id} | synthetic development inputs | prices: ${expected.prices}`,
    toTable(score.report).trimEnd(),
    `Known cost (exact pico-USD): ${safe.cost.knownPico}`,
    'Quality | Input | Output | Cache write 5m | Cache write 1h | Cache read | Known cost (exact pico-USD)'];
  for (const quality of qualities) lines.push([quality, ...bucketNames.map(bucket => safe.tokensByQuality[quality][bucket]),
    safe.cost.knownByQuality[quality]].join(' | '));
  lines.push(`Recap grounding checker: ${grounded ? 'pass' : 'FAIL (candidate suppressed)'}`,
    `Analyzer vs expected.json: ${score.differences.length === 0 ? 'exact' : 'FAIL'} (all scored population fields)`,
    'Field | Literal expected | Analyzer', ...populationRows(fixturePopulations(expected), score.actual),
    ...differences('Analyzer per-field differences', score.differences),
    'Naive sum: intentionally incorrect negative control; differences are not evidence of superiority.',
    'Supported fields only: five token buckets and known pico-USD. Unknown costs become zero in this control.',
    'Field | Literal expected | Naive sum',
    ...populationRows({ tokens: expected.tokens, cost: { knownPico: object(expected.cost).knownPico } },
      { tokens: score.naive.tokens, cost: score.naive.cost }),
    ...differences('Negative control per-field differences', score.negativeControlDifferences),
    `Required control difference: ${score.controlRequired ? (controlPass ? 'met' : 'FAIL') : 'not required'}`);
  return { text: `${lines.join('\n')}\n`, ok: score.differences.length === 0 && grounded && controlPass };
}

/** Read-only fixture journey, stdout only. No result files, subprocesses, network or model invocation. */
export async function runDemo(argv: readonly string[] = [], stdout = (text: string): void => { process.stdout.write(text); }): Promise<number> {
  if (argv.length > 0) { stdout('Usage: npm run demo (fixed development fixtures; no arguments)\n'); return 1; }
  stdout('Fixture-only accounting demo. No model calls. Synthetic test prices; no billing reconciliation.\n');
  let failed = false;
  for (const id of demoFixtureIds) {
    try {
      const score = await scoreFixture(repository, 'dev', id);
      // The scorer has already schema-validated this file; read its literal values for display, never derive an oracle.
      const expected = object(await jsonFile(join(repository, 'fixtures/dev', id, 'expected.json'))) as Expected;
      const output = formatDemoFixture(score, expected);
      stdout(output.text); failed ||= !output.ok;
    } catch {
      // Keep raw records, OS errors and paths out of terminal diagnostics.
      stdout(`Fixture ${id}: FAIL (fixture loading, accounting or display contract).\n`); failed = true;
    }
  }
  stdout(`\nDemo checks: ${failed ? 'FAIL' : 'pass'}. No model calls.\n`);
  return failed ? 1 : 0;
}

// Import-safe on Windows too; tests importing this module never execute the demo.
const entry = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);
const entryPath = entry ? resolve(entry) : undefined;
if (entryPath !== undefined && (process.platform === 'win32'
  ? entryPath.toLowerCase() === modulePath.toLowerCase() : entryPath === modulePath)) {
  void runDemo(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
