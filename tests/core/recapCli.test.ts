import { expect, it } from 'vitest';
import { toTable } from '../../src/cli/main';
import { RECAP_FAILURE_REASON } from '../../src/core/recapCheck';
import { report } from './reportHelpers';

it('prints the complete checked recap in CLI text and suppresses a tampered candidate', async () => {
  const value = await report();
  if (!value.recap) throw new Error('Missing recap');
  expect(value.recap.text.length).toBeGreaterThan(200);
  expect(toTable(value)).toContain(`Recap (checked): ${value.recap.text}`);
  value.recap.text += ' unsafe 123';
  expect(toTable(value)).toContain(RECAP_FAILURE_REASON);
  expect(toTable(value)).not.toContain('unsafe 123');
});

it('uses serialized suppression when report aggregates change but its retained recap and metric table do not', async () => {
  const value = await report();
  value.tokens.input = 9007199254740993n;
  expect(toTable(value)).toContain(RECAP_FAILURE_REASON);
  expect(toTable(value)).not.toContain('Recap (checked):');
});
