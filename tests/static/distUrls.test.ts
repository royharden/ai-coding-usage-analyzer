import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name))
    : entry.isFile() && /\.(?:html|js|css|json|svg)$/.test(entry.name) ? [join(directory, entry.name)] : []);
}
function inertUrl(url: string, prefix: string): boolean {
  return new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink', 'http://www.w3.org/XML/1998/namespace']).has(url)
    || /^https:\/\/react\.dev\/errors\/\d+(?:\?[^\s"'<>]*)?$/.test(url)
    || /^https?:\/\/reactjs\.org\/docs\/error-decoder\.html\?invariant=/.test(url)
    // Only an immediately preceding JSON field proves provenance data. Never allow a domain globally.
    || /(?:["']source_url["']|\bsource_url)\s*:\s*["']$/.test(prefix);
}
describe('4.7 built-asset URL inspection', () => {
  it.skipIf(!existsSync(dist))('scans dist URLs (PENDING until the first authorized build creates dist)', () => {
    const violations: string[] = [];
    for (const file of files(dist)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/https?:\/\/[^\s"'`<>\\)]+/g)) {
        if (!inertUrl(match[0], source.slice(Math.max(0, match.index - 100), match.index)))
          violations.push(`${relative(dist, file)}: ${match[0]}`);
      }
    }
    expect(violations).toEqual([]);
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(html).toContain("default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
  });
});
