import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { codeCommit, hash, object, repository, scoreFixture } from './eval-lib';
import { checkFixtures, heldoutIdentity } from './fixture-lib';

export interface EvalArgs { heldout: boolean; codeCommit?: string }
export function parseEvalArgs(args: string[]): EvalArgs {
  const result: EvalArgs = { heldout: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--heldout' && !result.heldout) result.heldout = true;
    else if (args[i] === '--code-commit' && result.codeCommit === undefined && args[i + 1]) result.codeCommit = args[++i];
    else throw new Error('Usage: eval [--heldout] [--code-commit <full-hash>]');
  }
  return result;
}
export async function reserveHeldoutRun(results: string, frozenHash: string, metadata: Record<string, unknown>) {
  const folder = join(results, 'heldout', frozenHash); await mkdir(folder, { recursive: true });
  let diagnostic = false;
  try { await writeFile(join(folder, 'first-run.json'), `${JSON.stringify(metadata)}\n`, { flag: 'wx' }); }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EEXIST') diagnostic = true; else throw error; }
  const runId = `${String(metadata.timestamp).replaceAll(':', '-').replaceAll('.', '-')}-${hash(JSON.stringify(metadata)).slice(0, 12)}`;
  const stem = diagnostic ? `diagnostic-${runId}` : 'first-results';
  const ledger = { ...metadata, heldoutHash: frozenHash, diagnostic, scorePath: `heldout/${frozenHash}/${stem}.jsonl` };
  await appendFile(join(results, 'heldout-runs.jsonl'), `${JSON.stringify(ledger)}\n`);
  return { folder, stem, diagnostic };
}
export async function main(args: string[]): Promise<void> {
  const options = parseEvalArgs(args), split = options.heldout ? 'heldout' : 'dev';
  const timestamp = new Date().toISOString(), commit = await codeCommit(repository, options.codeCommit);
  const manifestBytes = await readFile(join(repository, 'fixtures/MANIFEST.json'));
  const manifest = object(JSON.parse(manifestBytes.toString('utf8')) as unknown), manifestHash = hash(manifestBytes);
  const results = join(repository, 'results'); await mkdir(results, { recursive: true });
  const metadata = { timestamp, manifestHash, codeCommit: commit, split, splitSeed: manifest.splitSeed, frozenDate: manifest.frozenDate,
    edition: manifest.edition, fileHashes: object(manifest[split]).files, modelCalls: 0, cost: 'no model calls' };
  // Record every explicit held-out attempt before any frozen inputs are opened. A failed first attempt stays on record.
  const heldout = options.heldout ? await reserveHeldoutRun(results, heldoutIdentity(manifest), metadata) : undefined;
  const checked = await checkFixtures(repository, split);
  const rows: unknown[] = [{ kind: 'run', ...metadata, diagnostic: heldout?.diagnostic ?? false }];
  const table: string[] = ['| Fixture | Analyzer exact | Negative control differences | Control requirement | Model cost |', '|---|---|---|---|---|'];
  let failed = false;
  for (const id of checked.ids) {
    const score = await scoreFixture(repository, split, id);
    const controlPass = !score.controlRequired || score.negativeControlDifferences.length > 0;
    const exact = score.differences.length === 0; failed ||= !exact || !controlPass;
    rows.push({ kind: 'analyzer', ...metadata, id, analysisOptions: score.analysisOptions, exact, differences: score.differences, populations: score.actual });
    rows.push({ kind: 'negative-control', ...metadata, id, analysisOptions: { metadataCap: null, sidecarApplied: false },
      analyzerAnalysisOptions: score.analysisOptions, requiredToDiffer: score.controlRequired,
      differs: score.negativeControlDifferences.length > 0, requirementMet: controlPass,
      differences: score.negativeControlDifferences, populations: score.naive });
    table.push(`| ${id} | ${exact ? 'pass' : 'FAIL'} | ${score.negativeControlDifferences.length} | ${controlPass ? 'met' : 'FAIL'} | no model calls |`);
  }
  const jsonl = `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;
  const markdown = `# Exact synthetic-fixture evaluation\n\n${heldout?.diagnostic ? 'Diagnostic rerun; the immutable first attempt/score is retained. No tuning on held-out.\n\n' : ''}` +
    `Split: ${split}. Timestamp: ${timestamp}. Code commit: ${commit}.\nManifest SHA-256: ${manifestHash}. Seed: ${String(manifest.splitSeed)}. Freeze date: ${String(manifest.frozenDate)}.\n\n` +
    `${table.join('\n')}\n\nThe naive sum is an intentionally incorrect negative control, not evidence of superiority. Its supported comparisons are the five raw token buckets and known pico-USD only. No model calls.\n`;
  if (heldout) {
    // Exclusive creation never overwrites the first score; later scores use diagnostic filenames only.
    await writeFile(join(heldout.folder, `${heldout.stem}.jsonl`), jsonl, { flag: 'wx' });
    await writeFile(join(heldout.folder, `${heldout.stem}.md`), markdown, { flag: 'wx' });
  }
  await writeFile(join(results, 'results.jsonl'), jsonl);
  await writeFile(join(results, 'results.md'), markdown);
  console.log(`${split}: ${failed ? 'FAIL' : 'pass'}; ${checked.ids.length} fixtures; no model calls${heldout?.diagnostic ? '; diagnostic rerun' : ''}.`);
  if (failed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(() => { console.error('Evaluation failed; any held-out attempt remains in the immutable ledger.'); process.exitCode = 1; });
