import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repository, object, fixtureIds } from './eval-lib';
import { devHashes } from './fixture-lib';

/** Preserve M0 header, heldout and contracts byte values. Only dev inventory can be refreshed in edition 1. */
export async function freezeDev(repo: string): Promise<void> {
  const path = join(repo, 'fixtures/MANIFEST.json');
  const manifest = object(JSON.parse(await readFile(path, 'utf8')) as unknown);
  if (manifest.schema !== 's22-fixtures/1' || manifest.edition !== 1 || manifest.algorithm !== 'sha256') throw new Error('Unsupported manifest edition');
  const immutable = JSON.stringify({ heldout: manifest.heldout, contracts: manifest.contracts });
  manifest.dev = { status: 'authored-unexecuted', fixtureIds: await fixtureIds(repo, 'dev'), files: await devHashes(repo) };
  if (immutable !== JSON.stringify({ heldout: manifest.heldout, contracts: manifest.contracts })) throw new Error('Frozen data changed');
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
export async function main(args: string[]): Promise<void> {
  if (args.length) throw new Error('Only dev freeze is allowed. Frozen held-out changes require a separately authored new edition.');
  await freezeDev(repository); console.log('Dev hashes refreshed. M0 held-out edition and contracts preserved; no score performed.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(() => { console.error('Dev freeze failed. Held-out refreeze is forbidden.'); process.exitCode = 1; });
