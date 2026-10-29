import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../core/analyze';
import { toJson } from '../core/exports/json';
import { toCsv } from '../core/exports/csv';
import { toMarkdown } from '../core/exports/md';
import { formatUsd } from '../core/money';
import { serializeReport } from '../core/serialize';
import { checkSizeBudget, SizeBudgetError } from '../core/sizeBudget';
import type { Report } from '../core/types';
import { nodePlatform } from '../node/platform';
import { OutputGuardError, resolveOutputTarget } from '../node/outGuard';
import { walkInputs } from '../node/walk';
import { CliError, helpText, parseArgs } from './args';
import type { ArgDefaults, CliArgs } from './args';

function cell(value: string): string { return Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')).slice(0, 200).join(''); }
function counts(values: ReadonlyMap<string, number>): string {
  return [...values].map(([key, count]) => `${cell(key)}=${count}`).join(', ') || 'none';
}

/** Human output uses the same safe Report as every machine export. Money stays BigInt. */
export function toTable(report: Report): string {
  const lines = [`AI Coding Usage Analyzer | timezone: ${report.metadata.tz}`,
    `Filter: ${report.metadata.since ?? 'start'} through ${report.metadata.until ?? 'end'} (inclusive calendar days)`,
    `Price table: ${report.metadata.priceTableDigest} | complete: ${report.complete}`,
    'Day | Input | Output | Cache write 5m | Cache write 1h | Cache read | Known cost | Unknown-price events | Events'];
  for (const row of report.groupings.day) lines.push([cell(row.label), row.tokens.input, row.tokens.output,
    row.tokens.cacheWrite5m, row.tokens.cacheWrite1h, row.tokens.cacheRead, formatUsd(row.knownPico), row.unknownPriceEvents, row.events].join(' | '));
  lines.push(`Known cost: ${formatUsd(report.cost.knownPico)}`,
    `Known cost by quality: verified ${formatUsd(report.cost.knownByQuality.verified)}, observed snapshot ${formatUsd(report.cost.knownByQuality.observed_snapshot)}, observed epoch ${formatUsd(report.cost.knownByQuality.observed_epoch)}`,
    `Unknown-price events: ${report.cost.unknownPriceEvents.total} (${counts(report.cost.unknownPriceEvents.byReason)})`,
    `Unknown-price models: ${counts(report.cost.unknownPriceEvents.byModel)}`,
    `Unresolved usage: ${counts(report.unresolved)}`, `Skipped: ${counts(report.skipped)}`, `Counters: ${counts(report.counters)}`);
  const checked = serializeReport(report);
  if (checked.recapStatus.ok && checked.recap) lines.push(`Recap (checked): ${checked.recap.text}`);
  else if (!checked.recapStatus.ok) lines.push(checked.recapStatus.reason);
  return `${lines.join('\n')}\n`;
}

export function formatReport(report: Report, format: CliArgs['format']): string {
  if (format === 'json') return toJson(report); // Plan 4.10: no added newline or wrapper.
  if (format === 'csv') return toCsv(report);
  if (format === 'md') return toMarkdown(report);
  return toTable(report);
}

export interface CliDependencies {
  stdout?: (text: string) => void; stderr?: (text: string) => void; defaults?: ArgDefaults;
  walk?: typeof walkInputs; readPriceText?: (path: string) => Promise<string>; analyze?: typeof analyze;
}

/** Importing this module never executes the CLI; I/O begins only after parseArgs succeeds. */
export async function runCli(argv: readonly string[], dependencies: CliDependencies = {}): Promise<number> {
  const stdout = dependencies.stdout ?? (text => { process.stdout.write(text); });
  const stderr = dependencies.stderr ?? (text => { process.stderr.write(text); });
  try {
    const args = parseArgs(argv, dependencies.defaults);
    if (args.help) { stdout(helpText); return 0; }
    const roots = args.roots.map(root => root.path);
    // The output is never opened if it points into any requested input root.
    if (args.out) await resolveOutputTarget(args.out, roots);
    const walked = await (dependencies.walk ?? walkInputs)(args.roots);
    const decision = checkSizeBudget(walked.totalBytes, args.allowLarge);
    if (decision.kind !== 'allowed') throw new SizeBudgetError(decision);
    const prices = args.prices ?? fileURLToPath(new URL('../../prices/prices.json', import.meta.url));
    const priceTableText = await (dependencies.readPriceText ?? (path => readFile(path, 'utf8')))(prices);
    const report = await (dependencies.analyze ?? analyze)(walked.sources, { tz: args.tz, since: args.since, until: args.until,
      fullPaths: args.fullPaths, allowLarge: args.allowLarge, priceTableText, intakeDiagnostics: walked.diagnostics }, nodePlatform);
    const output = formatReport(report, args.format);
    if (args.out) {
      const destination = await resolveOutputTarget(args.out, roots);
      // Exclusive creation is the final guard against an existing report or symlink appearing after validation.
      const handle = await open(destination, 'wx', 0o600);
      try { await handle.writeFile(output, 'utf8'); } finally { await handle.close(); }
    } else stdout(output);
    return 0;
  } catch (error) {
    let message = 'Analysis failed; check input access, price table and output destination.';
    if (error instanceof CliError || error instanceof OutputGuardError) message = error.message;
    else if (error instanceof SizeBudgetError) message = error.decision.kind === 'confirmation_required'
      ? 'Import exceeds 500 MB. Re-run with --allow-large to confirm.' : 'Import size refused; maximum is 2,000 MB.';
    // No raw OS error, absolute path, record, or line is printed.
    stderr(`Error: ${message}\n`);
    return 1;
  }
}

const entry = process.argv[1];
const entryPath = entry ? resolve(entry) : undefined;
const modulePath = fileURLToPath(import.meta.url);
const isEntry = entryPath !== undefined && (process.platform === 'win32'
  ? entryPath.toLowerCase() === modulePath.toLowerCase() : entryPath === modulePath);
if (isEntry) {
  void runCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
