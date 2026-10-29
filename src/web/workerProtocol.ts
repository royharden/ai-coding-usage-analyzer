import type { AnalyzeOptions } from '../core/analyze';
import type { SerializedReport } from '../core/serialize';
import type { Agent } from '../core/types';

export interface SelectedFile { file: File; fileId: string; relativePath: string; agent: Agent }
export type ExportFormat = 'json' | 'csv' | 'md';
export type WorkerRequest = { kind: 'analyze'; files: SelectedFile[]; options: AnalyzeOptions } |
  { kind: 'export'; format: ExportFormat };
export type WorkerResponse = { kind: 'complete'; report: SerializedReport } |
  { kind: 'export'; format: ExportFormat; text: string } |
  { kind: 'error'; message: string };
