import React, { useEffect, useMemo, useRef, useState } from 'react';
import { askText } from '../lib/appDialogs';
import { ChevronDown, ChevronRight, Info, Layers, Minus, Plus, Sparkles, X } from 'lucide-react';
import { AnimationConfig, AnimationType, EXIT_OPTIONS, ExitType, MAX_MOTIONS, SCROLL_POS_MAX, SCROLL_POS_MIN, TextPosition, getScrollPositions, motionsClash, PresentationTemplate, TemplateKind, TEMPLATE_KINDS, TEMPLATE_KIND_LABEL, templateKind } from '../lib/templates';
import { GENERIC_MOTION_DEFAULTS, MOTION_DEFAULTS, MOTION_PRESETS } from '../lib/designPresets';
import {
  FONT_OPTIONS, canListLocalFonts, fontLabel, getLocalFonts, loadLocalFonts, loadLocalFontsIfAllowed, localFontValue, subscribeLocalFonts,
} from '../lib/fonts';
import { getInstalledFontFamilies, subscribeInstalledFonts } from '../lib/fontStore';

/** Small toolbar controls shared by Design mode and the stage layout designer */

/** 'draft' = shown on the canvas only (mid-drag); 'commit' = saved and sent to the screens */
export type Phase = 'draft' | 'commit';

/** What Design mode is designing: the song slides, or how scripture looks on the screen */
export type DesignFor = 'lyrics' | 'scripture' | 'declaration' | 'overlay';

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
  // The lists (a hundred or more computer fonts) are built once and reused, not on every redraw
  const builtIn = useMemo(() => FONT_OPTIONS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>), []);
  const installedOptions = useMemo(() => installed.map(f => <option key={`i-${f}`} value={localFontValue(f)} style={{ fontFamily: localFontValue(f) }}>{f}</option>), [installed]);
  const localOptions = useMemo(() => (local || []).map(f => <option key={f} value={localFontValue(f)} style={{ fontFamily: localFontValue(f) }}>{f}</option>), [local]);
  const choose = (v: string) => {
    if (v === '__type') {
      void askText('Type the name of a font installed on this computer (for example Segoe UI or Calibri)').then(name => { if (name) onChange(localFontValue(name)); });
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
          {builtIn}
        </optgroup>
        {installed.length > 0 && (
          <optgroup label="Installed with templates">
            {installedOptions}
          </optgroup>
        )}
        {local && local.length > 0 && (
          <optgroup label="On this computer">
            {localOptions}
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
    <div className="flex rounded overflow-hidden shrink-0" title="Design song slides, declarations, or how Bible verses look on this screen">
      <button type="button" onClick={() => onChange('lyrics')} className={segBtn(value === 'lyrics')}>For songs</button>
      <button type="button" onClick={() => onChange('declaration')} className={segBtn(value === 'declaration')}>For declarations</button>
      <button type="button" onClick={() => onChange('scripture')} className={segBtn(value === 'scripture')}>For scripture</button>
      <button type="button" onClick={() => onChange('overlay')} className={segBtn(value === 'overlay')} data-design-for-overlay>For overlays</button>
    </div>
  );
}

/**
 * The template in use, as a small chip with its name; clicking it opens the full (grouped) list.
 * Where the template comes from is in the tooltip, so the header stays short.
 */
export function TemplateChip({ name, value, onChange, title, disabled = false, children, ...rest }: {
  name: string;
  value: string;
  onChange: (id: string) => void;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
  [data: `data-${string}`]: unknown;
}) {
  return (
    <label
      className={`relative flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-md bg-[#1e1e28] border border-white/10 max-w-[180px] min-w-0 shrink ${disabled ? 'opacity-40' : 'hover:border-white/25 cursor-pointer'}`}
      title={title}
      data-template-chip
    >
      <Sparkles size={11} className="text-pink-400 shrink-0" />
      <span className="truncate text-xs font-medium text-white">{name}</span>
      <ChevronDown size={12} className="text-neutral-400 shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default bg-[#1e1e28] text-white text-xs"
        // The list that opens keeps the dark look (the select itself is invisible over the chip)
        style={{ colorScheme: 'dark' }}
        title={title}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

/** Why the screen may not be showing what the canvas shows */
export function StatusBadges({ status }: { status: DesignStatus }) {
  const badges: { text: string; cls: string; title: string }[] = [];
  // (No "Screens off" badge: the Presenting button already shows that)
  if (status.locked) badges.push({ text: 'Locked', cls: 'bg-red-500/15 text-red-400', title: 'This screen is paused on its current slide (Ctrl+1, Ctrl+2… to unpause)' });
  if (status.textCleared) badges.push({ text: 'Text cleared', cls: 'bg-amber-500/15 text-amber-400', title: 'Text is cleared on this screen, so it is not showing right now' });
  if (!badges.length) return null;
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

/** Template choices grouped by what they're for: the kind being designed first, then the others */
export function TemplateOptions({ templates, first }: { templates: PresentationTemplate[]; first: TemplateKind }) {
  return useMemo(() => <TemplateOptionGroups templates={templates} first={first} />, [templates, first]);
}
function TemplateOptionGroups({ templates, first }: { templates: PresentationTemplate[]; first: TemplateKind }) {
  const order: TemplateKind[] = [first, ...TEMPLATE_KINDS.filter(k => k !== first)];
  return (
    <>
      {order.map(kind => {
        const list = templates.filter(t => templateKind(t) === kind).sort((a, b) => a.name.localeCompare(b.name));
        if (!list.length) return null;
        return (
          <optgroup key={kind} label={TEMPLATE_KIND_LABEL[kind]}>
            {list.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

/** Saving a new template: its name, and what it is for (lyrics and declarations never share templates) */
export function SaveTemplateDialog({ initialName, initialKind, onSave, onCancel }: {
  initialName: string;
  initialKind: TemplateKind;
  onSave: (name: string, kind: TemplateKind) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<TemplateKind>(initialKind);
  const save = () => { if (name.trim()) onSave(name.trim(), kind); };
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }} data-save-template-dialog>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#09090B] shadow-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white">Save as template</h3>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); }}
            className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-3 py-2 text-white outline-none focus:border-pink-500"
            data-template-name
          />
        </label>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">This template is for</span>
          <div className="flex rounded-lg overflow-hidden border border-white/10" data-template-kind>
            {TEMPLATE_KINDS.map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 py-2 text-xs font-semibold transition-colors ${kind === k ? 'bg-pink-600 text-white' : 'bg-white/5 text-neutral-400 hover:text-white'}`} data-kind={k}>
                {TEMPLATE_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-500 mt-1.5">It will be listed under {TEMPLATE_KIND_LABEL[kind]}. Stage screens use stage layouts, made in the Stage tab.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-xs text-neutral-300 hover:text-white hover:bg-white/5">Cancel</button>
          <button type="button" disabled={!name.trim()} onClick={save} className="px-5 py-2 rounded-lg text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white disabled:opacity-40" data-save-template>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Foldable rows: a row's label folds it away, leaving a one-line summary (remembered on this computer) ───
export type DesignRowId = 'text' | 'layout' | 'motion' | 'screen';
const ROWS_KEY = 'flowshow_design_rows';
const ROWS_DEFAULT: Record<DesignRowId, boolean> = { text: true, layout: true, motion: false, screen: false };
const readRows = (): Record<DesignRowId, boolean> => {
  try { return { ...ROWS_DEFAULT, ...JSON.parse(localStorage.getItem(ROWS_KEY) || '{}') }; } catch { return { ...ROWS_DEFAULT }; }
};
const rowListeners = new Set<(r: Record<DesignRowId, boolean>) => void>();

/** Which rows are open; shared by every designer */
export function useDesignRows() {
  const [rows, setRows] = useState(readRows);
  useEffect(() => { rowListeners.add(setRows); return () => { rowListeners.delete(setRows); }; }, []);
  const toggle = (id: DesignRowId) => {
    const next = { ...readRows(), [id]: !readRows()[id] };
    try { localStorage.setItem(ROWS_KEY, JSON.stringify(next)); } catch { /* not saved: still works this time */ }
    rowListeners.forEach(fn => fn(next));
  };
  return { isOpen: (id: DesignRowId) => rows[id], toggle };
}

/** The classes for a row: when folded, everything but its label and summary is hidden */
export const rowClass = (open: boolean) => `flex flex-wrap items-center gap-2 ${open ? '' : '[&>*:not([data-row-head])]:hidden'}`;

/** A row's label (click to fold or unfold) and, when folded, what's set in it */
export function RowHead({ label, open, onToggle, summary }: { label: string; open: boolean; onToggle: () => void; summary?: string }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        data-row-head
        aria-expanded={open}
        className="w-16 shrink-0 flex items-center gap-0.5 text-[10px] uppercase font-bold tracking-wider text-neutral-500 hover:text-white transition-colors"
        title={open ? `Fold the ${label} row away` : `Show the ${label} row`}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />} {label}
      </button>
      {!open && summary && <span data-row-head className="text-[11px] text-neutral-500 truncate min-w-0">{summary}</span>}
    </>
  );
}

/** How strongly this screen's background picture or video shows (0–100, over black) */
export function ScreenBackgroundControl({ value, screenName, onChange }: { value: number; screenName: string; onChange: (v: number, phase: Phase) => void }) {
  return (
    <>
      <span title={`How strongly the background picture, video or colour shows on ${screenName}. Lower = darker, words easier to read.`} data-screen-bg-opacity>
        <MiniSlider label="Background opacity" min={0} max={100} step={1} value={value} format={(v) => `${Math.round(v)}%`} onChange={onChange} />
      </span>
      <span className="text-[11px] text-neutral-500">Only {screenName}, live</span>
    </>
  );
}
