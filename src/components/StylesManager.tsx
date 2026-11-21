import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash, Pencil, Check, X, Sparkles, MonitorPlay, Tv } from 'lucide-react';
import { BUILT_IN_STYLE_IDS, PresentationStyle, ScreenKind, styleKind } from '../App';
import { PresentationTemplate } from '../lib/templates';
import { STAGE_LAYOUTS, STAGE_SAMPLES, StageLayout, stageLayoutFor, STAGE_SLOT_FIELD, STAGE_SLOT_LABEL, stageSlotSlide } from '../lib/stageLayouts';
import { InlineTemplateGrid } from './TemplateGalleryModal';
import { FixedStage } from './FixedStage';
import { StageScreen } from './StageScreen';
import { ColourPalette, Slider } from './MixControls';
import { segBtn } from './DesignControls';
import { DEFAULT_SCREEN_BORDER, ScreenBorderView, type ScreenBorder } from '../lib/mix';

interface StylesManagerProps {
  styles: PresentationStyle[];
  /** Stage layouts made in the Stage tab */
  stageLayouts: StageLayout[];
  templates: PresentationTemplate[];
  /** Make a new style of this kind; returns its id */
  onAdd: (kind: ScreenKind) => string;
  onUpdate: (style: PresentationStyle) => void;
  onDelete: (id: string) => void;
  onReloadTemplates?: () => void;
}

const KIND_INFO: Record<ScreenKind, { title: string; hint: string; Icon: typeof Tv }> = {
  normal: { title: 'Normal style', hint: 'For audience screens: templates for lyrics and scripture', Icon: MonitorPlay },
  stage: { title: 'Stage style', hint: 'For stage screens: what the people on stage see', Icon: Tv },
};

export function StylesManager({ styles, stageLayouts, templates, onAdd, onUpdate, onDelete, onReloadTemplates }: StylesManagerProps) {
  const [selectedId, setSelectedId] = useState<string>(styles[0]?.id || '');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [pickingTemplateFor, setPickingTemplateFor] = useState<'lyrics' | 'scripture' | 'declaration' | null>(null);
  const [templateCategory, setTemplateCategory] = useState('all');
  // "+" asks which kind of style to make
  const [choosingKind, setChoosingKind] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!choosingKind) return;
    const close = (e: PointerEvent) => { if (!addMenuRef.current?.contains(e.target as Node)) setChoosingKind(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [choosingKind]);

  const selected = styles.find(s => s.id === selectedId) || styles[0];

  const update = (patch: Partial<PresentationStyle>) => {
    if (!selected) return;
    onUpdate({ ...selected, ...patch });
  };

  const addStyle = (kind: ScreenKind) => {
    setChoosingKind(false);
    setSelectedId(onAdd(kind));
    setEditingName(false);
  };

  const templateName = (id?: string) =>
    id ? (templates.find(t => t.id === id)?.name || id) : 'None';

  if (pickingTemplateFor) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b border-white/5 shrink-0">
          <button onClick={() => setPickingTemplateFor(null)} className="p-1.5 rounded hover:bg-white/5 text-neutral-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
          <span className="text-sm font-bold text-white">
            Select {pickingTemplateFor === 'lyrics' ? 'Lyrics' : pickingTemplateFor === 'declaration' ? 'Declarations' : 'Scripture'} Template for "{selected?.name}"
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <InlineTemplateGrid
            templates={templates}
            category={templateCategory}
            onCategoryChange={setTemplateCategory}
            onLoadTemplates={() => onReloadTemplates?.()}
            onEdit={() => {}}
            onApplyToSong={(t) => {
              update(pickingTemplateFor === 'lyrics' ? { lyricsTemplateId: t.id }
                : pickingTemplateFor === 'declaration' ? { declarationTemplateId: t.id }
                : { scriptureTemplateId: t.id });
              setPickingTemplateFor(null);
            }}
            activeSongId="__style_picker__"
          />
        </div>
      </div>
    );
  }

  const renderStyleRow = (s: PresentationStyle) => (
    <button
      key={s.id}
      onClick={() => { setSelectedId(s.id); setEditingName(false); }}
      className={`w-full text-left px-3 py-2.5 text-xs font-medium transition-all flex items-center gap-2 group ${
        selected?.id === s.id
          ? 'bg-pink-600/20 text-white border-r-2 border-pink-500'
          : 'text-neutral-400 hover:text-white hover:bg-white/5'
      }`}
    >
      <span
        className="w-3 h-3 rounded-sm border border-white/20 shrink-0"
        style={{ backgroundColor: s.backgroundColor }}
      />
      <span className="truncate flex-1">{s.name}</span>
      {!BUILT_IN_STYLE_IDS.has(s.id) && (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onDelete(s.id); if (selected?.id === s.id) setSelectedId(styles[0]?.id || ''); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all"
          title="Delete"
        >
          <Trash size={11} />
        </span>
      )}
    </button>
  );

  const kind = selected ? styleKind(selected) : 'normal';
  const { Icon: KindIcon } = KIND_INFO[kind];

  return (
    <div className="flex h-full gap-0 overflow-hidden">

      {/* LEFT: style list, Normal styles then Stage styles */}
      <div className="w-48 shrink-0 border-r border-white/5 flex flex-col bg-[#0a0a0f]">
        <div className="p-3 border-b border-white/5 flex items-center justify-between relative" ref={addMenuRef}>
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Styles</span>
          <button
            onClick={() => setChoosingKind(v => !v)}
            className="w-6 h-6 rounded bg-pink-600/20 hover:bg-pink-600 text-pink-400 hover:text-white flex items-center justify-center transition-all"
            title="New style"
          >
            <Plus size={13} />
          </button>
          {choosingKind && (
            <div className="absolute left-2 top-full mt-1 z-20 w-60 py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl" data-new-style-menu>
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">New style for…</div>
              {(['normal', 'stage'] as const).map(k => {
                const { title, hint, Icon } = KIND_INFO[k];
                return (
                  <button key={k} onClick={() => addStyle(k)} className="w-full px-3 py-2 flex items-start gap-2.5 text-left hover:bg-white/5 transition-colors">
                    <Icon size={15} className={`mt-0.5 shrink-0 ${k === 'stage' ? 'text-amber-400' : 'text-pink-400'}`} />
                    <span>
                      <span className="block text-xs font-semibold text-white">{title}</span>
                      <span className="block text-[10px] text-neutral-500 leading-snug">{hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {(['normal', 'stage'] as const).map(k => {
            const list = styles.filter(s => styleKind(s) === k);
            if (list.length === 0) return null;
            return (
              <div key={k}>
                <div className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-neutral-600">{k === 'stage' ? 'Stage' : 'Normal'}</div>
                {list.map(renderStyleRow)}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: style editor */}
      {selected ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
          {/* Name */}
          <div>
            <div className="flex items-center gap-2">
              {editingName ? (
                <>
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { update({ name: nameInput }); setEditingName(false); } if (e.key === 'Escape') setEditingName(false); }}
                    className="bg-[#1e1e28] border border-pink-500 rounded px-2 py-1 text-sm text-white outline-none flex-1"
                  />
                  <button onClick={() => { update({ name: nameInput }); setEditingName(false); }} className="p-1 hover:text-pink-400"><Check size={14} /></button>
                  <button onClick={() => setEditingName(false)} className="p-1 hover:text-red-400"><X size={14} /></button>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                  <button onClick={() => { setNameInput(selected.name); setEditingName(true); }} className="p-1 text-neutral-500 hover:text-white"><Pencil size={13} /></button>
                </>
              )}
            </div>
            <div className={`mt-1 inline-flex items-center gap-1.5 text-[11px] ${kind === 'stage' ? 'text-amber-400' : 'text-pink-400'}`}>
              <KindIcon size={12} /> {KIND_INFO[kind].title}
              <span className="text-neutral-500">· {KIND_INFO[kind].hint}</span>
            </div>
          </div>

          {kind === 'stage' ? (
            <>
              {/* Stage layouts, one for lyrics and one for scripture, with a preview of each */}
              <Section title="Stage layouts">
                {(['lyrics', 'declaration', 'scripture'] as const).map(type => {
                  const layout = stageLayoutFor(selected, stageSlotSlide(type), stageLayouts);
                  const field = STAGE_SLOT_FIELD[type];
                  return (
                    <div key={type} className="px-4 py-3 flex items-start gap-4">
                      <div className="w-40 shrink-0 space-y-1.5">
                        <span className="block text-xs text-neutral-400">{STAGE_SLOT_LABEL[type].title}</span>
                        <select
                          value={layout.id}
                          onChange={e => update({ [field]: e.target.value })}
                          className="w-full bg-[#1e1e28] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none cursor-pointer"
                          title={`Stage layout for ${STAGE_SLOT_LABEL[type].noun} slides`}
                        >
                          <optgroup label="Ready-made">
                            {STAGE_LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </optgroup>
                          {stageLayouts.length > 0 && (
                            <optgroup label="Your layouts">
                              {stageLayouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </optgroup>
                          )}
                        </select>
                        <span className="block text-[10px] text-neutral-500 leading-snug">{layout.description || 'Your own layout, made in the Stage tab.'}</span>
                      </div>
                      <div className="flex-1 min-w-0 aspect-video rounded-lg overflow-hidden border border-white/10 bg-black" data-stage-preview={type}>
                        <FixedStage className="w-full h-full pointer-events-none">
                          <StageScreen
                            layout={layout}
                            slide={STAGE_SAMPLES[type].slide}
                            nextSlide={STAGE_SAMPLES[type].next}
                            songTitle={STAGE_SAMPLES[type].songTitle}
                            background={selected.backgroundColor}
                          />
                        </FixedStage>
                      </div>
                    </div>
                  );
                })}
              </Section>

              <Section title="Background">
                <Row label="Color">
                  <input
                    type="color"
                    value={selected.backgroundColor}
                    onChange={e => update({ backgroundColor: e.target.value })}
                    className="h-8 w-14 cursor-pointer border-none bg-transparent rounded"
                  />
                  <span className="text-xs text-neutral-400 font-mono">{selected.backgroundColor}</span>
                </Row>
              </Section>
            </>
          ) : (
            <>
              {/* Background */}
              <Section title="Background">
                <Row label="Color">
                  <input
                    type="color"
                    value={selected.backgroundColor}
                    onChange={e => update({ backgroundColor: e.target.value })}
                    className="h-8 w-14 cursor-pointer border-none bg-transparent rounded"
                  />
                  <span className="text-xs text-neutral-400 font-mono">{selected.backgroundColor}</span>
                </Row>
                <Row label="Transition">
                  <select
                    value={selected.transition}
                    onChange={e => update({ transition: e.target.value as PresentationStyle['transition'] })}
                    className="bg-[#1e1e28] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="none">None</option>
                    <option value="fade">Fade</option>
                    <option value="slide">Slide</option>
                    <option value="zoom">Zoom</option>
                  </select>
                </Row>
                <Row label="Media fit">
                  <select
                    value={selected.mediaFit}
                    onChange={e => update({ mediaFit: e.target.value as PresentationStyle['mediaFit'] })}
                    className="bg-[#1e1e28] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="contain">Contain</option>
                    <option value="cover">Cover</option>
                    <option value="fill">Fill</option>
                    <option value="none">None</option>
                  </select>
                </Row>
                <Row label="Aspect ratio">
                  <select
                    value={selected.aspectRatio}
                    onChange={e => update({ aspectRatio: e.target.value as PresentationStyle['aspectRatio'] })}
                    className="bg-[#1e1e28] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none cursor-pointer"
                  >
                    <option value="16:9">16:9</option>
                    <option value="4:3">4:3</option>
                    <option value="1:1">1:1</option>
                  </select>
                </Row>
              </Section>

              {/* Screen border */}
              <ScreenBorderSection border={selected.border} onChange={(border) => update({ border })} />

              {/* Active Layers */}
              <Section title="Active layers">
                {(['background', 'slide', 'overlays'] as const).map(layer => (
                  <React.Fragment key={layer}><Row label={layer.charAt(0).toUpperCase() + layer.slice(1)}>
                    <Toggle
                      checked={selected.activeLayers[layer]}
                      onChange={v => update({ activeLayers: { ...selected.activeLayers, [layer]: v } })}
                    />
                  </Row></React.Fragment>
                ))}
              </Section>

              {/* Templates */}
              <Section title="Slide templates">
                <Row label="Lyrics / Songs">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-300 truncate max-w-[120px]">{templateName(selected.lyricsTemplateId)}</span>
                    <button
                      onClick={() => { setTemplateCategory('all'); setPickingTemplateFor('lyrics'); }}
                      className="p-1 rounded bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 hover:text-white transition-all"
                      title="Pick lyrics template"
                    >
                      <Sparkles size={12} />
                    </button>
                    {selected.lyricsTemplateId && (
                      <button onClick={() => update({ lyricsTemplateId: undefined })} className="p-1 hover:text-red-400 text-neutral-500 transition-colors">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </Row>
                <Row label="Declarations">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs text-neutral-300 truncate max-w-[120px]"
                      title={selected.declarationTemplateId ? 'The slides of Declaration shows use this template' : 'Declarations use the lyrics template until you pick one'}
                    >
                      {selected.declarationTemplateId ? templateName(selected.declarationTemplateId) : "Each screen's own"}
                    </span>
                    <button
                      onClick={() => { setTemplateCategory('all'); setPickingTemplateFor('declaration'); }}
                      className="p-1 rounded bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 hover:text-white transition-all"
                      title="Pick declarations template"
                    >
                      <Sparkles size={12} />
                    </button>
                    {selected.declarationTemplateId && (
                      <button onClick={() => update({ declarationTemplateId: undefined })} className="p-1 hover:text-red-400 text-neutral-500 transition-colors">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </Row>
                <Row label="Scripture">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs text-neutral-300 truncate max-w-[120px]"
                      title={selected.scriptureTemplateId ? 'Every screen on this style shows scripture in this template' : "Each screen uses its own scripture template (set in Design mode → For scripture)"}
                    >
                      {selected.scriptureTemplateId ? templateName(selected.scriptureTemplateId) : "Each screen's own"}
                    </span>
                    <button
                      onClick={() => { setTemplateCategory('scripture'); setPickingTemplateFor('scripture'); }}
                      className="p-1 rounded bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 hover:text-white transition-all"
                      title="Pick scripture template"
                    >
                      <Sparkles size={12} />
                    </button>
                    {selected.scriptureTemplateId && (
                      <button onClick={() => update({ scriptureTemplateId: undefined })} className="p-1 hover:text-red-400 text-neutral-500 transition-colors">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </Row>
              </Section>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
          Select a style or create one.
        </div>
      )}
    </div>
  );
}

// ─── Screen border ────────────────────────────────────────────────────────────

/**
 * A border on every screen with this style: a window (rectangle, rounded or oval); everything outside it is covered
 * (black, or any colour), over everything that shows, with an optional edge line. It stays the same for songs,
 * scripture and declarations.
 */
function ScreenBorderSection({ border, onChange }: { border: ScreenBorder | undefined; onChange: (b: ScreenBorder | undefined) => void }) {
  const b = border;
  const set = (patch: Partial<ScreenBorder>) => onChange({ ...(b || DEFAULT_SCREEN_BORDER), ...patch });
  // The window's margins from the screen's edges (left/right and top/bottom, in % of the screen), kept centred
  const marginX = b ? Math.round(b.layout.x * 1000) / 10 : 3;
  const marginY = b ? Math.round(b.layout.y * 1000) / 10 : 5;
  const setMargins = (mx: number, my: number) => set({ layout: { x: mx / 100, y: my / 100, width: 1 - (2 * mx) / 100, height: 1 - (2 * my) / 100 } });
  return (
    <Section title="Screen border">
      <Row label="Border">
        <Toggle checked={!!b?.on} onChange={(v) => onChange(v ? { ...(b || DEFAULT_SCREEN_BORDER), on: true } : b ? { ...b, on: false } : undefined)} />
      </Row>
      {b?.on && (
        <div className="px-4 py-3 space-y-3" data-style-border>
          <p className="text-[11px] text-neutral-500 leading-snug">On every slide of every screen with this style (songs, scripture and declarations alike), over everything: outside the shape stays covered, whatever you show.</p>
          {/* A small preview */}
          <div className="relative w-full max-w-[320px] mx-auto aspect-video rounded overflow-hidden" style={{ background: 'repeating-linear-gradient(45deg, #334155 0 12px, #475569 12px 24px)' }}>
            <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm font-bold tracking-wide">Your slides</div>
            <ScreenBorderPreview border={b} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-400">
            <span className="w-[72px] shrink-0">Shape</span>
            <div className="flex rounded overflow-hidden">
              {([['rect', 'Rectangle'], ['rounded', 'Rounded'], ['oval', 'Oval']] as const).map(([s, label]) => (
                <button key={s} type="button" onClick={() => set({ shape: s })} className={segBtn(b.shape === s)} data-style-border-shape={s}>{label}</button>
              ))}
            </div>
          </div>
          {b.shape === 'rounded' && <Slider label="Corners" min={0} max={540} step={1} value={b.radius} format={(v) => `${v}px`} onChange={(v) => set({ radius: v })} />}
          <Slider label="Left / right" min={0} max={45} step={0.5} value={marginX} format={(v) => `${v}%`} onChange={(v) => setMargins(v, marginY)} />
          <Slider label="Top / bottom" min={0} max={45} step={0.5} value={marginY} format={(v) => `${v}%`} onChange={(v) => setMargins(marginX, v)} />
          <div>
            <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
              <span>Outside</span>
              <button type="button" onClick={() => set({ outside: b.outside === 'transparent' ? '#000000' : 'transparent' })} className="text-neutral-500 hover:text-white">
                {b.outside === 'transparent' ? 'Cover it' : 'Don’t cover'}
              </button>
            </div>
            {b.outside === 'transparent'
              ? <p className="text-[11px] text-neutral-500">Not covered: only the edge line shows.</p>
              : <ColourPalette value={b.outside} onChange={(v) => set({ outside: v })} />}
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] text-neutral-400">Edge line</div>
            <ColourPalette value={b.color} onChange={(v) => set({ color: v })} />
            <Slider label="Thickness" min={0} max={120} step={1} value={b.width} format={(v) => v ? `${v}px` : 'none'} onChange={(v) => set({ width: v })} />
            {b.width > 0 && <Slider label="Glow" min={0} max={200} step={1} value={b.glow} format={(v) => v ? `${v}px` : 'none'} onChange={(v) => set({ glow: v })} />}
          </div>
        </div>
      )}
    </Section>
  );
}

/** The border drawn small: px values are for a 1920×1080 screen, so it's drawn at that size and scaled down */
function ScreenBorderPreview({ border }: { border: ScreenBorder }) {
  return (
    <div className="absolute inset-0">
      <FixedStage className="w-full h-full">
        {() => <ScreenBorderView border={border} />}
      </FixedStage>
    </div>
  );
}

// ─── Small layout helpers ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111118] border border-white/5 rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-white/5 bg-[#0d0d14]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{title}</span>
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-neutral-400">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-9 h-5 bg-neutral-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600" />
    </label>
  );
}
