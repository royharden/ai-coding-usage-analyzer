import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncReadmeResults } from '../../scripts/eval';

describe('generated evaluation README region', () => {
  it('preserves surrounding authored text and derives the status from results', async () => {
    const dir = await mkdtemp(join(tmpdir(), 's22-readme-'));
    const start = '<!-- evaluation-results:start -->', end = '<!-- evaluation-results:end -->';
    await writeFile(join(dir, 'README.md'), `Before\n${start}\nold\n${end}\nAfter\n`);
    await syncReadmeResults(dir, '# New results\n\nnot yet run\n');
    expect(await readFile(join(dir, 'README.md'), 'utf8'))
      .toBe(`Before\n${start}\n\n### New results\n\nnot yet run\n\n${end}\nAfter\n`);
  });

  it('refuses ambiguous markers without replacing the document', async () => {
    const dir = await mkdtemp(join(tmpdir(), 's22-readme-invalid-'));
    const source = '<!-- evaluation-results:start -->\n<!-- evaluation-results:start -->\n<!-- evaluation-results:end -->';
    await writeFile(join(dir, 'README.md'), source);
    await expect(syncReadmeResults(dir, '# New results')).rejects.toThrow('Invalid README results markers');
    expect(await readFile(join(dir, 'README.md'), 'utf8')).toBe(source);
  });
});
