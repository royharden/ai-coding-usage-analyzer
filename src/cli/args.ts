import { homedir } from 'node:os';
import { join } from 'node:path';
import { validateFilters } from '../core/time';
import type { Agent } from '../core/types';

export type OutputFormat = 'table' | 'json' | 'csv' | 'md';
export interface InputRoot { agent: Agent; path: string; optional?: boolean }
export interface CliArgs {
  roots: InputRoot[]; tz: string; since?: string; until?: string; format: OutputFormat;
  prices?: string; fullPaths: boolean; out?: string; allowLarge: boolean; help: boolean;
}
export class CliError extends Error {}
export interface ArgDefaults { home?: string; timezone?: string }

/** Plan 4.10: validate every argument before any filesystem intake. */
export function parseArgs(argv: readonly string[], defaults: ArgDefaults = {}): CliArgs {
  const home = defaults.home ?? homedir();
  const args: CliArgs = { roots: [], tz: defaults.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    format: 'table', fullPaths: false, allowLarge: false, help: false };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) throw new CliError('Empty argument.');
    const equal = token.indexOf('=');
    const flag = equal < 0 ? token : token.slice(0, equal);
    let value = equal < 0 ? undefined : token.slice(equal + 1);
    if (seen.has(flag)) throw new CliError('A flag was supplied more than once.');
    seen.add(flag);
    if (flag === '--full-paths' || flag === '--allow-large' || flag === '--help') {
      if (value !== undefined) throw new CliError('A boolean flag cannot take a value.');
      if (flag === '--full-paths') args.fullPaths = true;
      else if (flag === '--allow-large') args.allowLarge = true;
      else args.help = true;
      continue;
    }
    const agent = flag === '--claude' ? 'claude' : flag === '--codex' ? 'codex' : undefined;
    if (!agent && !['--tz', '--since', '--until', '--format', '--prices', '--out'].includes(flag)) {
      throw new CliError('Unknown argument. Use --help for supported flags.');
    }
    if (value === undefined) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('-')) { value = next; index += 1; }
    }
    if (value === '') throw new CliError('Flag values cannot be empty.');
    if (agent) {
      if (value !== undefined) args.roots.push({ agent, path: value });
      else if (agent === 'claude') args.roots.push({ agent, path: join(home, '.claude', 'projects') });
      else args.roots.push({ agent, path: join(home, '.codex', 'sessions') },
        { agent, path: join(home, '.codex', 'archived_sessions'), optional: true });
      continue;
    }
    if (value === undefined) throw new CliError('A required flag value is missing.');
    if (flag === '--tz') args.tz = value;
    else if (flag === '--since') args.since = value;
    else if (flag === '--until') args.until = value;
    else if (flag === '--prices') args.prices = value;
    else if (flag === '--out') args.out = value;
    else {
      if (value !== 'table' && value !== 'json' && value !== 'csv' && value !== 'md') throw new CliError('Unsupported output format.');
      args.format = value;
    }
  }
  // rule I6: calendar dates and reversed ranges are rejected before walking or reading.
  try { validateFilters(args.tz, args.since, args.until); }
  catch { throw new CliError('Invalid timezone or date filters; use IANA timezone and YYYY-MM-DD dates in order.'); }
  if (!args.help && args.roots.length === 0) throw new CliError('Select --claude and/or --codex input.');
  return args;
}

export const helpText = `analyze --claude [dir] --codex [dir] [--tz IANA] [--since YYYY-MM-DD] [--until YYYY-MM-DD]
  [--format table|json|csv|md] [--prices file] [--full-paths] [--out file] [--allow-large]
An agent flag without a directory uses its home default. Codex includes sessions and archived_sessions.
Absent agent flags are not scanned. Timezone defaults to the local IANA timezone printed in the report.
Input is read-only. All symbolic links and junctions are skipped conservatively.
Reports go to stdout unless --out selects a new file outside every input root.
More than 500 MB requires --allow-large; more than 2,000 MB is refused.\n`;
