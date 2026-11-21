/**
 * Playback videos: videos tagged "Playback" (one by one, or a whole folder) play once, with sound, when started
 * from the Media tab or a setlist. Every other video is a background: silent and looping.
 *
 * Sound comes from one place only: this computer's sound output, played by FlowShow's main window (the playback bar
 * under the output monitors). Every screen shows the video silently and follows that player's time, so a second
 * video, or the same video on several screens, can never send sound. When it ends it fades back to each
 * screen's default background.
 */
import React, { useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import { Pause, Play, Repeat, RotateCcw, Volume2, VolumeX } from 'lucide-react';

// ─── Tags ───

export type VideoTag = 'playback' | 'background';
export interface MediaTags {
  /** By video (its key, see mediaKey) */
  files: Record<string, VideoTag>;
  /** By folder: every video inside (and in folders inside it) unless the video, or a closer folder, says otherwise */
  folders: Record<string, VideoTag>;
}
const TAGS_KEY = 'media_tags';
let tags: MediaTags = { files: {}, folders: {} };
const listeners = new Set<(t: MediaTags) => void>();
void get(TAGS_KEY).then((saved) => {
  if (saved && typeof saved === 'object') { tags = { files: { ...(saved as MediaTags).files }, folders: { ...(saved as MediaTags).folders } }; listeners.forEach(fn => fn(tags)); }
}).catch(() => {});

type MediaLike = { path?: string; ref?: { folder: string; path: string[] }; place?: string; url?: string };
/** A video's key: its path on this computer, else where it is in an added folder, else its address */
export const mediaKey = (m: MediaLike) =>
  m.path ? m.path.toLowerCase() : m.ref ? `ref:${m.ref.folder}/${m.ref.path.join('/')}` : m.place ? m.place : `url:${m.url || ''}`;
/** A folder's key: its path on this computer, or where it is in an added folder (browser) */
export const folderKey = (f: { path?: string; folder?: string; dirs?: string[] }) =>
  f.path ? f.path.replace(/[\\/]+$/, '').toLowerCase() : `ref:${f.folder}${(f.dirs || []).map(d => '/' + d).join('')}`;

/** Whether a video is a playback video (its own tag first, then the closest tagged folder) */
export function isPlayback(m: MediaLike, t: MediaTags = tags): boolean {
  const key = mediaKey(m);
  const own = t.files[key];
  if (own) return own === 'playback';
  let best: { len: number; tag: VideoTag } | null = null;
  for (const [folder, tag] of Object.entries(t.folders)) {
    if ((key.startsWith(folder + '\\') || key.startsWith(folder + '/')) && (!best || folder.length > best.len)) best = { len: folder.length, tag };
  }
  return best?.tag === 'playback';
}
/** The tag set on a folder itself (not inherited) */
export const folderTag = (key: string, t: MediaTags = tags): VideoTag | undefined => t.folders[key];

function save(next: MediaTags) {
  tags = next;
  listeners.forEach(fn => fn(tags));
  void set(TAGS_KEY, tags).catch(() => {});
}
export function tagVideo(m: MediaLike, tag: VideoTag) {
  save({ ...tags, files: { ...tags.files, [mediaKey(m)]: tag } });
}
export function tagFolder(key: string, tag: VideoTag | null) {
  const folders = { ...tags.folders };
  if (tag) folders[key] = tag; else delete folders[key];
  // Videos inside lose their own tags, so the folder's choice applies to all of them
  const files = Object.fromEntries(Object.entries(tags.files).filter(([k]) => !(k.startsWith(key + '\\') || k.startsWith(key + '/'))));
  save({ files, folders });
}
export function useMediaTags(): MediaTags {
  const [t, setT] = useState(tags);
  useEffect(() => { listeners.add(setT); setT(tags); return () => { listeners.delete(setT); }; }, []);
  return t;
}

// ─── Keeping every screen with the player ───

const CHANNEL = 'flowshow_playback';
/** offset: seconds the screens' picture runs ahead of the sound (Lip sync: projectors and TVs show the picture late) */
interface PlaybackSync { kind: 'playback-sync'; url: string; time: number; playing: boolean; loop: boolean; at: number; offset?: number }

/**
 * A screen's video follows the playback player (time, play/pause, loop); it never plays sound itself.
 * It stays with the sound all the time: small differences are caught up by playing a little faster or slower
 * (unnoticeable), and only a big one jumps.
 */
export function usePlaybackFollower(ref: React.RefObject<HTMLVideoElement | null>, url: string | null) {
  useEffect(() => {
    if (!url || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e: MessageEvent<PlaybackSync>) => {
      const s = e.data;
      const v = ref.current;
      if (!v || s?.kind !== 'playback-sync' || s.url !== url) return;
      v.loop = s.loop;
      const target = s.time + (s.playing ? (Date.now() - s.at) / 1000 : 0) + (s.offset || 0);
      if (!Number.isFinite(target)) return;
      const diff = target - v.currentTime;
      if (!s.playing) {
        if (Math.abs(diff) > 0.04) v.currentTime = Math.max(0, target);
        v.playbackRate = 1;
      } else if (Math.abs(diff) > 0.7 || v.paused) {
        // Far off (or starting): jump, a little ahead, since the jump itself takes a moment
        v.currentTime = Math.max(0, target + 0.08);
        v.playbackRate = 1;
      } else if (Math.abs(diff) > 0.02) {
        v.playbackRate = Math.min(1.1, Math.max(0.9, 1 + diff * 0.6));
      } else {
        v.playbackRate = 1;
      }
      if (s.playing && v.paused) v.play().catch(() => {});
      if (!s.playing && !v.paused) v.pause();
    };
    return () => ch.close();
  }, [ref, url]);
}

// ─── The player (with sound) and its controls ───

const clock = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
export const PLAYBACK_TOGGLE_EVENT = 'flowshow-playback-toggle';

/**
 * The playback video's sound and controls, under the output monitors. Its hidden player is the only one with sound;
 * the screens follow it. `onEnded`: the video finished (not looping): fade back to the default backgrounds.
 */
export function PlaybackBar({ url, name, onEnded, onStop }: { url: string; name: string; onEnded: () => void; onStop: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(() => { try { return Number(localStorage.getItem('fs-playback-volume') ?? 1); } catch { return 1; } });
  const [muted, setMuted] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [showVolume, setShowVolume] = useState(false);
  // Lip sync (ms): how much earlier the screens show the picture than the sound plays (for projectors and TVs that
  // show the picture late). Remembered on this computer.
  const [lipSync, setLipSync] = useState(() => { try { return Number(localStorage.getItem('fs-playback-lipsync') ?? 0) || 0; } catch { return 0; } });
  const lipSyncRef = useRef(lipSync);
  lipSyncRef.current = lipSync;
  useEffect(() => { try { localStorage.setItem('fs-playback-lipsync', String(lipSync)); } catch { /* fine */ } }, [lipSync]);
  const chRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    chRef.current = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
    return () => { chRef.current?.close(); chRef.current = null; };
  }, []);
  const tell = () => {
    const v = ref.current;
    if (!v) return;
    chRef.current?.postMessage({ kind: 'playback-sync', url, time: v.currentTime, playing: !v.paused && !v.ended, loop: v.loop, at: Date.now(), offset: lipSyncRef.current / 1000 } as PlaybackSync);
  };
  // Keep the screens in step (often, so they stay close to the sound, and to catch a window that opens late)
  useEffect(() => {
    const id = window.setInterval(tell, 250);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  useEffect(() => { const v = ref.current; if (v) { v.volume = volume; v.muted = muted; } try { localStorage.setItem('fs-playback-volume', String(volume)); } catch { /* fine */ } }, [volume, muted]);
  useEffect(() => { const v = ref.current; if (v) { v.loop = loop; tell(); } }, [loop]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused || v.ended) v.play().catch(() => {}); else v.pause();
  };
  useEffect(() => {
    const onToggle = () => toggle();
    window.addEventListener(PLAYBACK_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(PLAYBACK_TOGGLE_EVENT, onToggle);
  });
  const seek = (s: number) => { const v = ref.current; if (v) { const to = Math.max(0, Math.min(s, v.duration || s)); v.currentTime = to; setTime(to); tell(); } };
  // Dragging the time bar: the bar follows the mouse; letting go jumps there. (The browser sends one more change
  // after the mouse is let go: it must not start a new drag, or the bar would stay where the drag began.)
  const dragging = useRef(false);
  const lastScrub = useRef(0);
  const startScrub = () => {
    dragging.current = true;
    window.addEventListener('pointerup', () => { dragging.current = false; seek(lastScrub.current); setScrub(null); }, { once: true });
  };

  const shown = scrub ?? time;
  const btn = 'p-1.5 rounded text-neutral-300 hover:text-white hover:bg-white/10 transition-colors';
  return (
    <div className="px-3 py-2 border-b border-[#262635] bg-[#0d0d12] shrink-0" data-playback-bar>
      <video
        ref={ref}
        src={url}
        autoPlay
        playsInline
        className="hidden"
        onPlay={() => { setPlaying(true); tell(); }}
        onPause={() => { setPlaying(false); tell(); }}
        onSeeked={tell}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); e.currentTarget.volume = volume; e.currentTarget.muted = muted; tell(); }}
        onEnded={() => { setPlaying(false); if (!loop) onEnded(); }}
        data-playback-player
      />
      {/* The video's name on its own line (like FreeShow), with Stop */}
      <div className="relative flex items-center justify-center mb-1 min-w-0 h-5">
        <span className="absolute left-0 px-1 py-0.5 rounded bg-pink-600/20 text-pink-300 text-[8px] font-bold tracking-wider" title="Plays once, with sound">PLAYBACK</span>
        <span className="text-sm text-neutral-100 truncate px-16" title={name} data-playback-name>{name}</span>
        <button type="button" onClick={onStop} className="absolute right-0 text-[10px] text-neutral-500 hover:text-white" title="Stop (fades back to the default background)" data-playback-stop>Stop</button>
      </div>
      {/* The time bar, the full width of the panel */}
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-mono tabular-nums text-pink-300 shrink-0" data-playback-time>{clock(shown)}</span>
        <input
          type="range" min={0} max={duration || 0} step={0.1} value={Math.min(shown, duration || 0)}
          onPointerDown={startScrub}
          onChange={(e) => { const v = Number(e.target.value); lastScrub.current = v; if (dragging.current) setScrub(v); else seek(v); }}
          className="flex-1 min-w-[60px] mx-1 accent-pink-500 cursor-pointer"
          title="Drag to jump through the video"
          data-playback-seek
        />
        <span className="text-[11px] font-mono tabular-nums text-pink-300 shrink-0" data-playback-duration>{clock(duration)}</span>
      </div>
      {/* The buttons, centred underneath */}
      <div className="flex items-center justify-center gap-2 mt-0.5">
        <button type="button" onClick={() => seek(0)} className={btn} title="Start again"><RotateCcw size={14} /></button>
        <button type="button" onClick={toggle} className="p-1.5 rounded-full bg-pink-600 hover:bg-pink-500 text-white transition-colors" title={playing ? 'Pause (K)' : 'Play (K)'} data-playback-toggle>
          {playing ? <Pause size={15} className="fill-current" /> : <Play size={15} className="fill-current" />}
        </button>
        <button type="button" onClick={() => setLoop(l => !l)} className={`${btn} ${loop ? '!text-pink-400 bg-pink-500/15' : ''}`} title={loop ? 'Loop is on' : 'Loop (play again at the end)'} data-playback-loop><Repeat size={14} /></button>
        {/* Volume: the speaker opens a small slider (with mute) */}
        <div className="relative shrink-0">
          <button type="button" onClick={() => setShowVolume(v => !v)} className={`${btn} ${showVolume ? 'bg-white/10' : ''}`} title={`Volume ${Math.round((muted ? 0 : volume) * 100)}% (this computer's sound output)`} data-playback-volume-button>
            {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          {showVolume && (
            <div className="absolute right-0 top-full mt-1 z-50 px-2 py-2 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl space-y-2" onPointerLeave={() => setShowVolume(false)} data-playback-volume-pop>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setMuted(m => !m)} className={btn} title={muted ? 'Unmute' : 'Mute'} data-playback-mute>
                  {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="w-24 accent-pink-500 cursor-pointer" data-playback-volume />
                <span className="text-[10px] font-mono text-neutral-400 w-8 text-right">{Math.round((muted ? 0 : volume) * 100)}%</span>
              </div>
              {/* Lip sync: if the sound comes before the picture on the screens, move it right */}
              <div className="border-t border-white/5 pt-2" title="If the sound comes before the picture on the screens (projectors and TVs often show the picture late), move this right until they match. Remembered on this computer.">
                <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-0.5">
                  <span>Lip sync</span>
                  <button type="button" onClick={() => setLipSync(0)} className="font-mono text-neutral-300 hover:text-white" title="Back to 0" data-playback-lipsync-value>
                    {lipSync === 0 ? '0 ms' : `${lipSync > 0 ? 'picture ' : 'sound '}${Math.abs(lipSync)} ms earlier`}
                  </button>
                </div>
                <input type="range" min={-300} max={500} step={10} value={lipSync} onChange={(e) => setLipSync(Number(e.target.value))} className="w-[190px] accent-pink-500 cursor-pointer" data-playback-lipsync />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
