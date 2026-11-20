/**
 * Real outputs in the desktop app.
 *  - Screen (HDMI / DisplayPort…) outputs: a full-screen window on the chosen monitor (see tauriScreen.ts).
 *  - NDI outputs: a window of the output's resolution placed out of sight, captured and sent over NDI
 *    by the native side (src-tauri/src/ndi.rs). It is the same output page a projector shows.
 */
import { useEffect, useState } from 'react';
import { isTauri } from './tauriScreen';

export interface NdiInfo { available: boolean; runtime?: string; error?: string; /** How receivers name this computer's sources */ computer?: string }
export interface NdiStatus { name: string; connections: number; framesCaptured: number; framesSent: number; width: number; height: number; seconds: number; error?: string }

/** The bits of an output's settings NDI needs */
export interface NdiOutputSettings {
  id: string;
  name: string;
  enabled: boolean;
  outputType?: 'hdmi' | 'ndi';
  ndiStreamName?: string;
  ndiGroup?: string;
  ndiResolution?: '1920x1080' | '1280x720' | '3840x2160';
  ndiFrameRate?: number;
  ndiTransparent?: boolean;
}

const invoke = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke: call } = await import('@tauri-apps/api/core');
  return call<T>(cmd, args);
};

export const outputWindowLabel = (outputId: string) => `projector-${outputId}`;

export async function ndiInfo(): Promise<NdiInfo> {
  if (!isTauri()) return { available: false, error: 'NDI works in the FlowShow desktop app.' };
  try { return await invoke<NdiInfo>('ndi_info'); } catch (e) { return { available: false, error: String(e) }; }
}

export async function ndiStatus(): Promise<Record<string, NdiStatus>> {
  if (!isTauri()) return {};
  try { return await invoke<Record<string, NdiStatus>>('ndi_status'); } catch { return {}; }
}

// ─── Live NDI status for the screens (Settings, monitors), refreshed every second while something shows it ───

export interface NdiLiveOutput extends NdiStatus { /** Frames sent per second, measured */ fps: number }
export interface NdiLive {
  /** Running senders, by output id */
  outputs: Record<string, NdiLiveOutput>;
  info: NdiInfo | null;
  /** Why an output couldn't start, by output id */
  problems: Record<string, string>;
}

let live: NdiLive = { outputs: {}, info: null, problems: {} };
const listeners = new Set<(l: NdiLive) => void>();
const lastCount: Record<string, { sent: number; at: number }> = {};
let pollTimer: ReturnType<typeof setInterval> | null = null;
const emit = () => listeners.forEach(fn => fn(live));

async function pollNdi() {
  const raw = await ndiStatus();
  const now = performance.now();
  const outputs: Record<string, NdiLiveOutput> = {};
  for (const [label, st] of Object.entries(raw)) {
    const id = label.replace(/^projector-/, '');
    const prev = lastCount[label];
    const fps = prev && now > prev.at && st.framesSent >= prev.sent ? (st.framesSent - prev.sent) / ((now - prev.at) / 1000) : 0;
    lastCount[label] = { sent: st.framesSent, at: now };
    outputs[id] = { ...st, fps };
  }
  live = { ...live, outputs };
  emit();
}

export function setNdiProblems(problems: Record<string, string>) {
  live = { ...live, problems };
  emit();
}

/** The live NDI status, kept up to date while the component is shown */
export function useNdiLive(): NdiLive {
  const [value, setValue] = useState(live);
  useEffect(() => {
    listeners.add(setValue);
    setValue(live);
    if (listeners.size === 1 && isTauri()) {
      if (!live.info) ndiInfo().then(info => { live = { ...live, info }; emit(); });
      void pollNdi();
      pollTimer = setInterval(() => void pollNdi(), 1000);
    }
    return () => {
      listeners.delete(setValue);
      if (!listeners.size && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };
  }, []);
  return value;
}

export type NdiState = 'browser' | 'off' | 'sending' | 'starting' | 'problem';

/** One output's NDI state, in words for the screen */
export function ndiStateOf(l: NdiLive, o: NdiOutputSettings): { state: NdiState; text: string; detail?: string } {
  if (!isTauri()) return { state: 'browser', text: 'Desktop app only', detail: 'NDI is sent by the FlowShow desktop app.' };
  if (!o.enabled) return { state: 'off', text: 'Off', detail: 'Switch Enabled on to send this output over NDI.' };
  if (l.info && !l.info.available) return { state: 'problem', text: 'NDI not available', detail: l.info.error };
  if (l.problems[o.id]) return { state: 'problem', text: "Couldn't start", detail: l.problems[o.id] };
  const s = l.outputs[o.id];
  if (!s) return { state: 'starting', text: 'Starting…' };
  if (s.error) return { state: 'problem', text: 'Problem', detail: s.error };
  if (s.framesSent === 0) return { state: 'starting', text: 'Starting…' };
  const who = s.connections === 1 ? '1 receiver' : `${s.connections} receivers`;
  return { state: 'sending', text: s.connections > 0 ? `Sending to ${who}` : 'Sending · no receivers yet' };
}

/** What each running NDI output was started with, so unchanged outputs aren't restarted */
const running = new Map<string, string>();

/**
 * Open the hidden window for an NDI output: its exact resolution, far to the left of every screen.
 * It stays on the taskbar until its capture has started (Windows won't start capturing a window hidden from it).
 */
async function ensureNdiWindow(o: NdiOutputSettings, skipTaskbar = false): Promise<void> {
  const [width, height] = (o.ndiResolution || '1920x1080').split('x').map(Number);
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const isNew = !(await WebviewWindow.getByLabel(outputWindowLabel(o.id)));
  await invoke('open_output_window', {
    label: outputWindowLabel(o.id),
    url: `/projector/${o.id}`,
    title: `FlowShow - ${o.name} (NDI)`,
    x: -width - 8000, y: 0, width, height,
    fullscreen: false, transparent: (o.ndiTransparent !== false), onTop: false, skipTaskbar,
  });
  // Give a new page a moment to draw its first picture
  if (isNew) await new Promise(r => setTimeout(r, 800));
}

/**
 * Make the NDI sources match the settings: every enabled NDI output is sent, others are stopped
 * and their hidden windows closed. Returns a problem per output id, if any.
 */
export async function syncNdiOutputs(outputs: NdiOutputSettings[]): Promise<Record<string, string>> {
  const problems: Record<string, string> = {};
  if (!isTauri()) return problems;
  const wanted = outputs.filter(o => o.outputType === 'ndi' && o.enabled);
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

  const closeOutput = async (id: string) => {
    running.delete(id);
    try { await invoke('ndi_stop', { label: outputWindowLabel(id) }); } catch { /* already stopped */ }
    try { await invoke('close_output_window', { label: outputWindowLabel(id) }); } catch { /* already closed */ }
  };
  // Stop the ones no longer wanted
  for (const id of [...running.keys()]) {
    if (!wanted.some(o => o.id === id)) await closeOutput(id);
  }
  if (!wanted.length) return problems;

  const info = await ndiInfo();
  if (!info.available) {
    wanted.forEach(o => { problems[o.id] = info.error || 'NDI is not available'; });
    return problems;
  }
  for (const o of wanted) {
    const name = (o.ndiStreamName || `FlowShow - ${o.name}`).trim();
    const key = JSON.stringify([name, o.ndiGroup || '', o.ndiResolution || '1920x1080', o.ndiFrameRate || 30, (o.ndiTransparent !== false)]);
    const before = running.get(o.id);
    if (before === key) continue;
    try {
      // See-through or not is fixed when a window is made: switching it needs a new window
      const wasTransparent = before ? JSON.parse(before)[4] : undefined;
      const existing = await WebviewWindow.getByLabel(outputWindowLabel(o.id));
      if (existing && wasTransparent !== undefined && wasTransparent !== (o.ndiTransparent !== false)) await closeOutput(o.id);
      await ensureNdiWindow(o);
      await invoke('ndi_start', { label: outputWindowLabel(o.id), name, groups: o.ndiGroup || null, fps: o.ndiFrameRate || 30, alpha: (o.ndiTransparent !== false) });
      // Capture has started: now take it off the taskbar
      await ensureNdiWindow(o, true);
      running.set(o.id, key);
    } catch (e) {
      problems[o.id] = e instanceof Error ? e.message : String(e);
    }
  }
  return problems;
}
