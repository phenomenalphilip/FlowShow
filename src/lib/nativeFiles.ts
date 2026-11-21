/**
 * Files on this computer, in the desktop app:
 *  - exports are saved in Documents\FlowShow\<kind> (and a notification says where)
 *  - media stays where it is: FlowShow keeps its path and the screens load it from disk
 */
import { isTauri } from './tauriScreen';

const invoke = async <T,>(cmd: string, args?: unknown, options?: { headers: Record<string, string> }): Promise<T> => {
  const { invoke: call } = await import('@tauri-apps/api/core');
  return call<T>(cmd, args as any, options);
};

/** Which Documents\FlowShow folder an export goes in */
export const exportFolderFor = (name: string) =>
  /\.flowshow-backup$/i.test(name) ? 'Backups'
  : /\.flowshow-songs$/i.test(name) ? 'Songs'
  : /\.fstemplates$/i.test(name) ? 'Templates'
  : /\.flowshow-profile$/i.test(name) ? 'Profiles'
  : 'Exports';

export interface SavedFile { path: string; name: string; folder: string }
export const FILE_SAVED_EVENT = 'flowshow-file-saved';

/** Save an export into Documents\FlowShow\<kind> and tell the app (it shows where). Returns the full path. */
export async function saveExport(blob: Blob, name: string): Promise<SavedFile> {
  const folder = exportFolderFor(name);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const path = await invoke<string>('save_export', bytes, { headers: { 'x-folder': folder, 'x-name': encodeURIComponent(name) } });
  const saved = { path, name: path.split(/[\\/]/).pop() || name, folder };
  window.dispatchEvent(new CustomEvent(FILE_SAVED_EVENT, { detail: saved }));
  return saved;
}

export async function revealFile(path: string): Promise<void> {
  await invoke('reveal_file', { path });
}

/** Choose a picture or video with the Windows dialog. Returns its path (nothing is copied), or null. */
export async function pickMediaFile(kind: 'image' | 'video' | 'media' = 'media'): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>('pick_media_file', { kind });
}

/** Choose a folder of pictures and videos with the Windows dialog (desktop app). Returns its path, or null. */
export async function pickMediaFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>('pick_media_folder');
}

export interface FolderEntry { name: string; path: string; dir: boolean; type?: 'image' | 'video'; size?: number; modified?: number }
/** A media folder's folders, pictures and videos (desktop app; folders first) */
export async function listMediaFolder(path: string): Promise<FolderEntry[]> {
  return invoke<FolderEntry[]>('list_media_folder', { path });
}

/** The address the screens load a file on this computer from */
export const mediaUrl = (path: string) => `http://media.localhost/${encodeURIComponent(path)}`;
/** A file's path back from its media address (or null if it isn't one) */
export const pathFromMediaUrl = (url?: string | null) =>
  url && url.startsWith('http://media.localhost/') ? decodeURIComponent(url.slice('http://media.localhost/'.length)) : null;

export const isVideoPath = (path: string) => /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(path);
export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() || path;
