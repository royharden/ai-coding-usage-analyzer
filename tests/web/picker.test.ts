import { describe, expect, it } from 'vitest';
import { pickDirectory, prepareFiles, supportsFolderInput } from '../../src/web/picker';

describe('directory -> compatibility folder -> multifile intake', () => {
  it('collects granted directory files with relative paths and import-local IDs', async () => {
    const file = new File(['{}'], 'rollout-synthetic.jsonl');
    const result = await pickDirectory({ showDirectoryPicker: async () => ({ kind: 'directory', name: 'logs',
      async *values() { yield { kind: 'directory', name: 'codex', async *values() { yield { kind: 'file', name: file.name, getFile: async () => file }; } }; },
    }) });
    expect(result.kind).toBe('selected');
    if (result.kind === 'selected') expect(prepareFiles(result.files, 'auto')).toEqual([
      { file, fileId: 'f1', relativePath: 'logs/codex/rollout-synthetic.jsonl', agent: 'codex' },
    ]);
  });
  it('uses compatibility mode when absent or denied by a SecurityError', async () => {
    expect((await pickDirectory({})).kind).toBe('compatibility');
    expect((await pickDirectory({ showDirectoryPicker: async () => { throw new DOMException('denied', 'SecurityError'); } })).kind).toBe('compatibility');
  });
  it('treats picker dismissal as cancellation without changing an existing selection', async () => {
    expect(await pickDirectory({ showDirectoryPicker: async () => { throw new DOMException('dismissed', 'AbortError'); } })).toEqual({ kind: 'cancelled' });
  });
  it('detects compatibility folder support and otherwise preserves the multifile fallback', () => {
    expect(supportsFolderInput({ webkitdirectory: true } as HTMLInputElement)).toBe(true);
    expect(supportsFolderInput({} as HTMLInputElement)).toBe(false);
    const files = [new File([''], 'renamed.jsonl'), new File([''], 'rollout-synthetic.jsonl')];
    expect(prepareFiles(files, 'codex').map(file => file.agent)).toEqual(['codex', 'codex']);
    expect(prepareFiles(files, 'auto').map(file => file.agent)).toEqual(['claude', 'codex']);
    expect(prepareFiles(files, 'claude').map(file => file.agent)).toEqual(['claude', 'claude']);
  });
});
