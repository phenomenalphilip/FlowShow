/**
 * A backup of FlowShow's whole database: songs, projects, settings, profiles, templates, Bibles, installed fonts
 * and the small preferences kept in the browser. Folders added in the Media tab are links to this computer's
 * folders and can't be copied, so they are left out (add them again after restoring).
 */
import { clear, entries, set } from 'idb-keyval';

export const BACKUP_EXTENSION = '.flowshow-backup';
const FORMAT = 'flowshow-backup';
const NOT_COPIED = new Set(['media_folders']);

export async function buildBackup(): Promise<Blob> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of await entries()) {
    if (typeof key === 'string' && !NOT_COPIED.has(key)) data[key] = value;
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
  for (const key of keys) await set(key, backup.data[key]);
  Object.entries(backup.localStorage || {}).forEach(([k, v]) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } });
  return { items: keys.length };
}

/** Save a file to the computer (Downloads, or where the browser asks) */
export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[\\/:*?"<>|]/g, '');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
