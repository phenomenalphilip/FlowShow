import React from 'react';
import { Plus, Tv } from 'lucide-react';
import type { OutputSettings, PresentationStyle } from '../App';
import { STAGE_LAYOUTS, stageLayoutFor } from '../lib/stageLayouts';
import { FixedStage } from './FixedStage';

interface StageWorkspaceProps {
  /** Every stage output */
  outputs: OutputSettings[];
  selectedOutputId: string | null;
  onSelectOutput: (id: string) => void;
  /** Stage styles only */
  styles: PresentationStyle[];
  onSetOutputStyle: (outputId: string, styleId: string | undefined) => void;
  onUpdateStyle: (style: PresentationStyle) => void;
  /** Draws what the output shows right now, inside a FixedStage */
  renderScreen: (output: OutputSettings) => React.ReactNode;
  /** Type of the live slide ('lyrics', 'scripture'…), or undefined when nothing is live */
  liveSlideType?: string;
  onAddStageOutput: () => void;
}

const selectCls = 'bg-[#1e1e28] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none cursor-pointer focus:border-pink-500 disabled:opacity-40 disabled:cursor-not-allowed';

/** The Stage tab: what each stage screen shows right now, and which layouts its Stage style uses */
export function StageWorkspace({
  outputs, selectedOutputId, onSelectOutput, styles, onSetOutputStyle, onUpdateStyle, renderScreen, liveSlideType, onAddStageOutput,
}: StageWorkspaceProps) {
  const output = outputs.find(o => o.id === selectedOutputId) || outputs[0];

  if (!output) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#07070a] text-center px-6 select-none">
        <Tv size={40} className="text-amber-400/70" />
        <h2 className="text-lg font-bold text-white">No stage screens yet</h2>
        <p className="text-sm text-neutral-400 max-w-md leading-relaxed">
          A stage screen faces the people on stage. It shows the current and next slide, the section name and the time.
        </p>
        <button type="button" onClick={onAddStageOutput} className="mt-1 px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors">
          <Plus size={15} /> Add a stage screen
        </button>
        <p className="text-[11px] text-neutral-500">You can also add one in Settings → Outputs → New output → Stage.</p>
      </div>
    );
  }

  const style = styles.find(s => s.id === output.styleId);
  const showing = stageLayoutFor(style, { type: liveSlideType });
  const setLayout = (field: 'lyricsStageLayoutId' | 'scriptureStageLayoutId', id: string) => {
    if (style) onUpdateStyle({ ...style, [field]: id });
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#07070a] select-none">
      {/* HEADER: which stage screen, its Stage style and the layouts that style uses */}
      <div className="h-11 px-3 border-b border-[#262635] flex items-center gap-3 shrink-0 bg-[#101015] overflow-x-auto">
        <div className="flex gap-1 p-0.5 bg-black/40 rounded-lg shrink-0">
          {outputs.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelectOutput(o.id)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                o.id === output.id ? 'bg-amber-500 text-black' : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
              title={o.enabled ? undefined : 'Switched off in Settings → Outputs'}
            >
              {o.name}{o.enabled ? '' : ' (off)'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Stage style</span>
          <select
            value={style?.id || ''}
            onChange={(e) => onSetOutputStyle(output.id, e.target.value || undefined)}
            className={`${selectCls} max-w-[160px]`}
          >
            <option value="">(None — ready-made layouts)</option>
            {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {(['lyrics', 'scripture'] as const).map(type => (
          <label key={type} className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">{type === 'lyrics' ? 'Lyrics' : 'Scripture'}</span>
            <select
              value={stageLayoutFor(style, { type }).id}
              disabled={!style}
              onChange={(e) => setLayout(type === 'lyrics' ? 'lyricsStageLayoutId' : 'scriptureStageLayoutId', e.target.value)}
              className={`${selectCls} max-w-[190px]`}
              title={style ? `Stage layout for ${type === 'lyrics' ? 'song' : 'scripture'} slides (changes the style "${style.name}")` : 'Pick a Stage style first'}
            >
              {STAGE_LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        ))}
      </div>

      {/* CANVAS: exactly what the stage screen shows right now */}
      <div className="flex-1 min-h-0 p-3" data-stage-canvas>
        <FixedStage className="w-full h-full">
          <div className="absolute inset-0 bg-black" />
          {renderScreen(output)}
          <div className="absolute inset-0 pointer-events-none z-30" style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.1)' }} />
        </FixedStage>
      </div>

      {/* FOOTER: what's on the canvas */}
      <div className="h-9 px-3 border-t border-[#262635] bg-[#0b0b10] flex items-center gap-2 shrink-0 text-[11px] text-neutral-500 whitespace-nowrap overflow-hidden">
        <span className="text-white font-semibold">{output.name}</span>
        <span>· {liveSlideType ? `showing the ${liveSlideType === 'scripture' ? 'scripture' : 'lyrics'} layout "${showing.name}"` : 'nothing is live yet'}</span>
        <span className="truncate">· {style ? `layout changes apply to every stage screen using "${style.name}"` : 'uses the ready-made layouts'}</span>
      </div>
    </div>
  );
}
