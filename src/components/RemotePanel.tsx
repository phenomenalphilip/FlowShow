/** The remote button (top right) and its panel: switch the phone remote on or off, with the address and PIN to use */
import React, { useEffect, useRef, useState } from 'react';
import { Smartphone, Wifi, WifiOff } from 'lucide-react';
import { isTauri } from '../lib/tauriScreen';
import { startRemote, stopRemote, useRemote } from '../lib/remote';

export function RemoteButton() {
  const [open, setOpen] = useState(false);
  const info = useRemote(open);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const toggle = async () => {
    setBusy(true); setProblem(null);
    try { if (info.running) await stopRemote(); else await startRemote(); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`p-1 transition-colors ${info.running ? 'text-emerald-400 hover:text-emerald-300' : 'text-neutral-500 hover:text-white'}`}
        title={info.running ? `Phone remote on${info.phones ? ` · ${info.phones} connected` : ''}` : 'Phone remote (off)'}
        data-remote-button
      >
        {info.running ? <Wifi size={16} /> : <WifiOff size={16} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-white/10 bg-[#18181b] shadow-2xl p-4 space-y-3 text-xs text-neutral-300" data-remote-panel>
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-pink-400" />
            <span className="text-sm font-bold text-white flex-1">Phone remote</span>
            {isTauri() && (
              <button type="button" onClick={() => void toggle()} disabled={busy}
                className={`px-3 py-1 rounded-md text-xs font-bold ${info.running ? 'bg-white/10 text-neutral-200 hover:bg-white/15' : 'bg-pink-600 text-white hover:bg-pink-500'} disabled:opacity-50`}
                data-remote-toggle>
                {info.running ? 'Turn off' : 'Turn on'}
              </button>
            )}
          </div>
          {!isTauri() ? (
            <p>The phone remote works in the FlowShow desktop app.</p>
          ) : info.running ? (
            <>
              <p className="leading-relaxed">On a phone or tablet on the <span className="text-white">same Wi-Fi</span>, open this address in the browser and type the PIN:</p>
              <div className="rounded-lg bg-black/40 border border-white/10 p-3 space-y-2">
                <div className="font-mono text-sm text-white break-all select-all" data-remote-url>{info.url || 'No network found'}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-neutral-500">PIN</span>
                  <span className="font-mono text-2xl font-black tracking-[0.3em] text-pink-300" data-remote-pin>{info.pin}</span>
                </div>
              </div>
              <p className="text-neutral-500" data-remote-phones>{info.phones ? `${info.phones} ${info.phones === 1 ? 'phone' : 'phones'} connected` : 'No phones connected yet.'}</p>
              <p className="text-[11px] text-neutral-500 leading-relaxed">The first time, Windows may ask whether FlowShow may use the network: allow it on private networks. Turning the remote off and on makes a new PIN.</p>
            </>
          ) : (
            <p className="leading-relaxed">Control the slides from a phone or tablet: next and previous, tap a slide or a setlist item, and clear. Nothing to install: it opens in the phone's browser.</p>
          )}
          {problem && <p className="text-amber-300" data-remote-problem>{problem}</p>}
        </div>
      )}
    </div>
  );
}
