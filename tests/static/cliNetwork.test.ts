import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../src/', import.meta.url));
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name))
    : entry.isFile() && entry.name.endsWith('.ts') ? [join(directory, entry.name)] : []);
}
it('keeps CLI and host adapters free of networking and subprocess imports', () => {
  const violations: string[] = [];
  for (const file of [...files(join(root, 'cli')), ...files(join(root, 'node'))]) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)) {
      if (/^(?:node:)?(?:https?|http2|net|dgram|child_process|tls|cluster|worker_threads)(?:\/|$)/.test(match[1] ?? ''))
        violations.push(`${relative(root, file)}: ${match[1]}`);
      if (/^(?:https?:|\/\/)/.test(match[1] ?? '')) violations.push(`${relative(root, file)}: remote import`);
    }
    if (/\b(?:import|require)\s*\(\s*[^'"\s]/.test(source)) violations.push(`${relative(root, file)}: computed import`);
  }
  expect(violations).toEqual([]);
});
