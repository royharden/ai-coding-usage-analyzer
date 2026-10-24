import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkFixtures } from './fixture-lib';
import { repository } from './eval-lib';

export async function main(args: string[]): Promise<void> {
  if (args.some(arg => arg !== '--heldout')) throw new Error('Usage: check-fixtures [--heldout]');
  const result = await checkFixtures(repository, args.includes('--heldout') ? 'heldout' : 'dev');
  console.log(`Fixture integrity/shape/relations/hygiene checked: ${result.ids.join(', ')}. No accounting score or model calls.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(() => { console.error('Fixture check failed; inspect the fixture contract and hashes.'); process.exitCode = 1; });
