import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { hash, object, contained, jsonFile, validateExpected, fixtureIds, readFixtureOptions } from './eval-lib';
import type { Expected, JsonObject } from './eval-lib';

export interface HashEntry { path: string; sha256: string }
export const directTrapContracts: Record<string, string[]> = {
  'safe-exports': ['tests/core/exports.test.ts', 'tests/core/exportsFormats.test.ts', 'tests/web/App.test.tsx'],
  'price-validation': ['tests/core/prices.test.ts'],
};
export async function filesUnder(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const path = join(directory, entry.name), stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('Fixture links forbidden');
    if (entry.isDirectory()) result.push(...await filesUnder(path)); else if (entry.isFile()) result.push(path);
  }
  return result;
}
export async function devHashes(repo: string): Promise<HashEntry[]> {
  const paths = [...await filesUnder(join(repo, 'fixtures/dev')), join(repo, 'fixtures/prices.test.json')];
  const entries: HashEntry[] = [];
  for (const path of paths) entries.push({ path: relative(repo, path).replaceAll('\\', '/'), sha256: hash(await readFile(path)) });
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export async function verifyHashes(repo: string, entriesValue: unknown): Promise<void> {
  if (!Array.isArray(entriesValue)) throw new Error('Missing manifest file list');
  const seen = new Set<string>();
  for (const raw of entriesValue) {
    const entry = object(raw);
    if (Object.keys(entry).sort().join(',') !== 'path,sha256' || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) || seen.has(entry.path)) throw new Error('Invalid manifest hash entry');
    seen.add(entry.path);
    const target = contained(repo, entry.path);
    // Reject aliases before opening contents, including a linked ancestor of an otherwise ordinary file.
    for (let current = target; current !== resolve(repo); current = dirname(current))
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Fixture links forbidden');
    contained(await realpath(repo), await realpath(target));
    if (hash(await readFile(target)) !== entry.sha256) throw new Error(`Fixture hash mismatch: ${entry.path}`);
  }
}
function sumMap(value: unknown): number { return Object.values(object(value)).reduce<number>((sum, item) => sum + (typeof item === 'number' ? item : 0), 0); }
const buckets = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'] as const;
/** Shape is insufficient: also verify the oracle's internal population identities without invoking the analyzer. */
export function validateRelations(expected: Expected): void {
  const check = (condition: boolean, name: string) => { if (!condition) throw new Error(`${expected.id}: inconsistent ${name}`); };
  const tokens = object(expected.tokens), qualities = object(expected.tokensByQuality), cost = object(expected.cost);
  const unknown = object(cost.unknownPriceEvents), events = object(expected.events), cache = object(expected.cacheHit);
  const byDay = Object.values(object(expected.byDay)).map(day => object(day));
  for (const bucket of buckets) {
    check(Object.values(qualities).reduce((sum, item) => sum + BigInt(String(object(item)[bucket])), 0n) === BigInt(String(tokens[bucket])), `quality ${bucket}`);
    check(byDay.reduce((sum, day) => sum + BigInt(String(object(day.tokens)[bucket])), 0n) === BigInt(String(tokens[bucket])), `day ${bucket}`);
    check(BigInt(String(object(cost.unknownPriceTokens)[bucket])) <= BigInt(String(tokens[bucket])), `unknown ${bucket}`);
  }
  check(sumMap(events.byQuality) === events.total && sumMap(events.byAgent) === events.total && expected.modelCalls === events.total, 'events');
  check(sumMap(unknown.byReason) === unknown.total && sumMap(unknown.byModel) === unknown.total, 'unknown prices');
  check(cost.complete === (unknown.total === 0), 'cost complete');
  check(typeof unknown.total === 'number' && typeof events.total === 'number' && unknown.total <= events.total, 'unknown event subset');
  check(cache.numerator === tokens.cacheRead && BigInt(String(cache.denominator)) ===
    ['input', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h'].reduce((sum, key) => sum + BigInt(String(tokens[key])), 0n), 'cache-hit fraction');
  check(byDay.reduce((sum, day) => sum + BigInt(String(day.knownPico)), 0n) === BigInt(String(cost.knownPico)), 'day costs');
  check(byDay.reduce((sum, day) => sum + (typeof day.events === 'number' ? day.events : 0), 0) === events.total, 'day events');
  const tools = object(expected.tools);
  check(sumMap(tools.byName) === tools.total && sumMap(tools.byMcpServer) <= (typeof tools.total === 'number' ? tools.total : 0), 'tools');
  check(sumMap(expected.toolResults) <= (typeof tools.total === 'number' ? tools.total : 0), 'Claude tool status subset');
  check(expected.retryAmbiguous === (object(expected.counters).retry_ambiguous_order ?? 0), 'ambiguous retries');
  const counters = object(expected.counters), skips = object(expected.skipped), qualityCounts = object(events.byQuality);
  check(typeof counters.rowsRead === 'number' && typeof counters.rowsRecognised === 'number' && counters.rowsRecognised <= counters.rowsRead, 'recognised row subset');
  const hidingSkips = ['line_too_long', 'invalid_utf8', 'malformed_json', 'truncated_line', 'bad_count', 'bad_timestamp',
    'field_too_long', 'compressed_unsupported', 'file_read_error', 'codex_session_unidentified'];
  check(expected.complete === (sumMap(expected.unresolved) === 0 && qualityCounts.observed_snapshot === 0 && qualityCounts.observed_epoch === 0 &&
    hidingSkips.every(key => (skips[key] ?? 0) === 0)), 'accounting complete');
  for (const day of Object.keys(object(expected.byDay))) {
    const date = new Date(`${day}T00:00:00Z`); check(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day, 'day calendar');
  }
}
const secretPatterns = [/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, /\bAKIA[A-Z0-9]{16}\b/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /(?:C:\\\\Users\\\\(?:Roy Harden|royha)|\/Users\/royharden|\/home\/royharden)/i,
  /\b(?:api[_-]?key|access[_-]?token|secret)\b["']?\s*[:=]\s*["'][A-Za-z0-9_/-]{20,}["']/i];
export async function checkHygiene(repo: string, path: string, expected?: Expected): Promise<void> {
  const bytes = await readFile(path), rel = relative(repo, path).replaceAll('\\', '/');
  const tags = expected?.traps ?? [], isLog = rel.includes('/logs/');
  const lines = bytes.toString('binary').split('\n');
  for (const raw of lines) {
    const line = Buffer.from(raw, 'binary');
    if (line.length > 8 * 1024 * 1024 && !(isLog && tags.includes('very-long-line'))) throw new Error(`${rel}: undeclared overlong line`);
    try { new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(line); }
    catch { if (!(isLog && tags.includes('invalid-utf8'))) throw new Error(`${rel}: undeclared invalid UTF-8`); }
    if (line.includes(13)) throw new Error(`${rel}: CR byte; fixtures require LF`);
    // D22 intentionally includes both first-line BOM removal and a later BOM which must remain malformed JSON.
    if (line.subarray(0, 3).equals(Buffer.from([239, 187, 191])) && !(isLog && tags.includes('bom'))) throw new Error(`${rel}: undeclared BOM`);
  }
  const text = bytes.toString('utf8');
  if (secretPatterns.some(pattern => pattern.test(text))) throw new Error(`${rel}: possible secret or real-user path`);
}
export async function checkFixtures(repo: string, split: 'dev' | 'heldout' = 'dev'): Promise<{ ids: string[]; traps: Record<string, string[]> }> {
  const manifest = object(await jsonFile(join(repo, 'fixtures/MANIFEST.json'))), section = object(manifest[split]);
  if (manifest.schema !== 's22-fixtures/1' || manifest.algorithm !== 'sha256' || manifest.pathBase !== 'repository') throw new Error('Invalid manifest header');
  const ids = await fixtureIds(repo, split);
  if (ids.length < (split === 'dev' ? 24 : 10) || JSON.stringify(ids) !== JSON.stringify(section.fixtureIds)) throw new Error('Fixture ids/count mismatch');
  await verifyHashes(repo, section.files);
  // Complete file-set check: a new unlisted input cannot silently change the scored corpus.
  const actual = split === 'dev' ? await devHashes(repo) : await Promise.all((await filesUnder(join(repo, 'fixtures/heldout'))).map(async path =>
    ({ path: relative(repo, path).replaceAll('\\', '/'), sha256: hash(await readFile(path)) })));
  const indexed = (section.files as HashEntry[]).map(entry => entry.path).sort();
  if (JSON.stringify(actual.map(entry => entry.path).sort()) !== JSON.stringify(indexed)) throw new Error('Manifest file-set mismatch');
  await verifyHashes(repo, manifest.contracts);
  const schema = object(await jsonFile(join(repo, 'fixtures/expected.schema.json'))), traps: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const id of ids) {
    const folder = join(repo, 'fixtures', split, id);
    const expected = validateExpected(await jsonFile(join(folder, 'expected.json')), schema);
    if (expected.id !== id || expected.prices !== (split === 'dev' ? 'fixtures/prices.test.json' : 'fixtures/heldout/prices.test.json')) throw new Error('Fixture input mismatch');
    validateRelations(expected); await readFixtureOptions(folder, split);
    const paths = await filesUnder(folder);
    if (!paths.some(path => relative(folder, path).replaceAll('\\', '/').startsWith('logs/'))) throw new Error('Fixture missing logs');
    for (const path of paths) await checkHygiene(repo, path, expected);
    for (const trap of expected.traps) { if (!traps[trap]) traps[trap] = []; traps[trap]?.push(id); }
  }
  if (split === 'dev') {
    const declared = object(object(object(schema.properties).traps).items).enum;
    if (!Array.isArray(declared)) throw new Error('Missing trap vocabulary');
    for (const trap of declared) if (typeof trap === 'string' && !Object.hasOwn(traps, trap)) {
      const contracts = directTrapContracts[trap]; if (!contracts) throw new Error(`Uncovered trap: ${trap}`);
      for (const path of contracts) if (!(await lstat(contained(repo, path))).isFile()) throw new Error(`Missing direct contract: ${path}`);
    }
  }
  return { ids, traps };
}
export function heldoutIdentity(manifest: JsonObject): string {
  return hash(JSON.stringify({ edition: manifest.edition, splitSeed: manifest.splitSeed, frozenDate: manifest.frozenDate,
    heldout: manifest.heldout, contracts: manifest.contracts }));
}
