import type { Agent } from '../core/types';
import type { SelectedFile } from './workerProtocol';

export type SourceChoice = 'auto' | Agent;
interface DirectoryHandle {
  kind: 'directory'; name: string;
  values(): AsyncIterable<DirectoryHandle | { kind: 'file'; name: string; getFile(): Promise<File> }>;
}
interface DirectoryPickerHost { showDirectoryPicker?: () => Promise<DirectoryHandle> }
export type PickResult = { kind: 'selected'; files: File[] } | { kind: 'cancelled' } |
  { kind: 'compatibility'; reason: string };

/** Never follows filesystem links: the browser supplies only handles granted by the user. */
export async function pickDirectory(host: DirectoryPickerHost): Promise<PickResult> {
  if (!host.showDirectoryPicker) return { kind: 'compatibility', reason: 'Use the compatibility folder or files picker in this browser.' };
  try {
    const root = await host.showDirectoryPicker();
    const files: File[] = [];
    const pending: { directory: DirectoryHandle; prefix: string }[] = [{ directory: root, prefix: root.name }];
    while (pending.length > 0) {
      const item = pending.pop();
      if (!item) break;
      for await (const handle of item.directory.values()) {
        const path = `${item.prefix}/${handle.name}`;
        if (handle.kind === 'directory') pending.push({ directory: handle, prefix: path });
        else {
          const file = await handle.getFile();
          // Browser File objects from handles omit webkitRelativePath; keep it outside serialized reports.
          handlePaths.set(file, path); files.push(file);
        }
      }
    }
    return { kind: 'selected', files };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return { kind: 'cancelled' };
    // SecurityError is common in embedded frames; a visible compatibility choice remains available.
    return { kind: 'compatibility', reason: 'Folder access is unavailable here. Choose a compatibility folder or individual files.' };
  }
}
const handlePaths = new WeakMap<File, string>();
export function prepareFiles(files: readonly File[], source: SourceChoice): SelectedFile[] {
  return files.map((file, index) => {
    const relativePath = handlePaths.get(file) ?? file.webkitRelativePath ?? file.name;
    const path = relativePath || file.name;
    const agent: Agent = source !== 'auto' ? source : /(?:^|[\\/])codex(?:[\\/]|$)|^rollout-/i.test(path) || /^rollout-/i.test(file.name) ? 'codex' : 'claude';
    return { file, fileId: `f${index + 1}`, relativePath: path, agent };
  });
}
export function supportsFolderInput(input: HTMLInputElement): boolean { return 'webkitdirectory' in input; }
