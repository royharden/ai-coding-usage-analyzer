import { analyze } from '../core/analyze';
import { toCsv } from '../core/exports/csv';
import { toJson } from '../core/exports/json';
import { toMarkdown } from '../core/exports/md';
import { serializeReport } from '../core/serialize';
import type { Report } from '../core/types';
import { createBrowserPlatform } from './platform';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

// A minimal worker surface avoids combining DOM and WebWorker lib declarations.
const scope = globalThis as unknown as {
  crypto: Crypto; onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};
let retainedReport: Report | undefined;
let busy = false;
async function* readFile(file: File): AsyncGenerator<Uint8Array> {
  const reader = file.stream().getReader();
  try {
    while (true) { const next = await reader.read(); if (next.done) break; yield next.value; }
  } finally { reader.releaseLock(); }
}
scope.onmessage = event => { void handle(event.data); };
async function handle(request: WorkerRequest): Promise<void> {
  if (busy) return;
  if (request.kind === 'export') {
    if (!retainedReport) { scope.postMessage({ kind: 'error', message: 'Run an import before exporting.' }); return; }
    try {
      const text = request.format === 'csv' ? toCsv(retainedReport) : request.format === 'md' ? toMarkdown(retainedReport) : toJson(retainedReport);
      scope.postMessage({ kind: 'export', format: request.format, text });
    } catch { scope.postMessage({ kind: 'error', message: 'The report could not be exported. Run the import again.' }); }
    return;
  }
  busy = true; retainedReport = undefined;
  try {
    // One worker owns every file in the import, so reconciliation is global across file boundaries.
    const report = await analyze(request.files.map(item => ({
      agent: item.agent, fileId: item.fileId, name: item.file.name, relativePath: item.relativePath,
      size: item.file.size, read: () => readFile(item.file),
    })), request.options, createBrowserPlatform(scope.crypto.subtle));
    retainedReport = report;
    scope.postMessage({ kind: 'complete', report: serializeReport(report) });
  } catch {
    // Never send parser exceptions, filenames or raw imported text across the worker boundary.
    retainedReport = undefined;
    scope.postMessage({ kind: 'error', message: 'Import failed. Check the timezone, civil date range, local price table and file-size limits.' });
  } finally { busy = false; }
}
