import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { walkInputs } from '../../src/node/walk';
import { nodePlatform } from '../../src/node/platform';

const temporary: string[] = [];
async function workspace(): Promise<string> { const path = await mkdtemp(join(tmpdir(), 's22-walk-')); temporary.push(path); return path; }
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
async function read(source: { read: () => AsyncIterable<Uint8Array> }): Promise<string> {
  const parts: Uint8Array[] = [];
  for await (const chunk of source.read()) parts.push(chunk);
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return nodePlatform.decodeUtf8(bytes);
}
describe('read-only intake and link policy', () => {
  it('discovers jsonl and zst, counts other files without opening contents and retains only ordinal diagnostic references', async () => {
    const root = await workspace(); await mkdir(join(root, 'nested'));
    const log = join(root, 'nested', 'a.jsonl'), text = '{"synthetic":true}\n';
    await writeFile(log, text); await writeFile(join(root, 'archive.jsonl.zst'), 'compressed');
    await writeFile(join(root, 'auth.json'), 'SYNTHETIC-DO-NOT-READ'); await writeFile(join(root, 'config.sqlite'), 'ignored');
    const before = await stat(log);
    const walked = await walkInputs([{ agent: 'claude', path: root }]);
    expect(walked.sources.map(source => source.name).sort()).toEqual(['a.jsonl', 'archive.jsonl.zst']);
    expect(walked.sources.every(source => /^f\d+$/.test(source.fileId))).toBe(true);
    expect(walked.diagnostics).toEqual([{ category: 'skip', code: 'ignored_non_jsonl', count: 2 }]);
    expect(JSON.stringify(walked.diagnostics)).not.toContain(root);
    const source = walked.sources.find(source => source.name === 'a.jsonl');
    if (!source) throw new Error('Expected the synthetic JSONL source');
    expect(await read(source)).toBe(text);
    expect(await readFile(log, 'utf8')).toBe(text);
    expect((await stat(log)).mtimeMs).toBe(before.mtimeMs);
    expect(walked.totalBytes).toBe(Buffer.byteLength(text) + Buffer.byteLength('compressed'));
  });
  it('skips junctions or symlinks both outside and inside the root, including explicit link roots', async () => {
    const base = await workspace(), root = join(base, 'input'), outside = join(base, 'outside');
    await mkdir(root); await mkdir(outside); await mkdir(join(root, 'real'));
    await writeFile(join(root, 'real', 'inside.jsonl'), '{}\n'); await writeFile(join(outside, 'outside.jsonl'), '{}\n');
    const kind = process.platform === 'win32' ? 'junction' : 'dir';
    await symlink(outside, join(root, 'escape'), kind); await symlink(join(root, 'real'), join(root, 'alias'), kind);
    const walked = await walkInputs([{ agent: 'claude', path: root }]);
    expect(walked.sources.map(source => source.name)).toEqual(['inside.jsonl']);
    expect(walked.diagnostics).toContainEqual({ category: 'skip', code: 'file_read_error', count: 2 });
    const linkRoot = await walkInputs([{ agent: 'claude', path: join(root, 'escape') }]);
    expect(linkRoot.sources).toHaveLength(0); expect(linkRoot.diagnostics[0]?.code).toBe('file_read_error');
  });
  it('counts missing explicit roots safely, tolerates absent default archives and deduplicates overlapping roots', async () => {
    const root = await workspace(); await mkdir(join(root, 'child')); await writeFile(join(root, 'child', 'a.jsonl'), '{}\n');
    const walked = await walkInputs([{ agent: 'codex', path: root }, { agent: 'codex', path: join(root, 'child') },
      { agent: 'codex', path: join(root, 'absent'), optional: true }, { agent: 'claude', path: join(root, 'missing') }]);
    expect(walked.sources).toHaveLength(1);
    expect(walked.diagnostics).toEqual([{ category: 'skip', code: 'file_read_error', count: 1 }]);
  });
  it('rejects a discovered file replaced before opening rather than reading a link target', async () => {
    const root = await workspace(), file = join(root, 'a.jsonl');
    await writeFile(file, '{}\n');
    const walked = await walkInputs([{ agent: 'claude', path: root }]);
    await rm(file); await mkdir(file);
    const source = walked.sources[0];
    if (!source) throw new Error('Expected the synthetic JSONL source');
    await expect(read(source)).rejects.toThrow();
  });
  it('L3 rejects invalid UTF8, preserves BOM and hashes deterministically', async () => {
    expect(() => nodePlatform.decodeUtf8(new Uint8Array([0xff]))).toThrow();
    expect(nodePlatform.decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, 123, 125]))).toBe('\uFEFF{}');
    expect(await nodePlatform.sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
