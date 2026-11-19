import React, { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';

/** Small toolbar controls shared by Design mode and the stage layout designer */

/** 'draft' = shown on the canvas only (mid-drag); 'commit' = saved and sent to the screens */
export type Phase = 'draft' | 'commit';

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
