import React from 'react';
import { Radio, AlertTriangle, MonitorDown, Loader2, CircleOff } from 'lucide-react';
import { NdiOutputSettings, NdiState, ndiStateOf, useNdiLive } from '../lib/nativeOutputs';

const TONE: Record<NdiState, { dot: string; text: string; ring: string }> = {
  sending: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'border-emerald-500/30 bg-emerald-500/[0.06]' },
  starting: { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'border-amber-500/30 bg-amber-500/[0.06]' },
  problem: { dot: 'bg-red-500', text: 'text-red-300', ring: 'border-red-500/30 bg-red-500/[0.06]' },
  off: { dot: 'bg-neutral-600', text: 'text-neutral-400', ring: 'border-white/5 bg-[#121214]' },
  browser: { dot: 'bg-neutral-600', text: 'text-neutral-400', ring: 'border-white/5 bg-[#121214]' },
};
const ICON: Record<NdiState, typeof Radio> = { sending: Radio, starting: Loader2, problem: AlertTriangle, off: CircleOff, browser: MonitorDown };

/** Settings → Outputs → an NDI output: is it really going out, to how many receivers, at what rate */
export function NdiStatusCard({ output }: { output: NdiOutputSettings }) {
  const live = useNdiLive();
  const { state, text, detail } = ndiStateOf(live, output);
  const s = live.outputs[output.id];
  const tone = TONE[state];
  const Icon = ICON[state];
  const name = (output.ndiStreamName || `FlowShow NDI - ${output.name}`).trim();
  const seenAs = live.info?.computer ? `${live.info.computer} (${name})` : name;
  const wantFps = output.ndiFrameRate || 30;
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${tone.ring}`} data-ndi-status={state}>
      <div className="flex items-center gap-2">
        <span className="relative flex w-2.5 h-2.5">
          {state === 'sending' && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />}
          <span className={`relative w-2.5 h-2.5 rounded-full ${tone.dot}`} />
        </span>
        <Icon size={14} className={`${tone.text} ${state === 'starting' ? 'animate-spin' : ''}`} />
        <span className={`text-sm font-semibold ${tone.text}`} data-ndi-status-text>{text}</span>
      </div>
      {detail && <p className="text-xs text-neutral-400 leading-relaxed" data-ndi-status-detail>{detail}</p>}
      {state !== 'browser' && (
        <div className="text-xs text-neutral-400">
          Receivers (OBS, vMix, NDI Studio Monitor…) list it as <span className="text-white font-medium" data-ndi-seen-as>{seenAs}</span>
        </div>
      )}
      {s && state === 'sending' && (
        <div className="grid grid-cols-3 gap-2 pt-1" data-ndi-stats>
          <Stat label="Receivers" value={String(s.connections)} />
          <Stat label="Frame rate" value={`${Math.round(s.fps)} / ${wantFps} fps`} warn={s.fps > 0 && s.fps < wantFps * 0.8} />
          <Stat label="Picture" value={s.width ? `${s.width}×${s.height}` : '–'} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-black/30 border border-white/5 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</div>
    </div>
  );
}

/** The small NDI tag on an output's monitor: its real state, and how many receivers are watching */
export function NdiBadge({ output }: { output: NdiOutputSettings }) {
  const live = useNdiLive();
  const { state, text, detail } = ndiStateOf(live, output);
  const s = live.outputs[output.id];
  const tone = TONE[state];
  return (
    <span
      className="flex items-center gap-1 text-[9px] font-bold px-1 py-0.5 bg-purple-500/20 text-purple-300 rounded"
      title={`NDI: ${text}${detail ? ` — ${detail}` : ''}`}
      data-ndi-badge={state}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      NDI{state === 'sending' && s && s.connections > 0 ? ` · ${s.connections}` : ''}
    </span>
  );
}

/** A dot for lists of outputs: green when an NDI output is really sending */
export function NdiDot({ output }: { output: NdiOutputSettings }) {
  const live = useNdiLive();
  const { state, text } = ndiStateOf(live, output);
  return <div className={`w-2 h-2 rounded-full ${TONE[state].dot} ${state === 'sending' ? 'animate-pulse' : ''}`} title={`NDI: ${text}`} />;
}
