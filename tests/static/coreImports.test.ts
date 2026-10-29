import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const core = fileURLToPath(new URL('../../src/core/', import.meta.url));
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name))
    : entry.isFile() && entry.name.endsWith('.ts') ? [join(directory, entry.name)] : []);
}
it('keeps all core static/dynamic imports, re-exports and requires inside the pure core boundary', () => {
  const violations: string[] = [];
  for (const file of files(core)) {
    const source = readFileSync(file, 'utf8');
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)];
    for (const match of imports) {
      const specifier = match[1] ?? '';
      const path = resolve(dirname(file), specifier), relation = relative(core, path);
      if (!specifier.startsWith('.') || relation === '..' || relation.startsWith(`..${sep}`)) violations.push(`${relative(core, file)}: ${specifier}`);
    }
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '');
    if (/\b(?:window|document|navigator|process|Buffer|React)\b/.test(code)) violations.push(`${relative(core, file)}: platform global`);
    if (/\b(?:import|require)\s*\(\s*[^'"\s]/.test(source)) violations.push(`${relative(core, file)}: computed import`);
  }
  expect(violations).toEqual([]);
});
