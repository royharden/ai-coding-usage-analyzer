import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/core/analyze';
import { asRecord } from '../src/core/lines';
import { validateFilters } from '../src/core/time';
import { toFixturePopulations } from '../src/core/serialize';
import { naiveSum } from '../src/baseline/naive';
import { nodePlatform } from '../src/node/platform';
import { walkInputs } from '../src/node/walk';

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export type JsonObject = Record<string, unknown>;
export interface Expected extends JsonObject { schema: 's22-expected/1'; id: string; tz: string; since: string | null;
  until: string | null; prices: string; tags: string[]; traps: string[] }
export interface Difference { path: string; expected: unknown; actual: unknown }
export interface FixtureOptions { schema: 's22-analysis-options/1'; metadataCap: number }
export const hash = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export async function jsonFile(path: string): Promise<unknown> { return JSON.parse(await readFile(path, 'utf8')) as unknown; }
export function object(value: unknown, message = 'Expected object'): JsonObject {
  const result = asRecord(value); if (!result) throw new Error(message); return result;
}
export function contained(root: string, path: string): string {
  const target = resolve(root, path), rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..\\`) || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Path outside repository');
  return target;
}

/** Validator for every keyword used by the frozen JSON Schema. Unsupported keywords fail closed.
 * This is a small local validator, not a general-purpose JSON Schema implementation.
 */
export function validateSchema(value: unknown, schema: JsonObject, root = schema, path = '$'): void {
  const allowed = new Set(['$schema', '$id', 'title', 'description', '$defs', '$ref', 'type', 'properties', 'required',
    'additionalProperties', 'patternProperties', 'const', 'enum', 'pattern', 'minLength', 'minimum', 'maximum', 'items', 'uniqueItems', 'minItems']);
  for (const key of Object.keys(schema)) if (!allowed.has(key)) throw new Error(`Unsupported schema keyword ${key}`);
  if (typeof schema.$ref === 'string') {
    if (!schema.$ref.startsWith('#/')) throw new Error('External schema references forbidden');
    let target: unknown = root;
    for (const key of schema.$ref.slice(2).split('/')) target = object(target)[key.replace(/~1/g, '/').replace(/~0/g, '~')];
    validateSchema(value, object(target), root, path); return;
  }
  const fail = (why: string): never => { throw new Error(`${path}: ${why}`); };
  const types = Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [] : [schema.type];
  if (types.length > 0 && !types.some(type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) :
    type === 'object' ? asRecord(value) !== undefined : type === 'integer' ? typeof value === 'number' && Number.isSafeInteger(value) : typeof value === type)) fail('type');
  if ('const' in schema && value !== schema.const) fail('const');
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) fail('enum');
  if (typeof value === 'string') {
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) fail('pattern');
    if (typeof schema.minLength === 'number' && [...value].length < schema.minLength) fail('minLength');
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) fail('minimum');
    if (typeof schema.maximum === 'number' && value > schema.maximum) fail('maximum');
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) fail('minItems');
    if (schema.uniqueItems === true && new Set(value.map(item => JSON.stringify(item))).size !== value.length) fail('uniqueItems');
    if (schema.items) for (const [index, item] of value.entries()) validateSchema(item, object(schema.items), root, `${path}[${index}]`);
  }
  const record = asRecord(value);
  if (record) {
    const props = asRecord(schema.properties) ?? {}, patterns = asRecord(schema.patternProperties) ?? {};
    if (Array.isArray(schema.required)) for (const key of schema.required) if (typeof key === 'string' && !Object.hasOwn(record, key)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(record)) {
      if (Object.hasOwn(props, key)) { validateSchema(item, object(props[key]), root, `${path}.${key}`); continue; }
      const matches = Object.entries(patterns).filter(([pattern]) => new RegExp(pattern).test(key));
      if (matches.length) { for (const [, child] of matches) validateSchema(item, object(child), root, `${path}.${key}`); }
      else if (schema.additionalProperties === false) fail(`unknown key ${key}`);
      else if (asRecord(schema.additionalProperties)) validateSchema(item, object(schema.additionalProperties), root, `${path}.${key}`);
    }
  }
}
export function validateExpected(value: unknown, schema: JsonObject): Expected {
  validateSchema(value, schema); const expected = value as Expected;
  validateFilters(expected.tz, expected.since ?? undefined, expected.until ?? undefined);
  return expected;
}
export function fixturePopulations(expected: Expected): JsonObject {
  return Object.fromEntries(Object.entries(expected).filter(([key]) => !['schema', 'id', 'prices', 'tags', 'traps'].includes(key)));
}
const sparsePaths = new Set(['unresolved', 'skipped', 'counters', 'tools.byName', 'tools.byMcpServer', 'cost.unknownPriceEvents.byReason', 'cost.unknownPriceEvents.byModel']);
/** Exact decimal strings remain strings. Only entries inside named sparse count maps default to zero. */
export function comparePopulations(expected: unknown, actual: unknown, path = ''): Difference[] {
  const left = asRecord(expected), right = asRecord(actual);
  if (left && right) return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap(key =>
    comparePopulations(Object.hasOwn(left, key) ? left[key] : sparsePaths.has(path) ? 0 : undefined,
      Object.hasOwn(right, key) ? right[key] : sparsePaths.has(path) ? 0 : undefined, path ? `${path}.${key}` : key));
  return expected === actual ? [] : [{ path, expected: expected ?? null, actual: actual ?? null }];
}
export function validateActual(actual: JsonObject, expected: Expected, schema: JsonObject): void {
  // Inject input-only fields, then validate all output families and reject unknown zero-valued reasons too.
  validateSchema({ schema: expected.schema, id: expected.id, prices: expected.prices, tags: expected.tags, traps: expected.traps, ...actual }, schema);
}
export async function readFixtureOptions(folder: string, split: 'dev' | 'heldout'): Promise<FixtureOptions | undefined> {
  let raw: unknown;
  try { raw = await jsonFile(join(folder, 'analysis-options.json')); }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined; throw error; }
  if (split !== 'dev') throw new Error('Held-out options sidecars forbidden in edition 1');
  const value = object(raw);
  if (Object.keys(value).sort().join(',') !== 'metadataCap,schema' || value.schema !== 's22-analysis-options/1' ||
    typeof value.metadataCap !== 'number' || !Number.isSafeInteger(value.metadataCap) || value.metadataCap < 0 || value.metadataCap > 1_000_000)
    throw new Error('Invalid fixture analysis options');
  return { schema: 's22-analysis-options/1', metadataCap: value.metadataCap };
}
export async function fixtureIds(repo: string, split: 'dev' | 'heldout'): Promise<string[]> {
  const entries = await readdir(join(repo, 'fixtures', split), { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory() && new RegExp(`^${split === 'dev' ? 'D' : 'H'}[0-9]{2}$`).test(entry.name)).map(entry => entry.name).sort();
}
export async function loadFixture(repo: string, split: 'dev' | 'heldout', id: string) {
  if (!new RegExp(`^${split === 'dev' ? 'D' : 'H'}[0-9]{2}$`).test(id)) throw new Error('Invalid fixture id');
  const folder = join(repo, 'fixtures', split, id);
  const schema = object(await jsonFile(join(repo, 'fixtures/expected.schema.json')));
  const expected = validateExpected(await jsonFile(join(folder, 'expected.json')), schema);
  if (expected.id !== id || expected.prices !== (split === 'dev' ? 'fixtures/prices.test.json' : 'fixtures/heldout/prices.test.json')) throw new Error('Fixture input mismatch');
  const analysisOptions = await readFixtureOptions(folder, split);
  const priceTableText = await readFile(contained(repo, expected.prices), 'utf8');
  const walked = await walkInputs([{ agent: 'claude', path: join(folder, 'logs/claude'), optional: true },
    { agent: 'codex', path: join(folder, 'logs/codex'), optional: true }]);
  return { expected, schema, analysisOptions, priceTableText, walked };
}
export async function scoreFixture(repo: string, split: 'dev' | 'heldout', id: string) {
  const loaded = await loadFixture(repo, split, id), { expected, schema, priceTableText, walked, analysisOptions } = loaded;
  const filters = { tz: expected.tz, since: expected.since, until: expected.until };
  const report = await analyze(walked.sources, { tz: filters.tz, since: filters.since ?? undefined, until: filters.until ?? undefined,
    priceTableText, intakeDiagnostics: walked.diagnostics, ...(analysisOptions ? { metadataCap: analysisOptions.metadataCap } : {}) }, nodePlatform);
  const actual = toFixturePopulations(report);
  const differences = comparePopulations(fixturePopulations(expected), actual);
  try { validateActual(actual, expected, schema); }
  catch (error) { differences.unshift({ path: '$schema', expected: 'closed s22-expected/1 populations', actual: error instanceof Error ? error.message : 'invalid output' }); }
  const naive = await naiveSum(walked.sources, JSON.parse(priceTableText) as unknown, nodePlatform, filters);
  const negativeControlDifferences = comparePopulations({ tokens: expected.tokens, cost: { knownPico: object(expected.cost).knownPico } },
    { tokens: naive.tokens, cost: naive.cost });
  return { id, split, analysisOptions: analysisOptions ?? { schema: 's22-analysis-options/1', metadataCap: 1_000_000 },
    actual, differences, naive, negativeControlDifferences, controlRequired: expected.tags.includes('accounting-control') };
}
/** Read only local Git metadata; never invoke git or another process. Detached HEAD/worktrees/packed refs supported. */
export async function codeCommit(repo: string, explicit?: string): Promise<string> {
  if (explicit !== undefined) { if (!/^[a-f0-9]{40,64}$/.test(explicit)) throw new Error('Invalid --code-commit'); return explicit; }
  let git = join(repo, '.git');
  if ((await lstat(git)).isFile()) {
    const text = await readFile(git, 'utf8'); if (!text.startsWith('gitdir: ')) throw new Error('Invalid gitdir');
    git = resolve(repo, text.slice(8).trim());
  }
  const head = (await readFile(join(git, 'HEAD'), 'utf8')).trim();
  if (/^[a-f0-9]{40,64}$/.test(head)) return head;
  if (!head.startsWith('ref: refs/') || head.includes('..')) throw new Error('Invalid HEAD');
  const ref = head.slice(5);
  let common = git;
  try { common = resolve(git, (await readFile(join(git, 'commondir'), 'utf8')).trim()); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  for (const directory of [...new Set([git, common])]) {
    try { const value = (await readFile(join(directory, ref), 'utf8')).trim(); if (/^[a-f0-9]{40,64}$/.test(value)) return value; }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  const packed = await readFile(join(common, 'packed-refs'), 'utf8');
  for (const line of packed.split('\n')) { const [commit, name] = line.trim().split(' '); if (name === ref && commit && /^[a-f0-9]{40,64}$/.test(commit)) return commit; }
  throw new Error('Cannot resolve code commit; pass --code-commit');
}
