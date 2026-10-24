import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadReport } from '../../src/web/download';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('user-requested Blob download lifecycle', () => {
  it('uses a local Blob, a fixed filename and revokes after the click for every format', () => {
    vi.useFakeTimers(); const create = vi.fn(() => 'blob:synthetic'); const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^coding-usage-report\.(csv|json|md)$/); expect(this.href).toBe('blob:synthetic');
    });
    for (const format of ['csv', 'json', 'md'] as const) downloadReport('safe aggregate', format);
    expect(create).toHaveBeenCalledTimes(3); expect(click).toHaveBeenCalledTimes(3);
    expect(document.querySelector('a')).toBeNull(); expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers(); expect(revoke).toHaveBeenCalledTimes(3);
  });
  it('still removes the anchor and revokes its URL if clicking fails', () => {
    vi.useFakeTimers(); const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:synthetic', revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('download denied'); });
    expect(() => downloadReport('safe aggregate', 'json')).toThrow('download denied');
    expect(document.querySelector('a')).toBeNull(); vi.runAllTimers(); expect(revoke).toHaveBeenCalledWith('blob:synthetic');
  });
});
