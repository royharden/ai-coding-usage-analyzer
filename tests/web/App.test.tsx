import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, DayChart } from '../../src/web/App';
import * as time from '../../src/core/time';
import * as picker from '../../src/web/picker';
import type { BrowserWorker } from '../../src/web/App';
import type { WorkerResponse } from '../../src/web/workerProtocol';
import { uiReport } from './data';

function fakeWorker() {
  const worker: BrowserWorker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
  return { worker, send: (response: WorkerResponse) => act(() => { worker.onmessage?.({ data: response } as MessageEvent<WorkerResponse>); }) };
}
function select(size = 20) {
  const file = new File(['synthetic'], 'sample.jsonl');
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(screen.getByLabelText('Transcript files'), { target: { files: [file] } });
  return file;
}
async function start(worker: BrowserWorker) {
  render(<App supported createWorker={() => worker} />); select();
  fireEvent.click(screen.getByRole('button', { name: 'Analyze files' }));
  await waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('browser states and lifecycle (source only until activation)', () => {
  it('defaults to the detected local IANA zone and preserves an explicit user edit (4.5)', async () => {
    vi.spyOn(time, 'localTimeZone').mockReturnValue('America/New_York');
    const fake = fakeWorker(); render(<App supported createWorker={() => fake.worker} />);
    expect((screen.getByLabelText('Timezone') as HTMLInputElement).value).toBe('America/New_York');
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Asia/Kolkata' } }); select();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze files' }));
    await waitFor(() => expect(fake.worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ tz: 'Asia/Kolkata' }) })));
  });
  it('starts empty, shows selected state, and sends every file to one worker', async () => {
    const { worker } = fakeWorker(); render(<App supported createWorker={() => worker} />);
    expect(screen.getByRole('status').textContent).toBe('Ready to import');
    expect(screen.getByRole('button', { name: 'Analyze files' }).hasAttribute('disabled')).toBe(true);
    select(); select(); expect(screen.getByText(/2 files selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze files' }));
    await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'analyze', files: expect.any(Array) })));
    const request = vi.mocked(worker.postMessage).mock.calls[0]?.[0];
    expect(request?.kind === 'analyze' ? request.files.map(file => file.fileId) : []).toEqual(['f1', 'f2']);
    expect(screen.getByRole('status').textContent).toBe('Analyzing locally');
  });
  it('displays unsupported capabilities and prevents an import', () => {
    render(<App supported={false} />); expect(screen.getByRole('alert').textContent).toContain('module worker');
    expect(screen.getByRole('button', { name: 'Choose files' }).hasAttribute('disabled')).toBe(true);
  });
  it('exposes the compatibility picker after a blocked directory API and keeps multifile selection available', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => { throw new DOMException('blocked', 'SecurityError'); }));
    render(<App supported />);
    const folder = screen.getByLabelText('Compatibility transcript folder');
    Object.defineProperty(folder, 'webkitdirectory', { configurable: true, value: true });
    const click = vi.spyOn(folder, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(screen.getByText(/Folder access is unavailable here/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose files' }).hasAttribute('disabled')).toBe(false);
  });
  it('reads a deliberately selected local price JSON and never loads a sample price asset', async () => {
    const fake = fakeWorker(); render(<App supported createWorker={() => fake.worker} />); select();
    const priceText = '{"schema":"pricetable/1","currency":"USD","unit":"micro_usd_per_mtok","rows":[]}';
    const price = new File([priceText], 'local-prices.json');
    Object.defineProperty(price, 'arrayBuffer', { value: async () => new TextEncoder().encode(priceText).buffer });
    fireEvent.change(screen.getByLabelText('Local price table JSON'), { target: { files: [price] } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze files' }));
    await waitFor(() => expect(fake.worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ priceTableText: priceText }) })));
  });
  it('falls back to individual files when both directory-picker APIs are unavailable', async () => {
    vi.stubGlobal('showDirectoryPicker', undefined); vi.spyOn(picker, 'supportsFolderInput').mockReturnValue(false);
    render(<App supported />);
    const fileInput = screen.getByLabelText('Transcript files'); const click = vi.spyOn(fileInput, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
  });
  it('cancel during pending price-file decoding prevents a worker from starting later', async () => {
    const createWorker = vi.fn(); render(<App supported createWorker={createWorker} />); select();
    let finish: ((value: ArrayBuffer) => void) | undefined;
    const price = new File(['{}'], 'local-prices.json');
    Object.defineProperty(price, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) });
    fireEvent.change(screen.getByLabelText('Local price table JSON'), { target: { files: [price] } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
    await act(async () => { finish?.(new TextEncoder().encode('{}').buffer); });
    expect(createWorker).not.toHaveBeenCalled(); expect(screen.getByText(/0 files selected/)).toBeTruthy();
  });
  it('requires deliberate consent above 500 MB, then passes allowLarge', async () => {
    const { worker } = fakeWorker(); render(<App supported createWorker={() => worker} />); select(500_000_001);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze files' }));
    expect(screen.getByRole('alert').textContent).toContain('Large import'); expect(worker.postMessage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue large import' }));
    await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ allowLarge: true }) })));
  });
  it('refuses over 2 GB without creating a worker', () => {
    const createWorker = vi.fn(); render(<App supported createWorker={createWorker} />); select(2_000_000_001);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze files' }));
    expect(screen.getByRole('alert').textContent).toContain('Import refused'); expect(createWorker).not.toHaveBeenCalled();
  });
  it('validates timezone and date order before creating a worker', () => {
    const createWorker = vi.fn(); render(<App supported createWorker={createWorker} />); select();
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Invalid/Zone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze files' }));
    expect(screen.getByRole('alert').textContent).toContain('valid IANA timezone'); expect(createWorker).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'UTC' } });
    fireEvent.change(screen.getByLabelText('Since date'), { target: { value: '2026-10-25' } });
    fireEvent.change(screen.getByLabelText('Until date'), { target: { value: '2026-10-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze files' })); expect(createWorker).not.toHaveBeenCalled();
  });
  it('cancel terminates worker, clears files and ignores a late report', async () => {
    const fake = fakeWorker(); await start(fake.worker);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel import' })); expect(fake.worker.terminate).toHaveBeenCalledOnce();
    fake.send({ kind: 'complete', report: uiReport() });
    expect(screen.getByText(/0 files selected/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Export JSON' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Import cancelled');
  });
  it('renders complete report, all five views and the three diagnostic panels', async () => {
    const fake = fakeWorker(); await start(fake.worker); fake.send({ kind: 'complete', report: uiReport() });
    expect(screen.getAllByRole('status')[0]?.textContent).toBe('Usage complete');
    for (const view of ['Projects', 'Sessions', 'Models', 'Tools', 'Overview']) {
      fireEvent.click(screen.getByRole('button', { name: view })); expect(screen.getByRole('heading', { name: view })).toBeTruthy();
    }
    for (const name of ['Unknown prices', 'Unresolved usage', 'Diagnostics', 'Checked recap']) expect(screen.getByRole('heading', { name })).toBeTruthy();
    expect(screen.getByText(/Counted 1 model calls/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(fake.worker.terminate).toHaveBeenCalledOnce(); expect(screen.queryByRole('heading', { name: 'Checked recap' })).toBeNull();
    expect(screen.getByText(/0 files selected/)).toBeTruthy();
  });
  it('shows partial, unknown and unresolved coverage separately, and suppresses unchecked recap', async () => {
    const fake = fakeWorker(); await start(fake.worker); const report = uiReport();
    report.complete = false; report.cost.complete = false; report.cost.unknownPriceEvents.total = 1;
    report.cost.unknownPriceEvents.byReason = { no_price_row: 1 }; report.unresolved = { cache_split_mismatch: 1 };
    report.recapStatus = { ok: false, reason: 'Recap suppressed because its metric references could not be verified.' };
    fake.send({ kind: 'complete', report });
    expect(screen.getAllByRole('status')[0]?.textContent).toBe('Partial usage');
    expect(screen.getByText(/incomplete price coverage/)).toBeTruthy(); expect(screen.getByText('cache_split_mismatch')).toBeTruthy();
    expect(screen.queryByText(/Counted 1 model calls/)).toBeNull(); expect(screen.getByText(/Recap suppressed because/)).toBeTruthy();
  });
  it('renders fixed worker failure and permits reset', async () => {
    const fake = fakeWorker(); await start(fake.worker); fake.send({ kind: 'error', message: 'Import failed.' });
    expect(screen.getByRole('alert').textContent).toBe('Import failed.'); expect(fake.worker.terminate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' })); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('changes to timezone/path/source filters invalidate a stale report and exports', async () => {
    const fake = fakeWorker(); await start(fake.worker); fake.send({ kind: 'complete', report: uiReport() });
    fireEvent.click(screen.getByRole('checkbox')); expect(fake.worker.terminate).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Export JSON' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Transcript source'), { target: { value: 'codex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze files' }));
    await waitFor(() => expect(fake.worker.postMessage).toHaveBeenCalledTimes(2));
    const request = vi.mocked(fake.worker.postMessage).mock.calls[1]?.[0];
    expect(request?.kind === 'analyze' ? [request.files[0]?.agent, request.options.fullPaths] : []).toEqual(['codex', true]);
  });
  it('posts export requests rather than serializing report state in the UI', async () => {
    const fake = fakeWorker(); await start(fake.worker); fake.send({ kind: 'complete', report: uiReport() });
    fireEvent.click(screen.getByRole('button', { name: 'Export Markdown' }));
    expect(fake.worker.postMessage).toHaveBeenLastCalledWith({ kind: 'export', format: 'md' });
  });
  it('keeps hostile model, project and tool strings as text and prototype-looking names as own keys', async () => {
    const fake = fakeWorker(); await start(fake.worker); const report = uiReport();
    const hostile = '=SUM(1,2)|[x]*_<img src=x onerror=alert(1)>';
    const row = report.groupings.project[0]; if (row) row.label = hostile;
    report.tools.byName = Object.fromEntries([['__proto__', 1], ['constructor', 1], [hostile, 1]]);
    report.cost.unknownPriceEvents.byModel = Object.fromEntries([[hostile, 1]]);
    fake.send({ kind: 'complete', report }); fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    const projects = screen.getByRole('table', { name: 'Projects usage in UTC' });
    expect(within(projects).getByText(hostile)).toBeTruthy(); expect(document.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tools' })); expect(screen.getByText('__proto__')).toBeTruthy();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('retains exact huge chart values while coordinates stay bounded', () => {
    const report = uiReport(); const row = report.groupings.day[0]; if (!row) throw new Error('Missing synthetic day');
    row.knownPico = '999999999999999999999999999999999999'; render(<DayChart rows={[row]} tz="UTC" />);
    expect(screen.getByText(row.knownPico)).toBeTruthy();
    expect(document.querySelector('rect')?.getAttribute('height')).toBe('140');
    expect(document.querySelector('svg')?.getAttribute('viewBox')).not.toMatch(/Infinity|NaN/);
  });
});
