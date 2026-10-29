import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyze } from '../../src/core/analyze';
import type { InputSource } from '../../src/core/analyze';
import type { WorkerRequest, WorkerResponse } from '../../src/web/workerProtocol';
import { coreReport } from './data';

vi.mock('../../src/core/analyze', () => ({ analyze: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
async function boot() {
  const sent = vi.fn<(response: WorkerResponse) => void>();
  vi.stubGlobal('postMessage', sent); vi.stubGlobal('onmessage', null);
  vi.stubGlobal('crypto', { subtle: webcrypto.subtle });
  await import('../../src/web/worker');
  const send = (request: WorkerRequest) => { globalThis.onmessage?.({ data: request } as MessageEvent<WorkerRequest>); };
  return { sent, send };
}
describe('one import worker and safe report/export boundary', () => {
  it('streams all files into one global analysis call and posts only serialized aggregate data', async () => {
    const seen: InputSource[] = [];
    vi.mocked(analyze).mockImplementation(async sources => {
      seen.push(...sources);
      for (const source of sources) for await (const chunk of source.read()) expect(chunk).toBeInstanceOf(Uint8Array);
      return coreReport();
    });
    const { sent, send } = await boot();
    const release = vi.fn();
    function file(name: string): File {
      let done = false;
      return { name, size: 2, stream: () => ({ getReader: () => ({
        read: async () => { if (done) return { done: true }; done = true; return { done: false, value: new Uint8Array([123, 125]) }; },
        releaseLock: release,
      }) }) } as unknown as File;
    }
    send({ kind: 'analyze', files: [
      { file: file('one.jsonl'), fileId: 'f1', relativePath: 'claude/one.jsonl', agent: 'claude' },
      { file: file('rollout-two.jsonl'), fileId: 'f2', relativePath: 'codex/rollout-two.jsonl', agent: 'codex' },
    ], options: { tz: 'UTC', priceTableText: '{"schema":"pricetable/1","currency":"USD","unit":"micro_usd_per_mtok","rows":[]}' } });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'complete' })));
    expect(analyze).toHaveBeenCalledOnce(); expect(seen.map(source => source.fileId)).toEqual(['f1', 'f2']); expect(release).toHaveBeenCalledTimes(2);
    const response = sent.mock.calls[0]?.[0];
    expect(() => JSON.stringify(response)).not.toThrow();
    expect(JSON.stringify(response)).not.toContain('relativePath'); expect(JSON.stringify(response)).not.toContain('one.jsonl');
    for (const format of ['csv', 'json', 'md'] as const) {
      send({ kind: 'export', format });
      await vi.waitFor(() => expect(sent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'export', format, text: expect.any(String) })));
    }
    expect(analyze).toHaveBeenCalledOnce();
  });
  it('does not echo parser exception content and cannot export a failed import', async () => {
    vi.mocked(analyze).mockRejectedValue(new Error('PRIVATE-RAW-TEXT /private/path'));
    const { sent, send } = await boot();
    send({ kind: 'analyze', files: [], options: { tz: 'UTC', priceTableText: '{}' } });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' })));
    expect(JSON.stringify(sent.mock.calls)).not.toContain('PRIVATE'); expect(JSON.stringify(sent.mock.calls)).not.toContain('/private/path');
    send({ kind: 'export', format: 'json' }); expect(sent).toHaveBeenLastCalledWith({ kind: 'error', message: 'Run an import before exporting.' });
  });
});
