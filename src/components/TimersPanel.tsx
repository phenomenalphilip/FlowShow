import React, { useEffect, useState } from 'react';
import { Pause, Play, Plus, Square, Timer, Pencil, Trash2, Clock } from 'lucide-react';
import { LiveTimer, TimerPreset, formatClock, formatDuration, parseDuration, timeLeft, timerBusy, useTicker } from '../lib/timers';
import { askConfirm, askText, showMessage } from '../lib/appDialogs';

/** The Timers tab: timer presets, and the one timer in use (shown by a stage layout's Timer item) */
export function TimersPanel({ presets, onChangePresets, timer, onStart, onPauseResume, onStop, onAdjust, flicker, onFlicker }: {
  presets: TimerPreset[];
  onChangePresets: (presets: TimerPreset[]) => void;
  timer: LiveTimer | null | undefined;
  onStart: (preset: TimerPreset) => void;
  onPauseResume: () => void;
  onStop: () => void;
  /** Add or take away time from the timer in use */
  onAdjust: (deltaMs: number) => void;
  /** Whether TIME UP keeps flashing on the stage screen */
  flicker: boolean;
  onFlicker: (on: boolean) => void;
}) {
  const now = useTicker(!!timer && timer.startedAt !== null, 200);
  const left = timeLeft(timer, now);
  const busy = timerBusy(timer, now);
  const ended = !!timer && left <= 0;
  const [menu, setMenu] = useState<{ x: number; y: number; preset: TimerPreset } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const askLength = async (current?: number) => {
    const text = await askText('How long? For example 5 (minutes), 5:30, or 1:00:00', current ? formatDuration(current) : '5:00', { okLabel: 'OK' });
    if (text === null) return null;
    const seconds = parseDuration(text);
    if (!seconds || seconds <= 0) { await showMessage(`"${text}" isn't a length FlowShow understands. Try 5, 5:30 or 1:00:00.`); return null; }
    return seconds;
  };
  const addPreset = async () => {
    const name = await askText('Name for the new timer (for example Sermon, Countdown, Announcements)', '', { okLabel: 'Next' });
    if (!name) return;
    const seconds = await askLength();
    if (!seconds) return;
    onChangePresets([...presets, { id: `timer-${Date.now().toString(36)}`, name, seconds }]);
  };
  const rename = async (p: TimerPreset) => {
    const name = await askText('Timer name', p.name, { okLabel: 'Rename' });
    if (name) onChangePresets(presets.map(x => x.id === p.id ? { ...x, name } : x));
  };
  const changeLength = async (p: TimerPreset) => {
    const seconds = await askLength(p.seconds);
    if (seconds) onChangePresets(presets.map(x => x.id === p.id ? { ...x, seconds } : x));
  };
  const remove = async (p: TimerPreset) => {
    if (await askConfirm(`Delete the timer "${p.name}"?`, { okLabel: 'Delete', danger: true })) onChangePresets(presets.filter(x => x.id !== p.id));
  };

  return (
    <div className="h-full flex min-h-0" data-timers-panel>
      {/* The timer in use */}
      <div className="w-80 shrink-0 border-r border-[#262635] p-4 flex flex-col" data-timer-in-use>
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Timer in use</div>
        {timer ? (
          <>
            <div className="text-sm font-semibold text-white truncate">{timer.name}</div>
            <div
              className={`font-mono font-bold tabular-nums text-5xl my-2 ${ended ? `text-red-500 ${flicker ? 'fs-flicker' : ''}` : left <= 60000 ? 'text-amber-400' : 'text-white'}`}
              data-timer-clock
            >
              {ended ? 'TIME UP' : formatClock(left)}
            </div>
            <div className="text-[11px] text-neutral-400 mb-3" data-timer-status>
              {ended ? 'Press Stop to clear TIME UP from the stage screen' : `${timer.startedAt === null ? 'Paused' : 'Running'} · ${formatClock(timer.durationMs)} timer`}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {!ended && (
                <button type="button" onClick={onPauseResume} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 text-white flex items-center gap-1.5" data-timer-pause>
                  {timer.startedAt === null ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Pause</>}
                </button>
              )}
              <button type="button" onClick={onStop} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/80 hover:bg-red-600 text-white flex items-center gap-1.5" data-timer-stop>
                <Square size={11} /> Stop
              </button>
              {!ended && (
                <>
                  <button type="button" onClick={() => onAdjust(-60000)} className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-neutral-200" title="One minute less">−1 min</button>
                  <button type="button" onClick={() => onAdjust(60000)} className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-neutral-200" title="One minute more" data-timer-plus>+1 min</button>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-neutral-500 leading-relaxed">
            No timer running. Start one from the list. Add a <span className="text-neutral-300">Timer</span> item to a stage layout (Stage tab → Add) to show it on the stage screen.
          </p>
        )}
      </div>

      {/* Presets */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
          {busy && (
            <p className="text-[11px] text-amber-300/90 mb-3" data-timer-busy-hint>
              "{timer!.name}" is in use. Stop it (or let it end) to start another timer.
            </p>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {presets.map(p => {
              const inUse = timer?.presetId === p.id && busy;
              return (
                <div
                  key={p.id}
                  onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, preset: p }); }}
                  className={`rounded-lg border p-3 flex items-center gap-3 ${inUse ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 bg-white/[0.03]'}`}
                  data-timer-preset={p.name}
                  title="Right-click to rename, change the length or delete"
                >
                  <Timer size={18} className={inUse ? 'text-pink-400 shrink-0' : 'text-neutral-500 shrink-0'} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                    <div className="text-xs font-mono text-neutral-400">{formatDuration(p.seconds)}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onStart(p)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={busy ? 'Stop the timer in use (or let it end) first' : `Start ${p.name}`}
                    data-timer-start
                  >
                    <Play size={11} /> {inUse ? 'In use' : 'Start'}
                  </button>
                </div>
              );
            })}
          </div>
          {presets.length === 0 && <p className="text-xs text-neutral-500">No timers yet. Click New timer to make one.</p>}
        </div>
        <div className="px-4 py-2 border-t border-[#262635] flex items-center justify-between shrink-0">
          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none" title="When time is up, TIME UP keeps flashing on the stage screen until you press Stop" data-timer-flicker>
            <input type="checkbox" checked={flicker} onChange={(e) => onFlicker(e.target.checked)} className="accent-pink-500 w-4 h-4" />
            TIME UP flickers until Stop
          </label>
          <button type="button" onClick={() => void addPreset()} className="px-4 py-1.5 rounded-full text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1.5" data-new-timer>
            <Plus size={13} /> New timer
          </button>
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-[150] min-w-[180px] py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl text-xs text-neutral-200"
          style={{ left: Math.min(menu.x, window.innerWidth - 190), top: menu.y, transform: 'translateY(-100%)' }}
          onPointerDown={(e) => e.stopPropagation()}
          data-timer-menu
        >
          <button type="button" className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10" onClick={() => { setMenu(null); void rename(menu.preset); }}><Pencil size={13} className="text-neutral-400" /> Rename</button>
          <button type="button" className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10" onClick={() => { setMenu(null); void changeLength(menu.preset); }}><Clock size={13} className="text-neutral-400" /> Change length</button>
          <div className="h-px bg-white/5 my-1" />
          <button type="button" className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-red-300" onClick={() => { setMenu(null); void remove(menu.preset); }}><Trash2 size={13} /> Delete</button>
        </div>
      )}
    </div>
  );
}
