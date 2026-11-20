/**
 * A backup of FlowShow's whole database: songs, projects, settings, profiles, templates, Bibles, installed fonts
 * and the small preferences kept in the browser. Folders added in the Media tab are links to this computer's
 * folders and can't be copied, so they are left out (add them again after restoring).
 */
import { clear, entries, set } from 'idb-keyval';
import { isTauri } from './tauriScreen';
import { saveExport } from './nativeFiles';

export const BACKUP_EXTENSION = '.flowshow-backup';
const FORMAT = 'flowshow-backup';
const NOT_COPIED = new Set(['media_folders']);

// Files kept in the database (stage pictures and videos…) can't be written as text directly: they are packed
// as base64 and unpacked again on restore
const BLOB_TAG = '__flowshowBlob';
async function pack(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { [BLOB_TAG]: btoa(bin), type: value.type, name: value instanceof File ? value.name : undefined };
  }
  if (Array.isArray(value)) return Promise.all(value.map(pack));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await pack(v);
    return out;
  }
  return value;
}
function unpack(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unpack);
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v[BLOB_TAG] === 'string') {
      const bin = atob(v[BLOB_TAG] as string);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: String(v.type || '') });
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpack(x)]));
  }
  return value;
}

export async function buildBackup(): Promise<Blob> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of await entries()) {
    if (typeof key === 'string' && !NOT_COPIED.has(key)) data[key] = await pack(value);
  }
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) local[k] = localStorage.getItem(k) || '';
  }
  return new Blob([JSON.stringify({ format: FORMAT, formatVersion: 1, createdAt: new Date().toISOString(), data, localStorage: local })], { type: 'application/json' });
}

/** Replace this FlowShow's database with a backup (the caller reloads the app afterwards) */
export async function restoreBackup(file: File): Promise<{ items: number }> {
  let backup: any;
  try { backup = JSON.parse(await file.text()); } catch { throw new Error(`“${file.name}” isn't a FlowShow backup.`); }
  if (backup?.format !== FORMAT || !backup.data || typeof backup.data !== 'object') throw new Error(`“${file.name}” isn't a FlowShow backup.`);
  await clear();
  const keys = Object.keys(backup.data);
  for (const key of keys) await set(key, unpack(backup.data[key]));
  Object.entries(backup.localStorage || {}).forEach(([k, v]) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } });
  return { items: keys.length };
}

/** Save a file to the computer: in the desktop app into Documents\FlowShow\<kind> (a notification says where);
 *  in a browser, as a download */
export async function downloadBlob(blob: Blob, name: string): Promise<string | null> {
  name = name.replace(/[\\/:*?"<>|]/g, '');
  if (isTauri()) return (await saveExport(blob, name)).path;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[\\/:*?"<>|]/g, '');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return null;
}
