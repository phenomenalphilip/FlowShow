/** Fonts installed into FlowShow (from template packages): kept in storage and registered in every window */
import { get, set } from 'idb-keyval';

export interface StoredFont { family: string; fileName: string; type: string; data: string /* base64 */ }

const KEY = 'flowshow_installed_fonts';
let installed: string[] = [];
const listeners = new Set<() => void>();
const registered = new Set<string>();

export const getInstalledFontFamilies = () => installed;
export function subscribeInstalledFonts(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const toBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function register(fonts: StoredFont[]) {
  for (const f of fonts) {
    const key = `${f.family}|${f.fileName}`;
    if (registered.has(key)) continue;
    try {
      const face = new FontFace(f.family, toBytes(f.data));
      await face.load();
      document.fonts.add(face);
      registered.add(key);
    } catch (err) {
      console.warn(`Font "${f.family}" could not be loaded`, err);
    }
  }
  installed = [...new Set((await get<StoredFont[]>(KEY) || []).map(f => f.family))].sort((a, b) => a.localeCompare(b));
  listeners.forEach(fn => fn());
}

/** Register every installed font in this window (call once when a window starts) */
export async function loadInstalledFonts(): Promise<void> {
  try { await register((await get<StoredFont[]>(KEY)) || []); } catch { /* storage blocked: nothing installed */ }
}

/** Install fonts (replacing ones with the same family and file name) */
export async function installFonts(fonts: StoredFont[]): Promise<void> {
  if (!fonts.length) return;
  const current = (await get<StoredFont[]>(KEY)) || [];
  const keep = current.filter(c => !fonts.some(f => f.family === c.family && f.fileName === c.fileName));
  await set(KEY, [...keep, ...fonts]);
  await register(fonts);
}
