import type { ExportFormat } from './workerProtocol';

const mime: Record<ExportFormat, string> = { json: 'application/json', csv: 'text/csv', md: 'text/markdown' };
/** Object URLs exist only for a user-requested download and are always revoked. */
export function downloadReport(text: string, format: ExportFormat): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime[format]};charset=utf-8` }));
  const link = document.createElement('a');
  try {
    link.href = url; link.download = `coding-usage-report.${format}`;
    document.body.append(link); link.click();
  } finally {
    link.remove();
    // Let the click consume its URL before releasing the Blob, including after component unmount.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
