import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import defaultPrices from '../../prices/prices.json?raw';
import { metricDefs } from '../core/metricDefs';
import type { MetricId } from '../core/metricDefs';
import { formatUsd } from '../core/money';
import type { SerializedReport } from '../core/serialize';
import { checkSizeBudget } from '../core/sizeBudget';
import { localTimeZone, validateFilters } from '../core/time';
import { downloadReport } from './download';
import { pickDirectory, prepareFiles, supportsFolderInput } from './picker';
import type { SourceChoice } from './picker';
import type { ExportFormat, WorkerRequest, WorkerResponse } from './workerProtocol';

export interface BrowserWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}
export interface AppProps { createWorker?: () => BrowserWorker; supported?: boolean }
type State = 'empty' | 'selected' | 'analyzing' | 'complete' | 'partial' | 'unsupported' | 'large-confirm' | 'cancelled' | 'error';
const tabs = ['Overview', 'Projects', 'Sessions', 'Models', 'Tools'] as const;
type Tab = typeof tabs[number];
const buckets = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'] as const;
type GroupRow = SerializedReport['groupings']['day'][number];
const makeWorker = (): BrowserWorker => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
function browserSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof File !== 'undefined' && typeof File.prototype.stream === 'function' &&
    typeof crypto !== 'undefined' && crypto.subtle !== undefined;
}
function display(value: string): string { return [...value].slice(0, 200).join(''); }
function countReasons(values: Record<string, number>): number { return Object.values(values).reduce((sum, value) => sum + value, 0); }

export function App({ createWorker = makeWorker, supported = browserSupported() }: AppProps) {
  const [state, setState] = useState<State>(supported ? 'empty' : 'unsupported');
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<SourceChoice>('auto');
  const [tz, setTz] = useState(localTimeZone);
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [fullPaths, setFullPaths] = useState(false);
  const [priceFile, setPriceFile] = useState<File>();
  const [report, setReport] = useState<SerializedReport>();
  const [tab, setTab] = useState<Tab>('Overview');
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const worker = useRef<BrowserWorker>();
  const generation = useRef(0);
  const directoryInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const pricesInput = useRef<HTMLInputElement>(null);
  const busy = state === 'analyzing';
  const bytes = files.reduce((sum, file) => sum + file.size, 0);

  function stopWorker(): void {
    generation.current += 1;
    worker.current?.terminate(); worker.current = undefined; setExporting(false);
  }
  useEffect(() => () => { generation.current += 1; worker.current?.terminate(); }, []);
  function invalidate(): void {
    stopWorker(); setReport(undefined); setNotice(''); setState(supported ? files.length > 0 ? 'selected' : 'empty' : 'unsupported');
  }
  function addFiles(selected: readonly File[]): void {
    if (!supported || selected.length === 0) return;
    stopWorker(); setReport(undefined); setFiles(previous => [...previous, ...selected]); setState('selected'); setNotice('');
  }
  function inputFiles(event: ChangeEvent<HTMLInputElement>): void {
    addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '';
  }
  async function chooseDirectory(): Promise<void> {
    const current = generation.current;
    const result = await pickDirectory(window as unknown as Parameters<typeof pickDirectory>[0]);
    if (current !== generation.current) return;
    if (result.kind === 'selected') { addFiles(result.files); if (result.files.length === 0) setNotice('The selected folder contains no files.'); }
    else if (result.kind === 'compatibility') {
      setNotice(result.reason);
      // Fall through automatically only to a supported folder input; individual files stay visible as the final fallback.
      if (directoryInput.current && supportsFolderInput(directoryInput.current)) directoryInput.current.click();
      else filesInput.current?.click();
    }
  }
  function clearSelection(next: 'empty' | 'cancelled'): void {
    stopWorker(); setFiles([]); setReport(undefined); setPriceFile(undefined); setNotice(''); setTab('Overview');
    if (directoryInput.current) directoryInput.current.value = '';
    if (filesInput.current) filesInput.current.value = '';
    if (pricesInput.current) pricesInput.current.value = '';
    setState(supported ? next : 'unsupported');
  }
  async function run(allowLarge = false): Promise<void> {
    if (!supported || files.length === 0 || busy) return;
    stopWorker(); setReport(undefined); setNotice('');
    try { validateFilters(tz, since || undefined, until || undefined); }
    catch { setState('error'); setNotice('Enter a valid IANA timezone and an ordered civil date range.'); return; }
    const decision = checkSizeBudget(bytes, allowLarge);
    if (decision.kind === 'confirmation_required') { setState('large-confirm'); return; }
    if (decision.kind === 'refused') { setState('error'); setNotice('Import refused: the selection exceeds 2,000 MB or contains an invalid file size.'); return; }
    setState('analyzing');
    const currentGeneration = generation.current;
    try {
      let priceTableText = defaultPrices;
      if (priceFile) {
        if (priceFile.size > 8_388_608) throw new Error('Price table too large');
        priceTableText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await priceFile.arrayBuffer());
      }
      if (currentGeneration !== generation.current) return;
      const active = createWorker(); worker.current = active;
      active.onmessage = event => {
        if (worker.current !== active || generation.current !== currentGeneration) return;
        const response = event.data;
        if (response.kind === 'complete') { setReport(response.report); setState(response.report.complete ? 'complete' : 'partial'); }
        else if (response.kind === 'export') {
          setExporting(false);
          try { downloadReport(response.text, response.format); }
          catch { setNotice('The browser could not save the download. Try exporting again.'); }
        } else { stopWorker(); setReport(undefined); setState('error'); setNotice(response.message); }
      };
      active.onerror = event => {
        event.preventDefault();
        if (worker.current !== active) return;
        stopWorker(); setReport(undefined); setState('error'); setNotice('The local analysis worker stopped. Reset or retry the import.');
      };
      active.postMessage({ kind: 'analyze', files: prepareFiles(files, source), options: {
        tz, ...(since ? { since } : {}), ...(until ? { until } : {}), fullPaths, allowLarge, priceTableText,
      } });
    } catch {
      if (currentGeneration !== generation.current) return;
      stopWorker(); setState('error'); setNotice('The local worker or price file is unavailable. Use a supported browser and a valid local price-table JSON file.');
    }
  }
  function exportReport(format: ExportFormat): void {
    if (!report || !worker.current || exporting) return;
    setExporting(true);
    try { worker.current.postMessage({ kind: 'export', format }); }
    catch { setExporting(false); setNotice('The export could not start. Run the import again.'); }
  }
  const stateLabel: Record<State, string> = {
    empty: 'Ready to import', selected: 'Files selected', analyzing: 'Analyzing locally', complete: 'Usage complete',
    partial: 'Partial usage', unsupported: 'Browser unsupported', 'large-confirm': 'Confirmation needed', cancelled: 'Import cancelled', error: 'Import error',
  };
  return <div className="app-shell">
    <aside className="sidebar" aria-label="Report navigation">
      <div className="brand"><span className="brand-mark" aria-hidden="true">∑</span><span>Usage Atlas<small>AI coding usage analyzer</small></span></div>
      <nav className="nav-tabs" aria-label="Report views">{tabs.map(name => <button key={name} type="button"
        className={`nav-tab${tab === name ? ' is-active' : ''}`} aria-current={tab === name ? 'page' : undefined}
        onClick={() => setTab(name)}>{name}</button>)}</nav>
      <p className="sidebar-note">Local transcripts. Exact accounting.<br />Your files stay in this browser session.</p>
    </aside>
    <main className="workspace">
      <header className="topbar"><div><p className="eyebrow">YOUR CODING WORKSPACE, ACCOUNTED FOR</p><h1 className="page-title">AI coding usage</h1>
        <p>Understand tokens, known costs and tool activity across Claude Code and Codex.</p></div>
        <span className={`status-pill ${state === 'complete' ? 'status-complete' : 'status-partial'}`} role="status">{stateLabel[state]}</span></header>
      <section className="import-card" aria-labelledby="import-heading">
        <div className="section-heading"><div><h2 id="import-heading">Import local transcripts</h2><p>Choose folders or JSONL files. You can add more than one selection before running.</p></div>
          <button className="secondary-button" type="button" onClick={() => clearSelection('empty')}>Reset</button></div>
        <div className="import-actions"><button className="secondary-button" type="button" disabled={!supported || busy} onClick={() => { void chooseDirectory(); }}>Choose folder</button>
          <button className="secondary-button" type="button" disabled={!supported || busy} onClick={() => directoryInput.current?.click()}>Compatibility folder</button>
          <button className="secondary-button" type="button" disabled={!supported || busy} onClick={() => filesInput.current?.click()}>Choose files</button>
          <label className="secondary-button">Local price table<input className="file-input" ref={pricesInput} type="file" accept=".json,application/json" aria-label="Local price table JSON" disabled={!supported || busy}
            onChange={event => { invalidate(); setPriceFile(event.currentTarget.files?.[0]); }} /></label></div>
        <input className="sr-only" ref={directoryInput} type="file" multiple aria-label="Compatibility transcript folder" tabIndex={-1}
          {...{ webkitdirectory: '', directory: '' }} onChange={inputFiles} />
        <input className="sr-only" ref={filesInput} type="file" accept=".jsonl,.zst" multiple aria-label="Transcript files" tabIndex={-1} onChange={inputFiles} />
        <div className="filter-grid">
          <label className="field">Transcript source<select aria-label="Transcript source" value={source} disabled={busy} onChange={event => { invalidate(); setSource(event.target.value as SourceChoice); }}>
            <option value="auto">Auto: folder / rollout name</option><option value="claude">Claude Code</option><option value="codex">Codex</option></select></label>
          <label className="field">Timezone<input aria-label="Timezone" value={tz} disabled={busy} placeholder="America/New_York" onChange={event => { invalidate(); setTz(event.target.value); }} /></label>
          <label className="field">Since (inclusive)<input type="date" aria-label="Since date" value={since} disabled={busy} onChange={event => { invalidate(); setSince(event.target.value); }} /></label>
          <label className="field">Until (inclusive)<input type="date" aria-label="Until date" value={until} disabled={busy} onChange={event => { invalidate(); setUntil(event.target.value); }} /></label>
        </div>
        <label className="checkbox-field"><input type="checkbox" checked={fullPaths} disabled={busy} onChange={event => { invalidate(); setFullPaths(event.target.checked); }} />Include full project paths in this report and its exports</label>
        <p className="selection-summary">{files.length} files selected · {bytes.toLocaleString('en-US')} bytes · {priceFile ? 'Local price table selected' : 'Default price table: no verified rates'}</p>
        <p className="metric-note">Auto recognizes Codex rollout filenames or a codex folder; select Codex explicitly for renamed files. Compressed archives are counted as unsupported. Dates use the selected timezone.</p>
        <div className="import-actions"><button className="primary-button" type="button" disabled={!supported || files.length === 0 || busy} onClick={() => { void run(); }}>Analyze files</button>
          {busy && <button className="danger-button" type="button" onClick={() => clearSelection('cancelled')}>Cancel import</button>}</div>
        {state === 'large-confirm' && <div className="notice notice-warning" role="alert"><h3>Large import</h3><p>This selection is over 500 MB. Processing may use substantial memory. The maximum is 2,000 MB.</p>
          <button className="primary-button" type="button" onClick={() => { void run(true); }}>Continue large import</button>
          <button className="secondary-button" type="button" onClick={() => clearSelection('cancelled')}>Cancel import</button></div>}
        {state === 'unsupported' && <p className="notice notice-warning" role="alert">This browser cannot analyze local files with a module worker and secure hashing. Open the app in a current top-level browser tab; folder and individual-file compatibility controls are available in supported browsers.</p>}
        {state === 'cancelled' && <p className="notice notice-info">Import cancelled. Selected files and the retained report have been cleared.</p>}
        {notice && <p className={`notice ${state === 'error' ? 'notice-error' : 'notice-info'}`} role={state === 'error' ? 'alert' : 'status'}>{notice}</p>}
      </section>
      {report ? <>
        <div className="report-meta"><p>Timezone: <strong>{report.metadata.tz}</strong> · {report.metadata.since ?? 'Beginning'} through {report.metadata.until ?? 'Latest'} · {report.metadata.filesRead} files read</p>
          <div className="export-actions" aria-label="Export report">{(['csv', 'json', 'md'] as const).map(format => <button className="secondary-button" key={format} disabled={exporting} type="button" onClick={() => exportReport(format)}>Export {format === 'md' ? 'Markdown' : format.toUpperCase()}</button>)}</div></div>
        {!report.complete && <p className="notice notice-warning" role="status">Partial usage: observed snapshots, observed epochs, unreadable data or unresolved usage may omit final usage. Review the panels below.</p>}
        <div className="metrics-grid">
          <Metric id="cost.known" value={formatUsd(BigInt(report.cost.knownPico))} note={`${report.cost.knownPico} pico-USD · known subtotal${report.cost.complete ? '' : ' · incomplete price coverage'}`} />
          <Metric id="tokens.input" value={report.tokens.input} /><Metric id="tokens.output" value={report.tokens.output} />
          <Metric id="cacheHit" value={report.cacheHit.display} note={`${report.cacheHit.numerator} / ${report.cacheHit.denominator}`} />
        </div>
        <section className="panel" aria-labelledby="view-heading"><div className="panel-heading"><h2 id="view-heading">{tab}</h2><span>{report.events.total} model calls · {report.events.byQuality.verified} verified</span></div>
          {tab === 'Overview' ? <Overview report={report} /> : tab === 'Tools' ? <Tools report={report} /> :
            <><GroupTable rows={report.groupings[tab === 'Projects' ? 'project' : tab === 'Sessions' ? 'session' : 'model']} caption={`${tab} usage in ${report.metadata.tz}`} />
              {tab === 'Sessions' && <div className="table-wrap"><table className="data-table"><caption>Session durations within filter</caption><thead><tr><th scope="col">Agent</th><th scope="col">Session</th><th scope="col">Duration (milliseconds)</th></tr></thead><tbody>
                {report.sessionDurations.map(row => <tr key={`${row.agent}:${row.sessionId}`}><td>{row.agent}</td><th scope="row">{display(row.sessionId)}</th><td>{row.durationMs}</td></tr>)}
                {report.sessionDurations.length === 0 && <tr><td colSpan={3}>No session timestamps in this selection.</td></tr>}</tbody></table></div>}</>}
        </section>
        <section className="panel recap" aria-labelledby="recap-heading"><h2 id="recap-heading">Checked recap</h2>
          {report.recapStatus.ok === true && report.recap ? <p>{report.recap.text}</p> : <p>{report.recapStatus.ok === false ? report.recapStatus.reason : 'Recap is unavailable.'}</p>}</section>
        <div className="diagnostic-grid">
          <section className="panel" aria-labelledby="unknown-heading"><h2 id="unknown-heading" title={metricDefs['cost.unknownEvents'].definition}>Unknown prices</h2><p>{report.cost.unknownPriceEvents.total} events · tokens remain included; unknown cost is omitted from the known subtotal.</p>
            <ReasonTable values={report.cost.unknownPriceEvents.byReason} caption="Unknown-price reasons" /><ReasonTable values={report.cost.unknownPriceEvents.byModel} caption="Unknown-priced models" />
            <dl className="definition-list">{buckets.map(bucket => <div key={bucket}><dt>{metricDefs[`tokens.${bucket}`].label}</dt><dd>{report.cost.unknownPriceTokens[bucket]}</dd></div>)}</dl></section>
          <section className="panel" aria-labelledby="unresolved-heading"><h2 id="unresolved-heading" title={metricDefs['unresolved.total'].definition}>Unresolved usage</h2><p>{countReasons(report.unresolved)} groups or steps excluded from every token total.</p>
            <ReasonTable values={report.unresolved} caption="Unresolved reasons" /></section>
          <section className="panel" aria-labelledby="diagnostics-heading"><h2 id="diagnostics-heading">Diagnostics</h2><ReasonTable values={report.skipped} caption="Skipped input" /><ReasonTable values={report.counters} caption="Diagnostic counters" />
            <details><summary>Source evidence (opaque file IDs)</summary><ul>{report.evidence.map((item, index) => <li key={`${item.sourceRef.fileId}:${item.sourceRef.line}:${index}`}>{item.category} · {item.code} · {item.sourceRef.fileId}:{item.sourceRef.line}</li>)}</ul></details></section>
        </div>
      </> : <section className="empty-state" aria-label="No report"><h2>{busy ? 'Reconciling your selected files…' : 'Your usage, with the details intact'}</h2>
        <p>{busy ? 'One local worker is reconciling usage across every selected file. You can cancel at any time.' : 'Add local transcripts to see exact token buckets, known costs, and a clear account of anything unresolved.'}</p></section>}
    </main>
  </div>;
}

function Metric({ id, value, note }: { id: MetricId; value: string; note?: string }) {
  return <article className="metric-card"><h3 className="metric-label" title={metricDefs[id].definition}>{metricDefs[id].label}</h3><p className="metric-value">{value}</p>{note && <p className="metric-note">{note}</p>}</article>;
}
function GroupTable({ rows, caption }: { rows: readonly GroupRow[]; caption: string }) {
  return <div className="table-wrap"><table className="data-table"><caption>{caption}</caption><thead><tr><th scope="col">Group</th>{buckets.map(bucket => <th scope="col" key={bucket} title={metricDefs[`tokens.${bucket}`].definition}>{metricDefs[`tokens.${bucket}`].label}</th>)}
    <th scope="col" title={metricDefs['cost.known'].definition}>Known pico-USD</th><th scope="col" title={metricDefs['events.total'].definition}>Calls</th><th scope="col" title={metricDefs['cost.unknownEvents'].definition}>Unknown price</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{display(row.label)}</th>{buckets.map(bucket => <td key={bucket}>{row.tokens[bucket]}</td>)}<td>{row.knownPico}</td><td>{row.events}</td><td>{row.unknownPriceEvents}</td></tr>)}
      {rows.length === 0 && <tr><td colSpan={9}>No usage in this selection.</td></tr>}</tbody></table></div>;
}
function ReasonTable({ values, caption }: { values: Record<string, number>; caption: string }) {
  return <div className="table-wrap"><table className="data-table"><caption>{caption}</caption><thead><tr><th scope="col">Reason / name</th><th scope="col">Count</th></tr></thead>
    <tbody>{Object.entries(values).map(([name, value]) => <tr key={name}><th scope="row">{display(name)}</th><td>{value}</td></tr>)}{Object.keys(values).length === 0 && <tr><td colSpan={2}>None</td></tr>}</tbody></table></div>;
}
function Overview({ report }: { report: SerializedReport }) {
  return <><DayChart rows={report.groupings.day} tz={report.metadata.tz} /><GroupTable rows={report.groupings.day} caption={`Daily usage in ${report.metadata.tz}`} />
    <div className="metrics-grid">{(['cacheRead', 'cacheWrite5m', 'cacheWrite1h'] as const).map(bucket => <Metric key={bucket} id={`tokens.${bucket}`} value={report.tokens[bucket]} />)}
      <Metric id="events.total" value={String(report.events.total)} note={`${report.events.byQuality.observed_snapshot} observed snapshots · ${report.events.byQuality.observed_epoch} observed epochs`} /></div>
    <dl className="definition-list"><div><dt>Known cost · verified</dt><dd>{report.cost.knownByQuality.verified} pico-USD</dd></div><div><dt>Known cost · observed snapshots</dt><dd>{report.cost.knownByQuality.observed_snapshot} pico-USD</dd></div><div><dt>Known cost · observed epochs</dt><dd>{report.cost.knownByQuality.observed_epoch} pico-USD</dd></div></dl>
    <GroupTable rows={report.groupings.agent} caption="Usage by agent" /></>;
}
function Tools({ report }: { report: SerializedReport }) {
  return <><div className="metrics-grid"><Metric id="tools.total" value={String(report.tools.total)} /><Metric id="claude.retries" value={String(report.retries)} /><Metric id="claude.errorRate" value={report.errorRate.claude.display} note={report.errorRate.claude.coverage} /><Metric id="codex.errorRate" value={report.errorRate.codex} /></div>
    <ReasonTable values={report.tools.byName} caption="Tool calls by name" /><ReasonTable values={report.tools.byMcpServer} caption="MCP server calls" />
    <dl className="definition-list"><div><dt title={metricDefs['turns.claude'].definition}>Claude turns</dt><dd>{report.turns.claude}</dd></div><div><dt title={metricDefs['turns.codex'].definition}>Codex turns</dt><dd>{report.turns.codex}</dd></div><div><dt>Explicit result statuses (Claude)</dt><dd>{report.toolResults.ok} success · {report.toolResults.error} error · {report.toolResults.unknown} unknown</dd></div><div><dt title={metricDefs['retry.ambiguous'].definition}>Ambiguous retry order</dt><dd>{report.retryAmbiguous}</dd></div><div><dt title={metricDefs['codex.retries'].definition}>Codex retries</dt><dd>{report.codexRetries}</dd></div></dl></>;
}
/** Only bounded chart coordinates use Number; exact monetary labels remain decimal strings. */
export function DayChart({ rows, tz }: { rows: readonly GroupRow[]; tz: string }) {
  const shown = rows.slice(0, 60);
  const maximum = shown.reduce((max, row) => BigInt(row.knownPico) > max ? BigInt(row.knownPico) : max, 0n);
  const width = Math.max(400, shown.length * 76);
  return <figure className="chart"><figcaption>Daily known cost · {tz}{rows.length > 60 ? ' · first sixty days; every day is in the table' : ''}</figcaption>
    {shown.length === 0 ? <p>No daily values to chart.</p> : <svg className="day-chart" viewBox={`0 0 ${width} 240`} role="img" aria-label={`Known cost per day in ${tz}; exact pico-USD values appear above each bar`}>
      <line className="chart-axis" x1="0" x2={width} y1="190" y2="190" />{shown.map((row, index) => {
        const height = maximum === 0n ? 0 : Number(BigInt(row.knownPico) * 140n / maximum);
        const x = index * 76 + 12;
        return <g key={row.key}><title>{row.label}: {row.knownPico} pico-USD; {row.unknownPriceEvents} unknown-price events</title>
          <rect className="chart-bar" x={x} y={190 - height} width="40" height={height} />
          <text className="chart-value" x={x + 20} y={180 - height} textAnchor="middle">{row.knownPico}</text>
          <text className="chart-label" x={x + 20} y="215" textAnchor="middle">{row.label}</text></g>;
      })}</svg>}
    <p className="metric-note">Bars show the known subtotal only. Unknown prices are omitted and counted separately; the table retains every exact token bucket.</p></figure>;
}
