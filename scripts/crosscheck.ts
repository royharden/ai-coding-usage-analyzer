import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type ExternalTool = 'ccusage' | 'ccstats' | 'codeburn';
type Field = 'input' | 'output' | 'cacheWrite5m' | 'cacheWrite1h' | 'cacheWriteTotal' | 'cacheRead' | 'knownCostPico';
interface ComparedField { field: Field; analyzer: string | null; external: string | null;
  status: 'agree' | 'different' | 'not measured'; reason?: string }
export interface CrosscheckResult { schema: 's22-crosscheck/1'; status: 'measured' | 'not measured';
  tool: ExternalTool; toolVersion: string; fields: ComparedField[]; notes: string[] }
const fields: Field[] = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheWriteTotal', 'cacheRead', 'knownCostPico'];
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function validateVersion(value: string): void {
  if (!value.trim() || value.length > 128 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('Invalid tool version');
}
function integer(value: unknown): bigint | undefined {
  if (typeof value === 'string' && /^\d{1,2000}$/.test(value)) return BigInt(value);
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;
}
/** Compare the external reported decimal representation, never floating-point money arithmetic. */
function usdPico(value: unknown): bigint | undefined {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value) && value >= 0)) return undefined;
  const text = String(value);
  if (text.length > 2000) return undefined;
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(text);
  if (!match) return undefined;
  const fraction = match[2] ?? '', exponent = Number(match[3] ?? '0');
  if (Math.abs(exponent) > 100) return undefined;
  const digits = BigInt((match[1] ?? '0') + fraction), scale = 12 + exponent - fraction.length;
  if (scale >= 0) return digits * 10n ** BigInt(scale);
  const divisor = 10n ** BigInt(-scale);
  return digits % divisor === 0n ? digits / divisor : undefined;
}
function sum(rows: Record<string, unknown>[], key: string, money = false): bigint | undefined {
  if (rows.length === 0) return undefined;
  let total = 0n;
  for (const row of rows) {
    const value = money ? usdPico(row[key]) : integer(row[key]);
    if (value === undefined) return undefined; // Never present a partial external sum as complete.
    total += value;
  }
  return total;
}

/** Narrow adapters for documented top-level aggregate/call shapes; never recurse into breakdowns or raw tools. */
export function compareExternal(analyzerJson: unknown, externalJson: unknown, tool: ExternalTool, toolVersion: string): CrosscheckResult {
  validateVersion(toolVersion);
  const root = record(analyzerJson), tokens = record(root?.tokens), cost = record(root?.cost);
  if (root?.schema !== 's22-report/1' || !tokens || !cost) throw new Error('Expected an analyzer JSON report');
  const analyzer = new Map<Field, bigint>();
  for (const name of ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'] as const) {
    const value = integer(tokens[name]);
    if (value === undefined) throw new Error('Invalid analyzer token total');
    analyzer.set(name, value);
  }
  analyzer.set('cacheWriteTotal', (analyzer.get('cacheWrite5m') ?? 0n) + (analyzer.get('cacheWrite1h') ?? 0n));
  const known = integer(cost.knownPico);
  if (known === undefined) throw new Error('Invalid analyzer known cost');
  analyzer.set('knownCostPico', known);
  const externalRoot = record(externalJson);
  const candidate = tool === 'ccusage' ? record(externalRoot?.totals) :
    Array.isArray(externalJson) ? undefined : record(externalRoot?.totals) ?? externalRoot;
  const rows = Array.isArray(externalJson) && tool !== 'ccusage' ? externalJson.map(record) : candidate ? [candidate] : [];
  const validRows = rows.every(row => row !== undefined) ? rows as Record<string, unknown>[] : [];
  const external = new Map<Field, bigint>();
  const take = (field: Field, key: string, money = false) => {
    const value = sum(validRows, key, money); if (value !== undefined) external.set(field, value);
  };
  if (tool === 'ccstats') {
    take('input', 'input_tokens'); take('output', 'output_tokens'); take('cacheRead', 'cache_read_tokens');
    take('cacheWriteTotal', 'cache_creation_tokens'); take('cacheWrite1h', 'cache_creation_1h_tokens');
    const all = external.get('cacheWriteTotal'), hour = external.get('cacheWrite1h');
    if (all !== undefined && hour !== undefined && hour <= all) external.set('cacheWrite5m', all - hour);
    else if (all !== undefined && hour !== undefined) { external.delete('cacheWrite1h'); external.delete('cacheWriteTotal'); }
    take('knownCostPico', 'cost', true);
  } else {
    take('input', 'inputTokens'); take('output', 'outputTokens');
    take('cacheRead', tool === 'ccusage' ? 'cacheReadTokens' : 'cacheReadInputTokens');
    take('cacheWriteTotal', tool === 'ccusage' ? 'cacheCreationTokens' : 'cacheCreationInputTokens');
    take('knownCostPico', tool === 'ccusage' ? 'totalCost' : 'costUSD', true);
  }
  const compared = fields.map((field): ComparedField => {
    const own = analyzer.get(field), other = external.get(field);
    if (other === undefined) return { field, analyzer: own?.toString() ?? null, external: null, status: 'not measured',
      reason: 'Field absent, unsafe, unsupported, or not exactly representable in pico-USD' };
    return { field, analyzer: own?.toString() ?? null, external: other.toString(), status: own === other ? 'agree' : 'different' };
  });
  return { schema: 's22-crosscheck/1', status: external.size ? 'measured' : 'not measured', tool, toolVersion,
    fields: compared, notes: [
      'Diagnostic comparison only: confirm identical corpus, agent selection, time window and pricing policy.',
      'USD JSON numbers are compared via their reported decimal rendering; external floating-point precision is not repaired.',
      'Combined cache creation is compared as a total when the tool has no TTL split; missing fields are never zero.',
      'Output/reasoning and unknown-price conventions can differ between tools. No external tool is launched.',
    ] };
}

export interface CrosscheckIO { readJson(path: string): Promise<unknown>; write(text: string): void }
const MAX_JSON_BYTES = 16 * 1024 * 1024;
async function readLocalJson(path: string): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_JSON_BYTES) throw new Error('Comparison JSON is not a bounded file');
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_JSON_BYTES) throw new Error('Comparison JSON is too large');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
export async function runCrosscheck(argv: readonly string[], io: CrosscheckIO): Promise<void> {
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help') {
      io.write('crosscheck --tool ccusage|ccstats|codeburn --tool-version VERSION --json external.json --analyzer report.json\n');
      return;
    }
    if (!flag || !['--tool', '--tool-version', '--json', '--analyzer'].includes(flag) || options.has(flag)) throw new Error('Invalid crosscheck flags');
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing crosscheck flag value');
    options.set(flag, value); i += 1;
  }
  if (!options.has('--json')) { io.write('not measured: no external JSON supplied\n'); return; }
  const tool = options.get('--tool'), version = options.get('--tool-version'), ownPath = options.get('--analyzer');
  if (tool !== 'ccusage' && tool !== 'ccstats' && tool !== 'codeburn') throw new Error('A supported tool name is required');
  if (!version || !ownPath) throw new Error('Tool version and analyzer JSON are required');
  validateVersion(version);
  const externalPath = options.get('--json');
  if (!externalPath) throw new Error('External JSON is required');
  const [own, other] = await Promise.all([io.readJson(ownPath), io.readJson(externalPath)]);
  io.write(JSON.stringify(compareExternal(own, other, tool, version), null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCrosscheck(process.argv.slice(2), { readJson: readLocalJson, write: text => { process.stdout.write(text); } })
    .catch(() => { process.stderr.write('Crosscheck failed. No external tool was run.\n'); process.exitCode = 1; });
}
