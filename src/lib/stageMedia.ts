/**
 * Pictures and videos placed on stage layouts.
 * The file itself is kept in the app's local database (so it survives restarts and is included in backups);
 * the layout only keeps its id. Every window (the designer, each stage screen) loads it from there.
 */
import { useEffect, useState } from 'react';
import { get, set, del } from 'idb-keyval';

export interface StageMediaRef {
  id: string;
  type: 'image' | 'video';
  name: string;
}

const KEY = (id: string) => `stage_media_${id}`;
const urls = new Map<string, string>();
const loading = new Map<string, Promise<string | null>>();

/** Keep a chosen file for use on stage layouts */
export async function saveStageMedia(file: File): Promise<StageMediaRef> {
  const type: StageMediaRef['type'] = file.type.startsWith('video/') ? 'video' : 'image';
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await set(KEY(id), { name: file.name, type, mime: file.type, data: file });
  return { id, type, name: file.name };
}

export async function deleteStageMedia(id: string): Promise<void> {
  await del(KEY(id));
  const url = urls.get(id);
  if (url) { URL.revokeObjectURL(url); urls.delete(id); }
}

/** A URL for the media in this window, or null if it's gone */
export function stageMediaUrl(id: string): Promise<string | null> {
  if (urls.has(id)) return Promise.resolve(urls.get(id)!);
  if (!loading.has(id)) {
    loading.set(id, get(KEY(id)).then((rec: { data: Blob; mime?: string } | undefined) => {
      if (!rec?.data) return null;
      const blob = rec.data instanceof Blob ? rec.data : new Blob([rec.data as BlobPart], { type: rec.mime });
      const url = URL.createObjectURL(blob);
      urls.set(id, url);
      return url;
    }).catch(() => null));
  }
  return loading.get(id)!;
}

/** The media's URL if this window has already loaded it (no waiting) */
export const cachedStageMediaUrl = (id: string): string | null => urls.get(id) ?? null;

/** React: the media's URL once loaded */
export function useStageMediaUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(id ? urls.get(id) ?? null : null);
  useEffect(() => {
    let alive = true;
    if (!id) { setUrl(null); return; }
    stageMediaUrl(id).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id]);
  return url;
}
