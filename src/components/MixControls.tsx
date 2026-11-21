/**
 * Small controls shared by Mix mode and Settings → Styles: a labelled slider and a colour palette.
 * (Apart from MixWorkspace, so Mix itself loads only when opened.)
 */
import React, { useRef } from 'react';
import { ColorField } from './DesignControls';

/** 'draft' while dragging (shown, not saved); 'commit' when let go */
export type Phase = 'draft' | 'commit';

/** A labelled slider for the settings column: dragging shows on the canvas only; letting go saves */
export function Slider({ label, min, max, step, value, format, onChange }: {
  label: string; min: number; max: number; step: number; value: number; format: (v: number) => string;
  onChange: (v: number, phase: Phase) => void;
}) {
  const dragging = useRef(false);
  const changed = useRef(false);
  const last = useRef(value);
  return (
    <label className="flex items-center gap-2 text-[11px] text-neutral-400">
      <span className="w-[72px] shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          last.current = v;
          if (dragging.current) { changed.current = true; onChange(v, 'draft'); } else onChange(v, 'commit');
        }}
        onPointerDown={() => {
          dragging.current = true;
          changed.current = false;
          window.addEventListener('pointerup', () => { dragging.current = false; if (changed.current) onChange(last.current, 'commit'); }, { once: true });
        }}
        className="flex-1 min-w-0 accent-pink-500 cursor-pointer"
        data-mix-slider={label}
      />
      <span className="w-12 text-right font-mono tabular-nums text-neutral-200">{format(value)}</span>
    </label>
  );
}

/** Ready-made colours (worship-friendly washes), plus any colour */
const PALETTE = [
  '#000000', '#ffffff', '#0f172a', '#1e3a8a', '#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6',
  '#059669', '#65a30d', '#facc15', '#f59e0b', '#ea580c', '#dc2626', '#be123c', '#db2777',
  '#c026d3', '#7c3aed', '#4c1d95', '#78350f',
];
export function ColourPalette({ value, onChange }: { value: string; onChange: (v: string, phase: Phase) => void }) {
  const current = value.toLowerCase();
  return (
    <div className="flex flex-wrap items-center gap-1" data-mix-palette>
      {PALETTE.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c, 'commit')}
          className={`w-5 h-5 rounded border transition-transform hover:scale-110 ${current === c ? 'border-white ring-1 ring-white' : 'border-white/15'}`}
          style={{ background: c }}
          title={c}
          data-mix-swatch={c}
        />
      ))}
      <span className="ml-1 flex items-center" title="Any colour">
        <ColorField value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} title="Any colour" onChange={onChange} />
      </span>
    </div>
  );
}
