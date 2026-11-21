import React, { useEffect, useRef, useState } from 'react';
import { useDeleteKey } from '../lib/deleteKey';
import { askText } from '../lib/appDialogs';
import { AlignCenter, AlignLeft, AlignRight, Check, Copy, Eye, EyeOff, Image as ImageIcon, Monitor as MonitorIcon, Pencil, Play, RotateCcw } from 'lucide-react';
import { DesignMediaControls, chooseDesignMediaFile, newDesignMedia, type DesignMedia } from '../lib/designMedia';
import type { OutputSettings, SlideDefinition } from '../App';
import {
  PresentationTemplate, AnimationConfig, AnimationType, FALLBACK_ANIMATION, SCRIPTURE_SAMPLES, DECLARATION_SAMPLES, saveTemplate, deleteTemplate,
} from '../lib/templates';
import { FONT_OPTIONS, MOTION_PRESETS, LAYOUT_PRESETS, SHADOW_PRESETS, MOTION_DEFAULTS, GENERIC_MOTION_DEFAULTS } from '../lib/designPresets';
import { FixedStage } from './FixedStage';
import { BOX_COLOR_KEY, BOX_OPACITY_KEY, CONTRAST_KEY, readabilityOf } from '../lib/readability';
import { DesignBox, Rect, getPlacement, placeAcross, placeDown, resizeBox } from './DesignCanvas';
import {
  Phase, WEIGHTS, selectCls, segBtn, smallBtn, GroupLabel, Divider, SizeStepper, NumField, ColorField, MiniSlider,
  TemplateChip, DesignFor, DesignForSwitch, TemplateOptions, useDesignRows, rowClass, RowHead, ScreenBackgroundControl, DesignStatus, StatusBadges, Notice, MotionOptions, MotionLayers, ExitSelect, TextPositionSwitch, FontSelect,
} from './DesignControls';

/** Where a screen's scripture template is kept: in its style (shared by the screens on that style), or on the screen */
export type ScriptureScope = { kind: 'style'; styleName: string; screens: string[] } | { kind: 'screen' };

interface ScriptureDesignWorkspaceProps {
  /** Designing how scripture looks, or the Declarations template */
  kind?: 'scripture' | 'declaration';
  outputs: OutputSettings[];
  selectedOutputId: string;
  onSelectOutput: (id: string) => void;
  onDesignFor: (v: DesignFor) => void;
  templates: PresentationTemplate[];
  /** The template scripture uses on this screen */
  template: PresentationTemplate;
  scope: ScriptureScope;
  /** Use another template for scripture on this screen (in its style, when the style sets scripture) */
  onUseTemplate: (templateId: string) => void;
  /** This screen's style turns slide text off */
  textHidden: boolean;
  /** This screen's background opacity (0–100) and how to change it (live) */
  backgroundOpacity?: number;
  onBackgroundOpacity?: (v: number, phase: Phase) => void;
  styleName?: string;
  status: DesignStatus;
  /** A real verse to design with: the one on this screen, or the one in preview */
  verse: SlideDefinition | null;
  verseOnAir: boolean;
  /** Draws the screen showing this slide in this template (which may be an unfinished edit) */
  renderOutput: (slide: SlideDefinition, template: PresentationTemplate) => React.ReactNode;
  onGoLive: (slide: SlideDefinition) => void;
}

type Part = 'verse' | 'reference';
/** One undoable change: a template before and after (null = it didn't exist yet), and the template in use before and after */
type Step = { templateId?: string; before?: PresentationTemplate | null; after?: PresentationTemplate; usedBefore: string; usedAfter: string; at: number };

const UNDO_MERGE_MS = 500;
const UNDO_LIMIT = 100;
const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'reset', 'file']);
/** Where text sits when a template doesn't say (as on the screens) */
const WHOLE_SCREEN: Rect = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 };

const parseNum = (v: unknown, fallback: number) => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};
const toPct = (v: number) => Math.round(v * 1000) / 10;
const placementLabel = (v: number, start: string, end: string) => v <= 0 ? start : v >= 100 ? end : v === 50 ? 'Centre' : `${v}%`;
const verseBoxOf = (t: PresentationTemplate): Rect => ({ ...WHOLE_SCREEN, ...(t.styles.layout || {}) });
/** Where a reference without a box of its own gets one: just under the verse */
const referenceBoxUnder = (verse: Rect): Rect => {
  const height = 0.07;
  return { x: verse.x, y: Math.min(1 - height, verse.y + verse.height + 0.02), width: verse.width, height };
};
/** How a reference looks when it first gets a box of its own */
const newReferenceStyle = (t: PresentationTemplate): React.CSSProperties => ({
  fontFamily: 'Inter, sans-serif', fontWeight: '700', fontSize: '40px', color: '#fbbf24', textTransform: 'uppercase',
  letterSpacing: '0.12em', textAlign: t.styles.global?.textAlign || 'center',
});
const sampleSlide = (id: string, declaration: boolean): SlideDefinition => {
  if (declaration) {
    const d = DECLARATION_SAMPLES.find(x => x.id === id) || DECLARATION_SAMPLES[0];
    return { id: `declaration-sample-${d.id}`, type: 'lyrics', declaration: true, text: d.text };
  }
  const s = SCRIPTURE_SAMPLES.find(x => x.id === id) || SCRIPTURE_SAMPLES[1];
  return { id: `scripture-sample-${s.id}`, type: 'scripture', text: s.text, source: s.source };
};

/** Design mode, for scripture: how Bible verses and their references look on one screen. Edits change the screen's scripture template. */
export function ScriptureDesignWorkspace({
  kind = 'scripture', outputs, selectedOutputId, onSelectOutput, onDesignFor, templates, template, scope, onUseTemplate,
  textHidden, styleName, status, verse, verseOnAir, renderOutput, onGoLive, backgroundOpacity, onBackgroundOpacity,
}: ScriptureDesignWorkspaceProps) {
  const isDeclaration = kind === 'declaration';
  // Words used on screen: "verse" / "declaration"
  const noun = isDeclaration ? 'declaration' : 'scripture';
  const [part, setPartRaw] = useState<Part>('verse');
  // A picture or video of the template picked on the canvas
  const [mediaSel, setMediaSel] = useState<string | null>(null);
  const setPart = (p: Part) => { setMediaSel(null); setPartRaw(p); };
  // An unfinished change (mid-drag, colour being picked): canvas only, never on the screens
  const [draft, setDraft] = useState<PresentationTemplate | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [replayKey, setReplayKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // The verse on the canvas: the real one ('verse') or a sample
  const [previewWith, setPreviewWith] = useState('verse');
  const history = useRef<{ past: Step[]; future: Step[] }>({ past: [], future: [] });

  const outputName = outputs.find(o => o.id === selectedOutputId)?.name || 'this screen';
  const shown = draft ?? template;
  // Only your own scripture templates change in place; anything else is copied on the first change
  const ownTemplate = !!template.isCustom && template.category === (isDeclaration ? 'declaration' : 'scripture');
  const canDesign = !textHidden;
  const previewValue = previewWith === 'verse' && !verse ? (isDeclaration ? 'short' : 'typical') : previewWith;
  const usingSample = previewValue !== 'verse';
  const canvasSlide = usingSample ? sampleSlide(previewValue, isDeclaration) : verse!;
  const samples = isDeclaration ? DECLARATION_SAMPLES : SCRIPTURE_SAMPLES;

  useEffect(() => { setDraft(null); }, [selectedOutputId, template.id]);
  useEffect(() => { setPart('verse'); setPreviewWith('verse'); }, [kind]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // ─── Undo (Ctrl+Z / Ctrl+Y undo template changes here) ───
  const latest = useRef({ onUseTemplate, templateId: template.id });
  latest.current = { onUseTemplate, templateId: template.id };

  const record = (step: Omit<Step, 'at'>) => {
    const h = history.current;
    const now = Date.now();
    const last = h.past[h.past.length - 1];
    // Quick changes to the same template count as one step
    if (last && now - last.at < UNDO_MERGE_MS && step.templateId && last.templateId === step.templateId
      && step.usedBefore === step.usedAfter && last.usedAfter === step.usedBefore) {
      last.after = step.after;
      last.at = now;
    } else {
      h.past.push({ ...step, at: now });
      if (h.past.length > UNDO_LIMIT) h.past.shift();
    }
    h.future = [];
  };

  useEffect(() => {
    const apply = (s: Step, undo: boolean) => {
      const t = undo ? s.before : s.after;
      const use = undo ? s.usedBefore : s.usedAfter;
      if (s.templateId && t) void saveTemplate(t);
      if (use !== latest.current.templateId) latest.current.onUseTemplate(use);
      // A copy made by the change goes away again (after the screen has stopped using it)
      if (s.templateId && !t) void deleteTemplate(s.templateId);
    };
    const step = (undo: boolean) => {
      const h = history.current;
      const s = (undo ? h.past : h.future).pop();
      if (!s) { setNotice(undo ? 'Nothing to undo' : 'Nothing to redo'); return; }
      (undo ? h.future : h.past).push(s);
      setDraft(null);
      apply(s, undo);
      setNotice(undo ? 'Undone' : 'Redone');
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
      if (!isUndo && !isRedo) return;
      // While typing, Ctrl+Z undoes the typing instead
      const el = e.target as HTMLElement | null;
      if (el instanceof HTMLTextAreaElement || el?.isContentEditable || (el instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(el.type))) return;
      e.preventDefault();
      step(isUndo);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── Saving ───
  const uniqueName = (base: string) => {
    const names = new Set(templates.map(t => t.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  };
  const ownCopyOf = (t: PresentationTemplate, name: string, description: string): PresentationTemplate => ({
    ...t, id: `scripture-${Date.now().toString(36)}`, name: uniqueName(name), category: isDeclaration ? 'declaration' : 'scripture', isCustom: true,
    badge: 'Custom', tagline: 'Made in Design mode', description,
  });

  // Every edit goes through here. A ready-made template (or one made for lyrics) is never changed:
  // the first change saves your own scripture copy, and this screen uses it from then on.
  const change = (fn: (t: PresentationTemplate) => PresentationTemplate, phase: Phase = 'commit') => {
    if (phase === 'draft') { setDraft(prev => fn(prev ?? template)); return; }
    setDraft(null);
    const next = fn(template);
    if (ownTemplate) {
      record({ templateId: template.id, before: template, after: next, usedBefore: template.id, usedAfter: template.id });
      void saveTemplate(next);
      return;
    }
    const copy = ownCopyOf(next, `${template.name} (my copy)`, `Your own ${noun} look, started from "${template.name}".`);
    record({ templateId: copy.id, before: null, after: copy, usedBefore: template.id, usedAfter: copy.id });
    void saveTemplate(copy);
    onUseTemplate(copy.id);
    setNotice(`Saved as your own template "${copy.name}". "${template.name}" is unchanged.`);
  };

  const verseBox = verseBoxOf(shown);
  const referenceHasBox = !!shown.styles.sourceLayout;
  const referenceBox = shown.styles.sourceLayout || referenceBoxUnder(verseBox);

  // The reference gets a box of its own the first time it is changed
  const withReferenceBox = (t: PresentationTemplate, styles: Partial<PresentationTemplate['styles']>): PresentationTemplate => ({
    ...t,
    styles: {
      ...t.styles,
      sourceGlobal: t.styles.sourceGlobal || newReferenceStyle(t),
      sourceLayout: t.styles.sourceLayout || referenceBoxUnder(verseBoxOf(t)),
      ...styles,
    },
  });
  const setTextStyle = (patch: React.CSSProperties, phase: Phase = 'commit') => change(t => part === 'verse'
    ? { ...t, styles: { ...t.styles, global: { ...(t.styles.global || {}), ...patch } } }
    : withReferenceBox(t, { sourceGlobal: { ...(t.styles.sourceGlobal || newReferenceStyle(t)), ...patch } }), phase);
  const setBoxOf = (which: Part, patch: Partial<Rect>, phase: Phase) => change(t => which === 'verse'
    ? { ...t, styles: { ...t.styles, layout: { ...verseBoxOf(t), ...patch } } }
    : withReferenceBox(t, { sourceLayout: { ...(t.styles.sourceLayout || referenceBoxUnder(verseBoxOf(t))), ...patch } }), phase);
  const setBox = (patch: Partial<Rect>, phase: Phase = 'commit') => setBoxOf(part, patch, phase);
  const setAnim = (patch: Partial<AnimationConfig>, phase: Phase = 'commit') =>
    change(t => ({ ...t, animation: { ...(t.animation || FALLBACK_ANIMATION), ...patch } as AnimationConfig }), phase);
  const setMotionType = (type: AnimationType) => setAnim({ type, ...(MOTION_DEFAULTS[type] || GENERIC_MOTION_DEFAULTS) });

  // Pictures and videos belong to the template (everything shown in it has them, under the words)
  const mediaItems = shown.styles.media || [];
  const selectedMedia = mediaSel ? mediaItems.find(m => m.id === mediaSel) : undefined;
  const setMedia = (fn: (list: DesignMedia[]) => DesignMedia[], phase: Phase = 'commit') => change(t => {
    const media = fn(t.styles.media || []);
    return { ...t, styles: { ...t.styles, media: media.length ? media : undefined } };
  }, phase);
  const changeMedia = (id: string, patch: Partial<DesignMedia>, phase: Phase = 'commit') =>
    setMedia(list => list.map(m => m.id === id ? { ...m, ...patch } : m), phase);
  const addMedia = async () => {
    const file = await chooseDesignMediaFile();
    if (!file) return;
    const item = newDesignMedia(file);
    setMedia(list => [...list, item]);
    setMediaSel(item.id);
  };
  const replaceMedia = async (id: string) => {
    const file = await chooseDesignMediaFile();
    if (file) changeMedia(id, { type: file.type, name: file.name, path: file.path, storedId: file.storedId });
  };
  const removeMedia = (id: string) => { setMedia(list => list.filter(m => m.id !== id)); setMediaSel(null); };
  // Delete removes the picked picture or video
  useDeleteKey(() => { if (!selectedMedia) return false; removeMedia(selectedMedia.id); return true; });
  const moveMedia = (id: string, dir: 1 | -1) => setMedia(list => {
    const next = [...list];
    const at = next.findIndex(m => m.id === id);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= next.length) return list;
    [next[at], next[to]] = [next[to], next[at]];
    return next;
  });

  // ─── Choosing templates ───
  const chooseTemplate = (id: string) => {
    if (!id || id === template.id) return;
    record({ usedBefore: template.id, usedAfter: id });
    setDraft(null);
    onUseTemplate(id);
  };
  const copyTemplate = () => {
    const copy = ownCopyOf(template, `${template.name} (copy)`, `A copy of "${template.name}", made in Design mode.`);
    record({ templateId: copy.id, before: null, after: copy, usedBefore: template.id, usedAfter: copy.id });
    void saveTemplate(copy);
    onUseTemplate(copy.id);
    setNotice(`Copied to "${copy.name}"`);
  };
  const renameTemplate = async () => {
    const name = await askText(`Name for this ${noun} template`, template.name, { okLabel: 'Rename' });
    if (!name || name === template.name) return;
    const next = { ...template, name };
    record({ templateId: template.id, before: template, after: next, usedBefore: template.id, usedAfter: template.id });
    void saveTemplate(next);
  };

  // ─── What the toolbar shows ───
  const g: React.CSSProperties = part === 'verse' ? (shown.styles.global || {}) : (shown.styles.sourceGlobal || newReferenceStyle(shown));
  const box = part === 'verse' ? verseBox : referenceBox;
  const placement = getPlacement(box);
  const anim = shown.animation;
  const rows = useDesignRows();
  const colorValue = /^#[0-9a-f]{6}$/i.test(String(g.color || '')) ? String(g.color) : '#ffffff';
  const shadowValue = String(g.textShadow || 'none');
  // The size the screens use when the template doesn't set one
  const defaultSize = part === 'verse' ? 90 : 110;
  // Declarations can use any template except the scripture ones
  const scriptureTemplates = templates.filter(t => t.category === (isDeclaration ? 'declaration' : 'scripture'));
  const otherTemplates = templates.filter(t => t.category !== 'scripture' && t.category !== 'declaration');
  const scopeText = scope.kind === 'style'
    ? `Set by style "${scope.styleName}"${scope.screens.filter(n => n !== outputName).length ? ` · also on ${scope.screens.filter(n => n !== outputName).join(', ')}` : ''}`
    : `Used on ${outputName}`;
  const changesWhere = scope.kind === 'style' ? `the screens using "${scope.styleName}"` : outputName;

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#07070a] select-none" data-scripture-design>
      {/* HEADER: which screen, lyrics or scripture, and the scripture template */}
      <div className="h-11 px-3 border-b border-[#262635] flex items-center gap-3 shrink-0 bg-[#101015]">
        <div className="flex gap-1 p-0.5 bg-black/40 rounded-lg shrink-0">
          {outputs.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelectOutput(o.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${o.id === selectedOutputId ? 'bg-[var(--fs-second)] text-[var(--fs-second-text)] shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
              title={`Design what ${o.name} shows`}
              data-design-output={o.id}
            >
              <MonitorIcon size={12} className={o.id === selectedOutputId ? 'opacity-70' : 'text-neutral-500'} />
              {o.name}
            </button>
          ))}
        </div>
        <DesignForSwitch value={kind} onChange={onDesignFor} />

        <div className="flex items-center gap-1 min-w-0">
          <TemplateChip
            name={template.name}
            value={template.id}
            onChange={chooseTemplate}
            title={`The ${noun} template on ${outputName} (${scopeText}). Click to choose another.`}
          >
            {!templates.some(t => t.id === template.id) && <option value={template.id}>{template.name}</option>}
            <TemplateOptions templates={templates} first={isDeclaration ? 'declaration' : 'scripture'} />
          </TemplateChip>
          <button type="button" onClick={copyTemplate} className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-white/10 shrink-0" title="Make a copy of this template to change" data-template-copy>
            <Copy size={13} />
          </button>
          {ownTemplate && (
            <button type="button" onClick={renameTemplate} className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-white/10 shrink-0" title="Rename this template" data-template-rename>
              <Pencil size={13} />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <StatusBadges status={status} />
          <button
            type="button"
            onClick={() => setShowGuides(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${showGuides ? 'text-white bg-white/10' : 'text-neutral-500 hover:text-white'}`}
            title="Show or hide the box outlines"
          >
            {showGuides ? <Eye size={13} /> : <EyeOff size={13} />} Guides
          </button>
          <button
            type="button"
            onClick={() => setReplayKey(k => k + 1)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
            title="Replay the animation here (the screens are not affected)"
          >
            <RotateCcw size={13} /> Replay
          </button>
        </div>
      </div>

      {/* TOOLBAR: changes the verse or the reference in this screen's scripture template */}
      <fieldset disabled={!canDesign} className={`min-w-0 border-0 p-0 m-0 shrink-0 ${canDesign ? '' : 'opacity-40'}`}>
        <div className="px-3 py-2 space-y-2 border-b border-[#262635] bg-[#0d0d12]">
          <div className="flex flex-wrap items-center gap-2">
            <GroupLabel fixed>Boxes</GroupLabel>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => setPart('verse')} className={`${smallBtn} ${part === 'verse' ? 'bg-pink-600 text-white' : 'bg-[#1e1e28] text-neutral-300 hover:text-white'}`} title={isDeclaration ? 'The words of the declaration' : 'The words of the verse'}>
                {isDeclaration ? 'Words' : 'Verse'}
              </button>
              {!isDeclaration && <button
                type="button"
                onClick={() => setPart('reference')}
                className={`${smallBtn} ${part === 'reference' ? 'bg-pink-600 text-white' : 'bg-[#1e1e28] text-neutral-300 hover:text-white'}`}
                title={referenceHasBox ? 'Where the verse is from, e.g. John 3:16' : 'The reference sits under the verse for now. Change anything to give it a box of its own.'}
              >
                Reference
              </button>}
              {mediaItems.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMediaSel(m.id)}
                  className={`${smallBtn} flex items-center gap-1 ${selectedMedia?.id === m.id ? 'bg-pink-600 text-white' : 'bg-[#1e1e28] text-neutral-300 hover:text-white'}`}
                  title={m.name}
                  data-design-media-chip={m.id}
                >
                  <ImageIcon size={11} /> {m.type === 'video' ? 'Video' : 'Picture'} {i + 1}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void addMedia()} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title={`Put a picture or video in this template (every ${isDeclaration ? 'declaration slide' : 'verse'} using it shows it). Drag it and its corners to place it.`} data-design-add-media>
              <ImageIcon size={11} /> Add media
            </button>
            {!ownTemplate && <span className="text-[11px] text-neutral-500">Ready-made: your first change saves your own copy</span>}
          </div>

          {selectedMedia && (
            <div className="flex flex-wrap items-center gap-2" data-design-row="media">
              <GroupLabel fixed>Media</GroupLabel>
              <DesignMediaControls
                item={selectedMedia}
                onChange={(patch, phase) => changeMedia(selectedMedia.id, patch, phase)}
                onReplace={() => void replaceMedia(selectedMedia.id)}
                onRemove={() => removeMedia(selectedMedia.id)}
              />
              {mediaItems.length > 1 && (
                <>
                  <Divider />
                  <button type="button" onClick={() => moveMedia(selectedMedia.id, 1)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10`} title="In front of the other media (words always stay on top)">Forward</button>
                  <button type="button" onClick={() => moveMedia(selectedMedia.id, -1)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10`} title="Behind the other media">Backward</button>
                </>
              )}
              <button type="button" onClick={() => setMediaSel(null)} className={`${smallBtn} text-neutral-400 hover:text-white`} title="Back to the text settings">Done</button>
            </div>
          )}

          {/* The text rows: hidden while a picture or video is picked */}
          <div className={selectedMedia ? 'hidden' : 'contents'}>
          <div className={rowClass(rows.isOpen('text'))} data-design-row="text">
            <RowHead label="Text" open={rows.isOpen('text')} onToggle={() => rows.toggle('text')}
              summary={`${String(g.fontFamily || 'Inter').split(',')[0].replace(/['"]/g, '')} · ${parseNum(g.fontSize, defaultSize)}px${readabilityOf(g).contrast ? ` · contrast ${Math.round(readabilityOf(g).contrast)}` : ''}`} />
            <FontSelect value={String(g.fontFamily || '')} onChange={(v) => setTextStyle({ fontFamily: v })} />
            <SizeStepper value={parseNum(g.fontSize, defaultSize)} onChange={(v) => setTextStyle({ fontSize: `${v}px` })} />
            <select value={String(g.fontWeight || '700')} onChange={(e) => setTextStyle({ fontWeight: e.target.value })} className={selectCls} title="Weight">
              {WEIGHTS.map(w => <option key={w} value={w}>Weight {w}</option>)}
            </select>
            <ColorField value={colorValue} onChange={(v, phase) => setTextStyle({ color: v }, phase)} />
            <button
              type="button"
              onClick={() => setTextStyle({ textTransform: g.textTransform === 'uppercase' ? 'none' : 'uppercase' })}
              className={`${segBtn(g.textTransform === 'uppercase')} rounded`}
              title="Capital letters"
            >
              AA
            </button>
            <div className="flex rounded overflow-hidden" title="How lines line up with each other">
              {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                <button key={a} type="button" onClick={() => setTextStyle({ textAlign: a })} className={segBtn((g.textAlign || 'center') === a)}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
            <select value={SHADOW_PRESETS.some(s => s.value === shadowValue) ? shadowValue : '__custom'} onChange={(e) => setTextStyle({ textShadow: e.target.value })} className={`${selectCls} max-w-[170px]`} title="Shadow">
              {!SHADOW_PRESETS.some(s => s.value === shadowValue) && <option value="__custom" disabled>Shadow: custom</option>}
              {SHADOW_PRESETS.map(s => <option key={s.label} value={s.value}>Shadow: {s.label}</option>)}
            </select>
            <MiniSlider label="Letters" min={-0.05} max={0.4} step={0.01} value={parseNum(g.letterSpacing, 0)} format={(v) => `${v.toFixed(2)}em`} onChange={(v, phase) => setTextStyle({ letterSpacing: `${v}em` }, phase)} />
            <Divider />
            <span title="A dark edge and halo around the letters, so they stand out on busy backgrounds" data-contrast-control>
              <MiniSlider label="Contrast" min={0} max={100} step={1} value={readabilityOf(g).contrast} format={(v) => (v ? String(Math.round(v)) : 'Off')} onChange={(v, phase) => setTextStyle({ [CONTRAST_KEY]: v } as React.CSSProperties, phase)} />
            </span>
          </div>

          <div className={rowClass(rows.isOpen('layout'))} data-design-row="layout">
            <RowHead label="Layout" open={rows.isOpen('layout')} onToggle={() => rows.toggle('layout')}
              summary={`${Math.round(box.width * 100)}% × ${Math.round(box.height * 100)}%${readabilityOf(g).boxOpacity ? ` · box ${Math.round(readabilityOf(g).boxOpacity)}%` : ''}`} />
            <MiniSlider label="Lines" min={0.8} max={2} step={0.05} value={parseNum(g.lineHeight, 1.3)} format={(v) => v.toFixed(2)} onChange={(v, phase) => setTextStyle({ lineHeight: String(v) }, phase)} />
            <Divider />
            <MiniSlider label="Across" min={0} max={100} step={1} value={placement.across} format={(v) => placementLabel(v, 'Left', 'Right')} onChange={(v, phase) => setBox(placeAcross(box, v), phase)} />
            <MiniSlider label="Down" min={0} max={100} step={1} value={placement.down} format={(v) => placementLabel(v, 'Top', 'Bottom')} onChange={(v, phase) => setBox(placeDown(box, v), phase)} />
            <NumField label="W" value={toPct(box.width)} onChange={(v) => setBox(resizeBox(box, { width: v / 100 }))} />
            <NumField label="H" value={toPct(box.height)} onChange={(v) => setBox(resizeBox(box, { height: v / 100 }))} />
            <select value="" onChange={(e) => { const p = LAYOUT_PRESETS[Number(e.target.value)]; if (p) setBox(p.layout); }} className={selectCls} title="Jump to a position preset">
              <option value="" disabled>Presets…</option>
              {LAYOUT_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
            </select>
            <Divider />
            <TextPositionSwitch
              value={part === 'verse' ? shown.styles.verticalAlign : shown.styles.sourceVerticalAlign}
              onChange={(v) => change(t => part === 'verse'
                ? { ...t, styles: { ...t.styles, verticalAlign: v } }
                : withReferenceBox(t, { sourceVerticalAlign: v }))}
            />
            <Divider />
            <span className="flex items-center gap-1.5" title="A colour filled behind this box" data-box-fill-control>
              <span className="text-[11px] text-neutral-400">Box</span>
              <ColorField value={readabilityOf(g).boxColor} title="Box colour" onChange={(v, phase) => setTextStyle({ [BOX_COLOR_KEY]: v, ...(readabilityOf(g).boxOpacity === 0 ? { [BOX_OPACITY_KEY]: 60 } : {}) } as React.CSSProperties, phase)} />
              <MiniSlider label="" min={0} max={100} step={1} value={readabilityOf(g).boxOpacity} format={(v) => (v ? `${Math.round(v)}%` : 'Off')} onChange={(v, phase) => setTextStyle({ [BOX_OPACITY_KEY]: v } as React.CSSProperties, phase)} />
            </span>
          </div>

          <div className={rowClass(rows.isOpen('motion'))} data-design-row="motion">
            <RowHead label="Motion" open={rows.isOpen('motion')} onToggle={() => rows.toggle('motion')}
              summary={`${MOTION_PRESETS.find(m => m.type === anim?.type)?.label || 'Simple fade'}${anim?.exit?.type && anim.exit.type !== 'none' ? ` · exit ${anim.exit.type}` : ''}`} />
            <select value={anim?.type || ''} onChange={(e) => setMotionType(e.target.value as AnimationType)} className={selectCls} title="How the verse and its reference come in">
              {MOTION_PRESETS.map(m => <option key={m.type} value={m.type}>{m.label}</option>)}
            </select>
            {anim?.type === 'scroll-in' || anim?.type === 'ticker' || anim?.type === 'karaoke' ? (
              <MotionOptions anim={anim} onChange={(patch, phase) => setAnim(patch, phase)} />
            ) : (
              <MiniSlider
                label="Duration"
                min={anim?.type === 'vertical-scroll' ? 3 : 0.1}
                max={anim?.type === 'vertical-scroll' ? 60 : 5}
                step={anim?.type === 'vertical-scroll' ? 1 : 0.05}
                value={anim?.duration || 0.6}
                format={(v) => anim?.type === 'vertical-scroll' ? `${v}s` : `${v.toFixed(2)}s`}
                onChange={(v, phase) => setAnim({ duration: v }, phase)}
              />
            )}
            <MotionLayers anim={anim} onChange={(patch, phase) => setAnim(patch, phase)} />
            {anim?.type !== 'ticker' && (
              <>
                <Divider />
                <ExitSelect anim={anim} onChange={(patch, phase) => setAnim(patch, phase)} />
              </>
            )}
            {!isDeclaration && <span className="text-[11px] text-neutral-500">The verse and its reference move together</span>}
          </div>

          </div>

          {onBackgroundOpacity && (
            <div className={rowClass(rows.isOpen('screen'))} data-design-row="screen">
              <RowHead label="Screen" open={rows.isOpen('screen')} onToggle={() => rows.toggle('screen')} summary={`Background ${backgroundOpacity ?? 80}%`} />
              <ScreenBackgroundControl value={backgroundOpacity ?? 80} screenName={outputName} onChange={onBackgroundOpacity} />
            </div>
          )}
        </div>
      </fieldset>

      {/* VERSE BAR: which verse the canvas shows, and whether it is on the screen */}
      <div className="h-9 px-3 border-b border-[#262635] bg-[#0b0b10] flex items-center gap-3 shrink-0 text-xs">
        <span className="font-semibold text-white whitespace-nowrap">Showing</span>
        <select value={previewValue} onChange={(e) => setPreviewWith(e.target.value)} className={`${selectCls} max-w-[260px]`} title={`Which ${isDeclaration ? 'slide' : 'verse'} the canvas shows while you design. Try a long one to check that it still fits.`}>
          {verse && <option value="verse">{verseOnAir ? 'On the screen' : isDeclaration ? 'From the open show' : 'In preview'}: {verse.source || verse.text.split('\n')[0].slice(0, 30)}</option>}
          {samples.map(s => <option key={s.id} value={s.id}>Sample: {s.label}</option>)}
        </select>
        {!notice && <span className="text-neutral-500 truncate hidden xl:inline">Changes here change every {isDeclaration ? 'declaration slide' : 'verse'} on {changesWhere}.</span>}
        <div className="ml-auto flex items-center gap-2 min-w-0">
          {notice && <span className="text-emerald-400 text-[11px] flex items-center gap-1 min-w-0"><Check size={12} className="shrink-0" /><span className="truncate">{notice}</span></span>}
          {draft && <span className="text-amber-300 text-[11px] truncate">Release to apply…</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {usingSample ? (
            <span className="text-neutral-400 text-[11px] whitespace-nowrap" title="A sample verse to design with. Show a verse from the Scripture tab to see it here.">Sample, not on the screen</span>
          ) : verseOnAir ? (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${status.presenting && !status.textCleared ? 'bg-red-600 text-white' : 'bg-neutral-700/60 text-neutral-300'}`}>
              ● On this screen
            </span>
          ) : (
            <>
              <span className="text-blue-300 text-[11px] whitespace-nowrap">Not on screen</span>
              <button type="button" onClick={() => onGoLive(verse!)} className={`${smallBtn} bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1`}>
                <Play size={10} className="fill-current" /> Go live
              </button>
            </>
          )}
        </div>
      </div>

      {textHidden && (
        <Notice>This screen's style "{styleName || 'Style'}" hides slide text, so there's no {noun} to design here.</Notice>
      )}

      {/* CANVAS: the screen showing the verse in this template (plus any unfinished change) */}
      <div className="flex-1 min-h-0 p-3" data-design-canvas>
        <FixedStage className="w-full h-full">
          {(scale: number) => (
            <>
              <div className="absolute inset-0 bg-black" />
              <React.Fragment key={replayKey}>{renderOutput(canvasSlide, shown)}</React.Fragment>
              {showGuides && canDesign && mediaItems.filter(m => m.id !== selectedMedia?.id).map(m => (
                <React.Fragment key={m.id}>
                  <DesignBox
                    rect={m.layout}
                    scale={scale}
                    movable
                    label={`${m.type === 'video' ? 'Video' : 'Picture'} · drag to move · drag the corners to resize`}
                    onSelect={() => setMediaSel(m.id)}
                    onChange={(r) => changeMedia(m.id, { layout: r }, 'draft')}
                    onChangeEnd={(r) => changeMedia(m.id, { layout: r }, 'commit')}
                  />
                </React.Fragment>
              ))}
              {showGuides && canDesign && (
                <>
                  <DesignBox
                    rect={verseBox}
                    scale={scale}
                    movable
                    selected={part === 'verse'}
                    label={`${isDeclaration ? 'Words' : 'Verse'} · drag to move`}
                    onSelect={() => setPart('verse')}
                    onChange={(r) => setBoxOf('verse', r, 'draft')}
                    onChangeEnd={(r) => setBoxOf('verse', r, 'commit')}
                  />
                  {!isDeclaration && (referenceHasBox || part === 'reference') && (
                    <DesignBox
                      rect={referenceBox}
                      scale={scale}
                      movable
                      selected={part === 'reference'}
                      label="Reference · drag to move"
                      tag={referenceHasBox ? undefined : { text: 'Under the verse for now', tone: 'grey' }}
                      onSelect={() => setPart('reference')}
                      onChange={(r) => setBoxOf('reference', r, 'draft')}
                      onChangeEnd={(r) => setBoxOf('reference', r, 'commit')}
                    />
                  )}
                </>
              )}
              {showGuides && canDesign && selectedMedia && (
                <DesignBox
                  rect={selectedMedia.layout}
                  scale={scale}
                  movable
                  selected
                  label={`${selectedMedia.type === 'video' ? 'Video' : 'Picture'} · drag to move · drag the corners to resize`}
                  onSelect={() => setMediaSel(selectedMedia.id)}
                  onChange={(r) => changeMedia(selectedMedia.id, { layout: r }, 'draft')}
                  onChangeEnd={(r) => changeMedia(selectedMedia.id, { layout: r }, 'commit')}
                />
              )}
            </>
          )}
        </FixedStage>
      </div>
    </div>
  );
}
