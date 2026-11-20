/**
 * Pictures and videos placed on a slide design or a template, in a box that can be moved and resized anywhere.
 * In the desktop app the file stays where it is on the computer (FlowShow keeps its path);
 * in the browser it is kept in the app's local database (like stage media).
 */
import React from 'react';
import { motion } from 'motion/react';
import { Image as ImageIcon, Maximize2, RefreshCw, Trash2 } from 'lucide-react';
import { isTauri } from './tauriScreen';
import { fileNameOf, isVideoPath, mediaUrl, pickMediaFile } from './nativeFiles';
import { saveStageMedia, useStageMediaUrl } from './stageMedia';

export type MediaRect = { x: number; y: number; width: number; height: number };

export interface DesignMedia {
  id: string;
  type: 'image' | 'video';
  name: string;
  /** The file on this computer (desktop app) */
  path?: string;
  /** Kept in the app's database (browser), when there is no path */
  storedId?: string;
  layout: MediaRect;
  /** 0–100 (default 100) */
  opacity?: number;
  /** cover = fill the box (may crop), contain = fit inside it */
  fit?: 'cover' | 'contain';
  /** Newly added to a slide: not on the screens until its slide goes live (Go live) */
  waiting?: boolean;
}

/** Where new media goes: a box in the middle, not the whole screen */
export const NEW_MEDIA_LAYOUT: MediaRect = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };
export const FULL_SCREEN: MediaRect = { x: 0, y: 0, width: 1, height: 1 };

type PickedFile = Pick<DesignMedia, 'type' | 'name' | 'path' | 'storedId'>;

/** Browser: choose a file with a (hidden) file input */
const pickInBrowser = () => new Promise<File | null>((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*';
  input.style.display = 'none';
  input.setAttribute('data-design-media-input', '');
  let done = false;
  const finish = (file: File | null) => { if (done) return; done = true; input.remove(); resolve(file); };
  input.addEventListener('change', () => finish(input.files?.[0] || null));
  input.addEventListener('cancel', () => finish(null));
  document.body.appendChild(input);
  input.click();
});

/** Ask for a picture or video. Null if none was chosen. */
export async function chooseDesignMediaFile(): Promise<PickedFile | null> {
  if (isTauri()) {
    const path = await pickMediaFile('media').catch(() => null);
    if (!path) return null;
    return { type: isVideoPath(path) ? 'video' : 'image', name: fileNameOf(path), path };
  }
  const file = await pickInBrowser();
  if (!file) return null;
  const stored = await saveStageMedia(file);
  return { type: stored.type, name: stored.name, storedId: stored.id };
}

export const newDesignMedia = (file: PickedFile): DesignMedia => ({
  id: `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  ...file,
  layout: { ...NEW_MEDIA_LAYOUT },
  opacity: 100,
  fit: 'cover',
});

const pct = (v: number) => `${v * 100}%`;

function MediaItem({ item, faded }: { item: DesignMedia; faded?: boolean }) {
  const stored = useStageMediaUrl(item.path ? undefined : item.storedId);
  const url = item.path ? mediaUrl(item.path) : stored;
  if (!url) return null;
  const style: React.CSSProperties = {
    left: pct(item.layout.x), top: pct(item.layout.y), width: pct(item.layout.width), height: pct(item.layout.height),
    opacity: (Math.min(100, Math.max(0, item.opacity ?? 100)) / 100) * (faded ? 0.3 : 1),
    objectFit: item.fit || 'cover',
  };
  return item.type === 'video'
    ? <video src={url} className="absolute pointer-events-none" style={style} autoPlay loop muted playsInline data-design-media={item.id} />
    : <img src={url} className="absolute pointer-events-none" style={style} alt="" draggable={false} data-design-media={item.id} />;
}

/**
 * The media of a design or template, drawn above the background and under the words.
 * It belongs with the words: clearing the text (or Clear all) fades it out with them; clearing the background doesn't.
 */
export function DesignMediaLayer({ items, preview = false, cleared = false, fadeSeconds = 0.6 }: {
  items: DesignMedia[] | undefined;
  preview?: boolean;
  /** The words are cleared: the media fades out with them */
  cleared?: boolean;
  fadeSeconds?: number;
}) {
  const shown = items?.filter(m => preview || !m.waiting);
  if (!shown?.length) return null;
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
      initial={false}
      animate={{ opacity: cleared ? 0 : 1 }}
      transition={{ duration: cleared ? fadeSeconds : 0.35, ease: 'easeOut' }}
      data-design-media-layer
      data-cleared={cleared ? '' : undefined}
    >
      {shown.map(m => <React.Fragment key={m.id}><MediaItem item={m} faded={m.waiting} /></React.Fragment>)}
    </motion.div>
  );
}

const btn = 'px-2 py-1 rounded-md text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-neutral-200 flex items-center gap-1 shrink-0';

/** The row of settings for the picked media box */
export function DesignMediaControls({ item, onChange, onReplace, onRemove }: {
  item: DesignMedia;
  /** phase 'draft' while a slider moves, 'commit' when it is let go */
  onChange: (patch: Partial<DesignMedia>, phase?: 'draft' | 'commit') => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const isFull = item.layout.x === 0 && item.layout.y === 0 && item.layout.width === 1 && item.layout.height === 1;
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-300" data-design-media-controls>
      <span className="flex items-center gap-1 text-neutral-400 max-w-[180px] truncate" title={item.path || item.name}>
        <ImageIcon size={12} className="shrink-0" /> <span className="truncate">{item.name}</span>
      </span>
      <label className="flex items-center gap-1.5" title="How see-through the picture or video is">
        Opacity
        <input
          type="range" min={0} max={100} step={1}
          value={item.opacity ?? 100}
          onChange={(e) => onChange({ opacity: Number(e.target.value) }, 'draft')}
          onPointerUp={(e) => onChange({ opacity: Number((e.target as HTMLInputElement).value) }, 'commit')}
          onKeyUp={(e) => onChange({ opacity: Number((e.target as HTMLInputElement).value) }, 'commit')}
          className="w-24 accent-pink-500"
          data-design-media-opacity
        />
        <span className="w-8 tabular-nums text-neutral-400">{item.opacity ?? 100}%</span>
      </label>
      <div className="flex rounded-md overflow-hidden border border-white/10" title="Fill crops the picture to fill the box; Fit shows all of it">
        {(['cover', 'contain'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => onChange({ fit: f })}
            className={`px-2 py-1 text-[11px] font-semibold ${(item.fit || 'cover') === f ? 'bg-pink-600 text-white' : 'bg-white/5 text-neutral-300 hover:bg-white/10'}`}
            data-design-media-fit={f}
          >
            {f === 'cover' ? 'Fill' : 'Fit'}
          </button>
        ))}
      </div>
      <button type="button" className={btn} onClick={() => onChange({ layout: isFull ? { ...NEW_MEDIA_LAYOUT } : { ...FULL_SCREEN } })} data-design-media-full title={isFull ? 'Make it a smaller box again' : 'Make it cover the whole screen'}>
        <Maximize2 size={11} /> {isFull ? 'Smaller' : 'Full screen'}
      </button>
      <button type="button" className={btn} onClick={onReplace} data-design-media-replace title="Use a different picture or video in this box">
        <RefreshCw size={11} /> Replace…
      </button>
      <button type="button" className={`${btn} text-red-300`} onClick={onRemove} data-design-media-remove>
        <Trash2 size={11} /> Remove
      </button>
    </div>
  );
}
