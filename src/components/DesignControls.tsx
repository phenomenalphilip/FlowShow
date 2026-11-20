import React, { useEffect, useRef, useState } from 'react';
import { Info, Layers, Minus, Plus, X } from 'lucide-react';
import { AnimationConfig, AnimationType, EXIT_OPTIONS, ExitType, MAX_MOTIONS, SCROLL_POS_MAX, SCROLL_POS_MIN, TextPosition, getScrollPositions, motionsClash } from '../lib/templates';
import { GENERIC_MOTION_DEFAULTS, MOTION_DEFAULTS, MOTION_PRESETS } from './TemplateEditor';
import {
  FONT_OPTIONS, canListLocalFonts, fontLabel, getLocalFonts, loadLocalFonts, loadLocalFontsIfAllowed, localFontValue, subscribeLocalFonts,
} from '../lib/fonts';
import { getInstalledFontFamilies, subscribeInstalledFonts } from '../lib/fontStore';

/** Small toolbar controls shared by Design mode and the stage layout designer */

/** 'draft' = shown on the canvas only (mid-drag); 'commit' = saved and sent to the screens */
export type Phase = 'draft' | 'commit';

/** What Design mode is designing: the song slides, or how scripture looks on the screen */
export type DesignFor = 'lyrics' | 'scripture' | 'declaration';

export interface DesignStatus {
  presenting: boolean;
  textCleared: boolean;
  locked: boolean;
}

export const WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'];

export const selectCls = 'bg-[#1e1e28] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none cursor-pointer focus:border-pink-500';
export const segBtn = (on: boolean) =>
  `px-2 py-1 text-xs font-semibold transition-colors ${on ? 'bg-pink-600 text-white' : 'bg-[#1e1e28] text-neutral-400 hover:text-white'}`;
export const smallBtn = 'px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function GroupLabel({ children, fixed = false }: { children: React.ReactNode; fixed?: boolean }) {
  return <span className={`text-[10px] uppercase font-bold tracking-wider text-neutral-500 shrink-0 ${fixed ? 'w-12' : ''}`}>{children}</span>;
}

export function Divider() {
  return <span className="w-px h-5 bg-white/10 mx-1" />;
}

export function SizeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center bg-[#1e1e28] border border-white/10 rounded" title="Text size (px on a 1920×1080 screen). Text still shrinks to fit its box.">
      <button type="button" onClick={() => onChange(Math.max(8, Math.round(value) - 4))} className="px-1.5 py-1 text-neutral-400 hover:text-white"><Minus size={12} /></button>
      <input
        type="number"
        min={8}
        max={400}
        value={Math.round(value)}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(clamp(v, 8, 400)); }}
        className="w-11 bg-transparent text-xs text-white text-center outline-none"
      />
      <button type="button" onClick={() => onChange(Math.min(400, Math.round(value) + 4))} className="px-1.5 py-1 text-neutral-400 hover:text-white"><Plus size={12} /></button>
    </div>
  );
}

export function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-neutral-500" title={`${label} in % of the screen`}>
      <span>{label}</span>
      <input
        type="number"
        step={0.5}
        value={value}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }}
        className="w-14 bg-[#1e1e28] border border-white/10 rounded px-1 py-0.5 text-xs text-white outline-none text-right focus:border-pink-500"
      />
    </label>
  );
}

/** Colour picker: previews on the canvas while picking, sends to the screen when the picker closes */
export function ColorField({ value, onChange, title = 'Text colour' }: { value: string; onChange: (v: string, phase: Phase) => void; title?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = () => onChangeRef.current(el.value, 'commit');
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);
  return (
    <input
      ref={ref}
      type="color"
      value={value}
      onChange={(e) => onChangeRef.current(e.target.value, 'draft')}
      className="h-7 w-9 cursor-pointer border-none bg-transparent rounded"
      title={title}
    />
  );
}

/** While dragged, changes show on the canvas only; letting go sends the final value to the screen */
export function MiniSlider({ label, min, max, step, value, format, onChange, onActiveChange }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number, phase: Phase) => void;
  /** Called while the slider is held, e.g. to hold scrolling text at this position on the canvas */
  onActiveChange?: (active: boolean) => void;
}) {
  const dragging = useRef(false);
  const changed = useRef(false);
  const last = useRef(value);
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          last.current = v;
          if (dragging.current) {
            changed.current = true;
            onChange(v, 'draft');
          } else {
            onChange(v, 'commit');
          }
        }}
        onPointerDown={() => {
          dragging.current = true;
          changed.current = false;
          onActiveChange?.(true);
          window.addEventListener('pointerup', () => {
            dragging.current = false;
            onActiveChange?.(false);
            if (changed.current) onChange(last.current, 'commit');
          }, { once: true });
        }}
        onKeyDown={() => onActiveChange?.(true)}
        onKeyUp={() => onActiveChange?.(false)}
        onBlur={() => onActiveChange?.(false)}
        className="w-20 accent-pink-500 cursor-pointer"
      />
      <span className="font-mono text-neutral-200 tabular-nums w-11 text-right">{format(value)}</span>
    </label>
  );
}

/**
 * Font picker: FlowShow's fonts, fonts installed with templates, the fonts installed on this computer, or any font typed by name.
 * The computer's fonts are listed as soon as the menu is pressed (the browser asks permission the first time only;
 * after that they load when FlowShow starts).
 */
export function FontSelect({ value, onChange, className = `${selectCls} w-36`, fill = false }: { value: string; onChange: (v: string) => void; className?: string; fill?: boolean }) {
  const [local, setLocal] = useState<string[] | null>(getLocalFonts());
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => subscribeLocalFonts(() => setLocal(getLocalFonts())), []);
  const [installed, setInstalled] = useState<string[]>(getInstalledFontFamilies());
  useEffect(() => subscribeInstalledFonts(() => setInstalled(getInstalledFontFamilies())), []);
  useEffect(() => { void loadLocalFontsIfAllowed(); }, []);

  const known = FONT_OPTIONS.some(f => f.value === value) || [...(local || []), ...installed].some(f => localFontValue(f) === value);
  const choose = (v: string) => {
    if (v === '__type') {
      const name = window.prompt('Type the name of a font installed on this computer (for example Segoe UI or Calibri)')?.trim();
      if (name) onChange(localFontValue(name));
      return;
    }
    onChange(v);
  };
  const listFonts = () => {
    if (local || !canListLocalFonts()) return;
    setProblem(null);
    loadLocalFonts().catch((err: unknown) => setProblem(err instanceof Error && err.name !== 'Error' ? 'Permission to see your fonts was not given' : err instanceof Error ? err.message : String(err)));
  };

  return (
    <div className={`flex items-center gap-1 min-w-0 ${fill ? 'w-full' : ''}`}>
      <select value={value} onChange={(e) => choose(e.target.value)} onPointerDown={listFonts} onKeyDown={listFonts} className={className} title={problem || 'Font'} style={{ fontFamily: value }}>
        {!known && <option value={value}>{fontLabel(value)}</option>}
        <optgroup label="FlowShow fonts">
          {FONT_OPTIONS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
        </optgroup>
        {installed.length > 0 && (
          <optgroup label="Installed with templates">
            {installed.map(f => <option key={`i-${f}`} value={localFontValue(f)} style={{ fontFamily: localFontValue(f) }}>{f}</option>)}
          </optgroup>
        )}
        {local && local.length > 0 && (
          <optgroup label="On this computer">
            {local.map(f => <option key={f} value={localFontValue(f)} style={{ fontFamily: localFontValue(f) }}>{f}</option>)}
          </optgroup>
        )}
        <option value="__type">Type a font name…</option>
      </select>
    </div>
  );
}

/** The settings some motions have: Scroll In (which edge), Ticker (direction, speed) and Karaoke (pace, colour) */
export function MotionOptions({ anim, onChange }: { anim?: AnimationConfig; onChange: (patch: Partial<AnimationConfig>, phase?: Phase) => void }) {
  if (!anim) return null;
  if (anim.type === 'scroll-in') {
    const edge = anim.fromEdge || 'bottom';
    return (
      <>
        <div className="flex rounded overflow-hidden" title="The edge of the screen the words come in from">
          {(['top', 'bottom', 'left', 'right'] as const).map(e => (
            <button key={e} type="button" onClick={() => onChange({ fromEdge: e })} className={segBtn(edge === e)}>
              From {e}
            </button>
          ))}
        </div>
        <MiniSlider label="Duration" min={0.2} max={5} step={0.05} value={anim.duration || 0.9} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => onChange({ duration: v }, phase)} />
      </>
    );
  }
  if (anim.type === 'ticker') {
    const leftward = (anim.tickerDirection || 'left') === 'left';
    return (
      <>
        <div className="flex rounded overflow-hidden" title="Which way the line travels across its box">
          <button type="button" onClick={() => onChange({ tickerDirection: 'left' })} className={segBtn(leftward)}>Right → left</button>
          <button type="button" onClick={() => onChange({ tickerDirection: 'right' })} className={segBtn(!leftward)}>Left → right</button>
        </div>
        <MiniSlider label="Speed" min={40} max={1200} step={10} value={anim.tickerSpeed || 260} format={(v) => `${Math.round(v)}`} onChange={(v, phase) => onChange({ tickerSpeed: v }, phase)} />
        <div className="flex rounded overflow-hidden">
          <button type="button" onClick={() => onChange({ scrollLoop: true })} className={segBtn(anim.scrollLoop !== false)}>Loop</button>
          <button type="button" onClick={() => onChange({ scrollLoop: false })} className={segBtn(anim.scrollLoop === false)}>Once</button>
        </div>
      </>
    );
  }
  if (anim.type === 'vertical-scroll') {
    const pos = getScrollPositions(anim);
    return (
      <>
        <MiniSlider label="Duration" min={3} max={60} step={1} value={anim.duration || 14} format={(v) => `${v}s`} onChange={(v, phase) => onChange({ duration: v }, phase)} />
        <MiniSlider label="Start" min={SCROLL_POS_MIN} max={SCROLL_POS_MAX} step={1} value={pos.start} format={(v) => `${v}%`} onChange={(v, phase) => onChange({ scrollStartPos: v }, phase)} />
        <MiniSlider label="Stop" min={SCROLL_POS_MIN} max={SCROLL_POS_MAX} step={1} value={pos.end} format={(v) => `${v}%`} onChange={(v, phase) => onChange({ scrollEndPos: v }, phase)} />
        <div className="flex rounded overflow-hidden">
          <button type="button" onClick={() => onChange({ scrollLoop: true })} className={segBtn(anim.scrollLoop !== false)}>Loop</button>
          <button type="button" onClick={() => onChange({ scrollLoop: false })} className={segBtn(anim.scrollLoop === false)}>Once</button>
        </div>
      </>
    );
  }
  if (anim.type === 'word-stack') {
    return (
      <>
        <MiniSlider label="Between words" min={0.05} max={2} step={0.05} value={anim.stagger ?? 0.35} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => onChange({ stagger: v }, phase)} />
        <MiniSlider label="Pop" min={0.1} max={1} step={0.05} value={anim.duration ?? 0.35} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => onChange({ duration: v }, phase)} />
      </>
    );
  }
  if (anim.type === 'karaoke') {
    const colour = /^#[0-9a-f]{6}$/i.test(anim.karaokeColor || '') ? anim.karaokeColor! : '#38bdf8';
    return (
      <>
        <MiniSlider label="Pace" min={0.1} max={2} step={0.05} value={anim.stagger ?? 0.5} format={(v) => `${v.toFixed(2)}s/word`} onChange={(v, phase) => onChange({ stagger: v }, phase)} />
        <span className="text-[11px] text-neutral-400">Fill</span>
        <ColorField value={colour} title="The colour each word fills with" onChange={(v, phase) => onChange({ karaokeColor: v }, phase)} />
      </>
    );
  }
  return null;
}

/** How the words leave the screen when the next slide comes in */
export function ExitSelect({ anim, onChange }: { anim?: AnimationConfig; onChange: (patch: Partial<AnimationConfig>, phase?: Phase) => void }) {
  const type: ExitType = anim?.exit?.type || 'none';
  const duration = anim?.exit?.duration ?? 0.35;
  return (
    <>
      <span className="text-[11px] text-neutral-400">Exit</span>
      <select
        value={type}
        onChange={(e) => onChange({ exit: { type: e.target.value as ExitType, duration } })}
        className={selectCls}
        title="How the words leave when the next slide comes in"
      >
        {EXIT_OPTIONS.map(o => <option key={o.type} value={o.type}>{o.label}</option>)}
      </select>
      {type !== 'none' && (
        <MiniSlider label="" min={0.1} max={2} step={0.05} value={duration} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => onChange({ exit: { type, duration: v } }, phase)} />
      )}
    </>
  );
}

/** Where text sits in its box when it doesn't fill it */
export function TextPositionSwitch({ value, onChange }: { value?: TextPosition; onChange: (v: TextPosition) => void }) {
  const v = value || 'middle';
  return (
    <div className="flex items-center gap-1.5" title="Where the text starts in its box when it doesn't fill the box">
      <span className="text-[11px] text-neutral-400">Text at</span>
      <div className="flex rounded overflow-hidden">
        {(['top', 'middle', 'bottom'] as const).map(p => (
          <button key={p} type="button" onClick={() => onChange(p)} className={segBtn(v === p)}>
            {p === 'top' ? 'Top' : p === 'middle' ? 'Middle' : 'Bottom'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Design mode's choice between designing the song slides and designing how scripture looks */
export function DesignForSwitch({ value, onChange }: { value: DesignFor; onChange: (v: DesignFor) => void }) {
  return (
    <div className="flex rounded overflow-hidden shrink-0" title="Design the song slides, the Declarations template, or how Bible verses look on this screen">
      <button type="button" onClick={() => onChange('lyrics')} className={segBtn(value === 'lyrics')}>For lyrics</button>
      <button type="button" onClick={() => onChange('declaration')} className={segBtn(value === 'declaration')}>For declarations</button>
      <button type="button" onClick={() => onChange('scripture')} className={segBtn(value === 'scripture')}>For scripture</button>
    </div>
  );
}

/** Why the screen may not be showing what the canvas shows */
export function StatusBadges({ status }: { status: DesignStatus }) {
  const badges: { text: string; cls: string; title: string }[] = [];
  if (!status.presenting) badges.push({ text: 'Screens off', cls: 'bg-neutral-700/60 text-neutral-300', title: 'Not presenting, so the screens are blank. Press Present (B) to show them.' });
  if (status.locked) badges.push({ text: 'Locked', cls: 'bg-red-500/15 text-red-400', title: 'This screen is frozen on its current slide' });
  if (status.textCleared) badges.push({ text: 'Text cleared', cls: 'bg-amber-500/15 text-amber-400', title: 'Text is cleared on this screen, so it is not showing right now' });
  return (
    <div className="flex items-center gap-1">
      {badges.map(b => (
        <span key={b.text} title={b.title} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${b.cls}`}>{b.text}</span>
      ))}
    </div>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-3 mt-2 px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 shrink-0 bg-blue-500/10 border-blue-500/20 text-blue-200">
      <Info size={13} className="shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Can `type` run alongside the other motions on the box? (no repeats; one word effect, one travel, one Word Stack) */
function canStack(type: AnimationType, others: AnimationType[]): boolean {
  return !others.some(o => motionsClash(o, type));
}

/** Extra motions that run at the same time as the box's main motion (up to MAX_MOTIONS in all) */
export function MotionLayers({ anim, onChange }: { anim?: AnimationConfig; onChange: (patch: Partial<AnimationConfig>, phase?: Phase) => void }) {
  if (!anim?.type) return null;
  const layers = anim.layers || [];
  const othersThan = (i: number) => [anim.type, ...layers.filter((_, j) => j !== i).map(l => l.type)];
  const setLayers = (next: AnimationConfig[], phase?: Phase) => onChange({ layers: next.length ? next : undefined }, phase);
  const patchLayer = (i: number, patch: Partial<AnimationConfig>, phase?: Phase) =>
    setLayers(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)), phase);
  const nextFree = MOTION_PRESETS.find(p => canStack(p.type, [anim.type, ...layers.map(l => l.type)]));
  const fresh = (type: AnimationType): AnimationConfig => ({ type, duration: 0.6, ...(MOTION_DEFAULTS[type] || GENERIC_MOTION_DEFAULTS) } as AnimationConfig);

  return (
    <>
      {layers.map((l, i) => {
        const word = l.type === 'flicker' || l.type === 'bounce';
        return (
          <span key={i} className={`flex items-center gap-1.5 pl-2 border-l border-white/10 ${canStack(l.type, othersThan(i).slice(0, i + 1)) ? '' : 'opacity-40'}`} title={canStack(l.type, othersThan(i).slice(0, i + 1)) ? undefined : "Not running: it can't play together with a motion before it"} data-motion-layer={i}>
            <span className="text-[11px] text-neutral-400">With</span>
            <select
              value={l.type}
              onChange={(e) => { const t = e.target.value as AnimationType; setLayers(layers.map((x, j) => (j === i ? fresh(t) : x))); }}
              className={selectCls}
              title={`Motion ${i + 2} of ${MAX_MOTIONS}: runs at the same time as the others`}
            >
              {MOTION_PRESETS.filter(p => p.type === l.type || canStack(p.type, othersThan(i))).map(p => <option key={p.type} value={p.type}>{p.label}</option>)}
            </select>
            {l.type === 'scroll-in' || l.type === 'karaoke' || l.type === 'ticker' || l.type === 'vertical-scroll' || l.type === 'word-stack' ? (
              <MotionOptions anim={l} onChange={(patch, phase) => patchLayer(i, patch, phase)} />
            ) : (
              <>
                {word && <MiniSlider label="Gap" min={0} max={1} step={0.01} value={l.stagger ?? (l.type === 'bounce' ? 0.12 : 0.08)} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => patchLayer(i, { stagger: v }, phase)} />}
                <MiniSlider label="Duration" min={0.1} max={10} step={0.05} value={l.duration || 0.6} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => patchLayer(i, { duration: v }, phase)} />
              </>
            )}
            <button type="button" onClick={() => setLayers(layers.filter((_, j) => j !== i))} className="p-1 rounded text-neutral-500 hover:text-white hover:bg-white/10" title="Stop this motion">
              <X size={12} />
            </button>
          </span>
        );
      })}
      {layers.length < MAX_MOTIONS - 1 && nextFree && (
        <button
          type="button"
          onClick={() => setLayers([...layers, fresh(nextFree.type)])}
          className={`${smallBtn} flex items-center gap-1 bg-[#1e1e28] text-neutral-300 hover:text-white hover:bg-white/10`}
          title={`Run another motion at the same time (up to ${MAX_MOTIONS})`}
          data-add-motion
        >
          <Layers size={12} /> Add motion ({layers.length + 1}/{MAX_MOTIONS})
        </button>
      )}
    </>
  );
}
