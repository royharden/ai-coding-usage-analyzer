import { mkdir, mkdtemp, open, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalTarget, isWithin, resolveOutputTarget } from '../../src/node/outGuard';
import { runCli } from '../../src/cli/main';

const temporary: string[] = [];
async function workspace(): Promise<string> { const path = await mkdtemp(join(tmpdir(), 's22-out-')); temporary.push(path); return path; }
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
describe('output destination guard', () => {
  it('refuses inside any root, including nonexistent descendants and the root itself', async () => {
    const base = await workspace(), a = join(base, 'a'), b = join(base, 'b'); await mkdir(a); await mkdir(b);
    for (const destination of [a, join(a, 'report.json'), join(b, 'missing', 'report.json')]) {
      await expect(resolveOutputTarget(destination, [a, b])).rejects.toThrow('outside every input root');
    }
    expect(isWithin(a, join(base, 'ab', 'report.json'))).toBe(false);
    expect(await resolveOutputTarget(join(base, 'new.json'), [a, b])).toBe(join(await realpath(base), 'new.json'));
  });
  it('resolves the nearest existing ancestor through a junction to reject physical containment', async () => {
    const base = await workspace(), input = join(base, 'input'), alias = join(base, 'alias'); await mkdir(input);
    await symlink(input, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await canonicalTarget(join(alias, 'missing', 'report.json'))).toBe(join(await realpath(input), 'missing', 'report.json'));
    await expect(resolveOutputTarget(join(alias, 'missing', 'report.json'), [input])).rejects.toThrow();
    await expect(resolveOutputTarget(join(input, 'report.json'), [alias])).rejects.toThrow();
  });
  it('refuses existing files and final exclusive creation refuses a later collision', async () => {
    const base = await workspace(), root = join(base, 'input'), destination = join(base, 'report.json'); await mkdir(root);
    const safe = await resolveOutputTarget(destination, [root]); await writeFile(destination, 'prior report');
    await expect(resolveOutputTarget(destination, [root])).rejects.toThrow('already exists');
    await expect(open(safe, 'wx')).rejects.toThrow(); expect(await readFile(destination, 'utf8')).toBe('prior report');
  });
  it('CLI refuses an unsafe destination before walking or reading content', async () => {
    const base = await workspace(), root = join(base, 'input'); await mkdir(root);
    let reads = 0; const errors: string[] = [];
    const code = await runCli(['--claude', root, '--out', join(root, 'report.json')], {
      defaults: { timezone: 'UTC' }, stderr: text => { errors.push(text); },
      walk: async () => { reads += 1; return { sources: [], diagnostics: [], totalBytes: 0 }; },
      readPriceText: async () => { reads += 1; return ''; },
    });
    expect(code).toBe(1); expect(reads).toBe(0); expect(errors.join('')).not.toContain(root);
  });
  it('CLI writes only an explicitly selected new report outside input and refuses to overwrite it', async () => {
    const base = await workspace(), root = join(base, 'input'), destination = join(base, 'report.json'); await mkdir(root);
    const input = join(root, 'synthetic.jsonl'); await writeFile(input, '{}\n');
    const prices = JSON.stringify({ schema: 'pricetable/1', currency: 'USD', unit: 'micro_usd_per_mtok', rows: [] });
    const argv = ['--claude', root, '--tz', 'UTC', '--format', 'json', '--out', destination];
    const stdout: string[] = [], stderr: string[] = [];
    const dependencies = { stdout: (text: string) => { stdout.push(text); }, stderr: (text: string) => { stderr.push(text); },
      readPriceText: async () => prices };
    expect(await runCli(argv, dependencies)).toBe(0);
    const original = await readFile(destination, 'utf8');
    expect(JSON.parse(original) as unknown).toMatchObject({ schema: 's22-report/1', metadata: { tz: 'UTC' } });
    expect(stdout).toEqual([]); expect(stderr).toEqual([]); expect(await readFile(input, 'utf8')).toBe('{}\n');
    expect(await runCli(argv, dependencies)).toBe(1);
    expect(await readFile(destination, 'utf8')).toBe(original);
  });
});
