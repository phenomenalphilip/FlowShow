/**
 * Live inputs: cameras and capture cards, this computer's screens, and NDI sources on the network.
 *
 * - Cameras (webcams, capture cards, OBS Virtual Camera, NDI Webcam…) are opened by each window itself.
 *   The desktop app allows this without asking.
 * - Screens and NDI sources are read by FlowShow (src-tauri/src/live.rs) and streamed to every window
 *   that shows them, from an address of their own on this computer.
 */
import React, { useEffect, useRef, useState } from 'react';
import { isTauri } from './tauriScreen';

export type LiveInputKind = 'camera' | 'screen' | 'ndi';
export interface LiveInput {
  kind: LiveInputKind;
  /** Camera: its device id. Screen: \\.\DISPLAY1… NDI: the source's full name, "COMPUTER (Source)" */
  id: string;
  label: string;
}

/** Drag data for an input (from the Media tab's Inputs to the Mix canvas or timeline) */
export const DRAG_INPUT = 'application/x-flowshow-input';
export const inputKey = (i: LiveInput) => `${i.kind}:${i.id}`;
export const sameInput = (a?: LiveInput | null, b?: LiveInput | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;
export const INPUT_KIND_LABEL: Record<LiveInputKind, string> = { camera: 'Camera', screen: 'Screen', ndi: 'NDI' };

const invoke = async <T,>(cmd: string, args?: unknown): Promise<T> => {
  const { invoke: call } = await import('@tauri-apps/api/core');
  return call<T>(cmd, args as any);
};

// ─── Finding inputs ───

/** Cameras and capture cards. Their names appear once a camera may be used (asked once; the desktop app allows it). */
export async function listCameras(): Promise<LiveInput[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  let devices = await navigator.mediaDevices.enumerateDevices();
  if (devices.some(d => d.kind === 'videoinput' && (!d.label || !d.deviceId))) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach(t => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch { /* no camera, or not allowed */ }
  }
  return devices
    .filter(d => d.kind === 'videoinput' && d.deviceId)
    .map((d, i) => ({ kind: 'camera' as const, id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

/** This computer's screens (desktop app) */
export async function listScreens(): Promise<LiveInput[]> {
  if (!isTauri()) return [];
  const list = await invoke<{ id: string; width: number; height: number; primary: boolean }[]>('live_screens');
  return list.map((s, i) => ({ kind: 'screen' as const, id: s.id, label: `Screen ${i + 1}${s.primary ? ' (main)' : ''} · ${s.width}×${s.height}` }));
}

/** NDI sources on the network (desktop app; needs NDI Tools or the NDI Runtime) */
export async function listNdiSources(waitMs = 2500): Promise<LiveInput[]> {
  if (!isTauri()) return [];
  const list = await invoke<{ name: string; address: string }[]>('ndi_sources', { waitMs });
  return list.filter(s => s.name).map(s => ({ kind: 'ndi' as const, id: s.name, label: s.name }));
}

// ─── Showing an input ───

const urls = new Map<string, Promise<string | null>>();
/** The address a screen or NDI input streams from ('low' = the small preview for the Media tab) */
export function liveStreamUrl(input: LiveInput, quality: 'low' | 'high' = 'high'): Promise<string | null> {
  if (input.kind === 'camera' || !isTauri()) return Promise.resolve(null);
  const key = `${inputKey(input)}|${quality}`;
  if (!urls.has(key)) {
    urls.set(key, invoke<string>('live_url', { kind: input.kind, id: input.id, quality }).catch(() => { urls.delete(key); return null; }));
  }
  return urls.get(key)!;
}

/** A camera, shared by everything in this window that shows it; closed a few seconds after the last one stops */
type SharedCamera = { stream: Promise<MediaStream>; users: number; stopTimer?: number };
const cameras = new Map<string, SharedCamera>();
const cameraProblem = (e: unknown) => {
  const name = (e as { name?: string })?.name;
  return name === 'NotReadableError' ? 'In use by another app, or not responding'
    : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'Not connected'
    : name === 'NotAllowedError' ? 'Not allowed to use the camera'
    : 'Can’t open this camera';
};
function useCamera(id: string | undefined) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !navigator.mediaDevices?.getUserMedia) return;
    let entry = cameras.get(id);
    if (!entry) {
      // Everything asks for full HD, so a preview never makes the camera smaller for the screens
      const stream = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      });
      entry = { stream, users: 0 };
      cameras.set(id, entry);
      stream.catch(() => { if (cameras.get(id) === entry) cameras.delete(id); });
    }
    const shared = entry;
    shared.users++;
    window.clearTimeout(shared.stopTimer);
    let alive = true;
    setProblem(null);
    shared.stream.then(s => { if (alive) setStream(s); }, e => { if (alive) setProblem(cameraProblem(e)); });
    return () => {
      alive = false;
      shared.users--;
      if (shared.users <= 0) {
        shared.stopTimer = window.setTimeout(() => {
          if (shared.users > 0) return;
          if (cameras.get(id) === shared) cameras.delete(id);
          shared.stream.then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
        }, 3000);
      }
    };
  }, [id]);
  return { stream, problem };
}

function CameraView({ input, fit, className, style, showProblems }: ViewProps) {
  const { stream, problem } = useCamera(input.id);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
  }, [stream]);
  return (
    <>
      <video ref={ref} autoPlay muted playsInline className={className} style={{ ...style, objectFit: fit }} data-live-input={inputKey(input)} />
      {showProblems && problem && <Problem text={problem} />}
    </>
  );
}

function StreamView({ input, quality, fit, className, style, showProblems }: ViewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  useEffect(() => {
    let alive = true;
    setState('loading');
    liveStreamUrl(input, quality).then(u => { if (alive) { setUrl(u); if (!u) setState('failed'); } });
    return () => { alive = false; };
  }, [input.kind, input.id, quality]);
  return (
    <>
      {url && (
        <img
          src={url}
          alt=""
          draggable={false}
          className={className}
          style={{ ...style, objectFit: fit }}
          onLoad={() => setState('ok')}
          onError={() => setState('failed')}
          data-live-input={inputKey(input)}
        />
      )}
      {showProblems && state === 'loading' && <Problem text={input.kind === 'ndi' ? 'Connecting…' : 'Starting…'} quiet />}
      {showProblems && state === 'failed' && <Problem text={isTauri() ? (input.kind === 'ndi' ? 'No picture from this source' : 'Can’t copy this screen') : 'Works in the desktop app'} />}
    </>
  );
}

function Problem({ text, quiet = false }: { text: string; quiet?: boolean }) {
  return (
    <div className={`absolute inset-0 flex items-center justify-center text-center px-3 text-xs ${quiet ? 'text-neutral-400' : 'text-amber-300'} pointer-events-none`} data-live-problem>
      {text}
    </div>
  );
}

interface ViewProps {
  input: LiveInput;
  quality: 'low' | 'high';
  fit: 'cover' | 'contain';
  className?: string;
  style?: React.CSSProperties;
  /** Say when it can't show (the Media tab's tiles and the canvases); the screens just stay dark */
  showProblems?: boolean;
}

/** Choose a live input (Settings → Outputs → Default background): cameras, screens and NDI sources, found when opened */
export function LiveInputSelect({ value, onChange, className }: { value: LiveInput | null | undefined; onChange: (input: LiveInput) => void; className?: string }) {
  const [lists, setLists] = useState<{ camera: LiveInput[]; screen: LiveInput[]; ndi: LiveInput[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const look = async () => {
    setBusy(true);
    const [camera, screen, ndi] = await Promise.all([
      listCameras().catch(() => []),
      listScreens().catch(() => []),
      listNdiSources(2000).catch(() => []),
    ]);
    setLists({ camera, screen, ndi });
    setBusy(false);
  };
  useEffect(() => { void look(); }, []);
  const all = lists ? [...lists.camera, ...lists.screen, ...lists.ndi] : [];
  const missing = value && !all.some(i => sameInput(i, value));
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <select
        value={value ? inputKey(value) : ''}
        onChange={(e) => { const found = all.find(i => inputKey(i) === e.target.value); if (found) onChange(found); }}
        className={className}
        data-live-input-select
      >
        {!value && <option value="">{busy ? 'Looking for inputs…' : 'Choose an input…'}</option>}
        {value && missing && <option value={inputKey(value)}>{value.label} {busy ? '' : '(not found now)'}</option>}
        {lists && (['camera', 'screen', 'ndi'] as const).map(kind => lists[kind].length > 0 && (
          <optgroup key={kind} label={kind === 'camera' ? 'Cameras' : kind === 'screen' ? 'Screens' : 'NDI sources'}>
            {lists[kind].map(i => <option key={inputKey(i)} value={inputKey(i)}>{i.label}</option>)}
          </optgroup>
        ))}
      </select>
      <button type="button" onClick={() => void look()} disabled={busy} className="text-[10px] text-pink-400 hover:text-pink-300 font-bold shrink-0 disabled:opacity-50">
        {busy ? 'Looking…' : 'Look again'}
      </button>
    </div>
  );
}

/** A live input: a camera's video, or a screen's or NDI source's stream */
export function LiveInputView({ input, quality = 'high', fit = 'cover', className, style, showProblems = false }: Partial<ViewProps> & { input: LiveInput }) {
  const props: ViewProps = { input, quality, fit, className, style, showProblems };
  return input.kind === 'camera' ? <CameraView {...props} /> : <StreamView {...props} />;
}
