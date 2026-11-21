import React, { useEffect, useRef, useState } from 'react';
import { useDeleteKey } from '../lib/deleteKey';
import { askConfirm, askText } from '../lib/appDialogs';
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Check, Copy, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, Tv, Type } from 'lucide-react';
import type { OutputSettings, PresentationStyle, SlideDefinition } from '../lib/model';
import {
  STAGE_ITEM_KINDS, STAGE_LAYOUTS, STAGE_SAMPLES, StageItem, StageItemKind, StageLayout, StageRect,
  allStageLayouts, isReadyMadeStageLayout, stageLayoutFor, StageSlot, STAGE_SLOT_FIELD, STAGE_SLOT_LABEL, stageSlotSlide, stageDrawOrder,
} from '../lib/stageLayouts';
import { saveStageMedia } from '../lib/stageMedia';
import { pickMediaFile, isVideoPath, fileNameOf } from '../lib/nativeFiles';
import { isTauri } from '../lib/tauriScreen';
import { FixedStage } from './FixedStage';
import { StageScreen } from './StageScreen';
import { DesignBox, InlineTextEditor } from './DesignCanvas';
import { FONT_OPTIONS } from '../lib/designPresets';
import { Phase, WEIGHTS, selectCls, segBtn, smallBtn, GroupLabel, Divider, SizeStepper, ColorField, FontSelect, TextPositionSwitch, MiniSlider } from './DesignControls';

/** What a stage output shows right now */
export interface StageLiveData {
  slide: SlideDefinition | null | undefined;
  nextSlide: SlideDefinition | null;
  songTitle?: string;
  /** The slide text is cleared on this screen */
  hideText: boolean;
}

interface StageWorkspaceProps {
  /** Every stage output */
  outputs: OutputSettings[];
  selectedOutputId: string | null;
  onSelectOutput: (id: string) => void;
  /** Stage styles only */
  styles: PresentationStyle[];
  /** Layouts people made (the ready-made ones come from the library) */
  customLayouts: StageLayout[];
  onSetOutputStyle: (outputId: string, styleId: string | undefined) => void;
  /** Save the layouts, and a changed style if given, as one change */
  onChangeLayouts: (layouts: StageLayout[], style?: PresentationStyle) => void;
  getLive: (output: OutputSettings) => StageLiveData;
  onAddStageOutput: () => void;
}

type Slot = StageSlot;
type Snapshot = { layouts: StageLayout[]; style?: PresentationStyle };

const UNDO_MERGE_MS = 500;
const UNDO_LIMIT = 100;
const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'reset', 'file']);
const ADDABLE: StageItemKind[] = ['current-slide', 'next-slide', 'section', 'song-title', 'reference', 'clock', 'timer', 'text', 'media'];

const parseNum = (v: unknown, fallback: number) => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};
const shorten = (t: string) => (t.length > 14 ? `${t.slice(0, 13)}…` : t);
const itemName = (item: StageItem) => item.kind === 'media' && item.media
  ? shorten(item.media.name.replace(/\.[^.]+$/, ''))
  : item.kind === 'text' && item.text?.trim()
  ? (item.text.trim().length > 14 ? `${item.text.trim().slice(0, 13)}…` : item.text.trim())
  : STAGE_ITEM_KINDS[item.kind].label;
const hasWords = (item: StageItem) => item.kind === 'text' || item.kind === 'next-slide';

/** The Stage tab: design the layouts a stage screen uses, on a canvas showing that screen */
export function StageWorkspace({
  outputs, selectedOutputId, onSelectOutput, styles, customLayouts, onSetOutputStyle, onChangeLayouts, getLive, onAddStageOutput,
}: StageWorkspaceProps) {
  const output = outputs.find(o => o.id === selectedOutputId) || outputs[0];
  const style = output ? styles.find(s => s.id === output.styleId) : undefined;
  const firstLive = output ? getLive(output).slide : null;

  // Which of the style's two layouts is being designed
  const [slot, setSlot] = useState<Slot>(firstLive?.type === 'scripture' ? 'scripture' : firstLive?.declaration ? 'declaration' : 'lyrics');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // An unfinished change (mid-drag, colour being picked): canvas only, never on the stage screens
  const [draft, setDraft] = useState<StageLayout | null>(null);
  const [editingWordsOf, setEditingWordsOf] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [addMenuOpen, setAddMenuOpenRaw] = useState(false);
  // The Add menu floats above everything (panels below can't cut it off) and scrolls if the window is short
  const [addMenuPos, setAddMenuPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const setAddMenuOpen = (v: boolean | ((open: boolean) => boolean)) => setAddMenuOpenRaw(prev => {
    const open = typeof v === 'function' ? v(prev) : v;
    const r = addMenuRef.current?.getBoundingClientRect();
    if (open && r) {
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      // Open downwards when there is room, otherwise upwards (whichever side has more space)
      setAddMenuPos(below >= 420 || below >= above
        ? { left: r.left, top: r.bottom + 4, maxHeight: below }
        : { left: r.left, bottom: window.innerHeight - r.top + 4, maxHeight: above });
    }
    return open;
  });
  // Choosing a picture or video: for a new media item, or to replace the one picked
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const replacingMediaOf = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const history = useRef<{ past: Snapshot[]; future: Snapshot[]; lastAt: number }>({ past: [], future: [], lastAt: 0 });

  const slotField = STAGE_SLOT_FIELD[slot];
  const layout = stageLayoutFor(style, stageSlotSlide(slot), customLayouts);
  const shown = draft ?? layout;
  const readyMade = isReadyMadeStageLayout(layout.id);
  const canEdit = !!style;
  const selectedItem = shown.items.find(i => i.id === selectedItemId);
  const editingItem = shown.items.find(i => i.id === editingWordsOf);

  useEffect(() => { setSelectedItemId(null); setDraft(null); setEditingWordsOf(null); }, [output?.id, slot]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!addMenuOpen) return;
    const close = (e: PointerEvent) => { if (!addMenuRef.current?.contains(e.target as Node)) setAddMenuOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [addMenuOpen]);

  // ─── Saving, with undo ───
  const latest = useRef({ customLayouts, style, onChangeLayouts });
  latest.current = { customLayouts, style, onChangeLayouts };

  const commit = (layouts: StageLayout[], nextStyle?: PresentationStyle) => {
    const h = history.current;
    const now = Date.now();
    if (h.past.length === 0 || now - h.lastAt > UNDO_MERGE_MS) {
      h.past.push({ layouts: customLayouts, style });
      if (h.past.length > UNDO_LIMIT) h.past.shift();
    }
    h.lastAt = now;
    h.future = [];
    onChangeLayouts(layouts, nextStyle);
  };

  useEffect(() => {
    const step = (undo: boolean) => {
      const h = history.current;
      const snap = (undo ? h.past : h.future).pop();
      if (!snap) { setNotice(undo ? 'Nothing to undo' : 'Nothing to redo'); return; }
      const now = latest.current;
      (undo ? h.future : h.past).push({ layouts: now.customLayouts, style: now.style });
      h.lastAt = 0;
      setDraft(null);
      now.onChangeLayouts(snap.layouts, snap.style);
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

  const uniqueName = (base: string) => {
    const names = new Set(allStageLayouts(customLayouts).map(l => l.name));
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  };

  // Every layout edit goes through here. A ready-made layout is never changed: the first edit saves your own copy.
  const change = (fn: (l: StageLayout) => StageLayout, phase: Phase = 'commit') => {
    if (!style) return;
    if (phase === 'draft') { setDraft(fn(draft ?? layout)); return; }
    setDraft(null);
    const next = fn(layout);
    if (readyMade) {
      const copy: StageLayout = { ...next, id: `stage-${Date.now().toString(36)}`, name: uniqueName(`${layout.name} (my copy)`), description: undefined };
      commit([...customLayouts, copy], { ...style, [slotField]: copy.id });
      setNotice(`Saved as your own layout "${copy.name}". The ready-made one is unchanged.`);
      return;
    }
    commit(customLayouts.map(l => l.id === layout.id ? next : l));
  };
  const changeItem = (id: string, fn: (item: StageItem) => StageItem, phase: Phase = 'commit') =>
    change(l => ({ ...l, items: l.items.map(i => i.id === id ? fn(i) : i) }), phase);
  const setRect = (id: string, rect: StageRect, phase: Phase) => changeItem(id, i => ({ ...i, rect }), phase);
  const setItemStyle = (patch: React.CSSProperties, phase: Phase = 'commit') => {
    if (selectedItem) changeItem(selectedItem.id, i => ({ ...i, style: { ...(i.style || {}), ...patch } }), phase);
  };

  const chooseMedia = (replaceId: string | null) => {
    replacingMediaOf.current = replaceId;
    // Desktop app: pick the file where it is (nothing is copied into FlowShow)
    if (isTauri()) { void pickStageMedia(); return; }
    mediaInputRef.current?.click();
  };
  const pickStageMedia = async () => {
    const path = await pickMediaFile('media').catch(() => null);
    const replaceId = replacingMediaOf.current;
    replacingMediaOf.current = null;
    if (!path) return;
    const media = { id: path, type: (isVideoPath(path) ? 'video' : 'image') as 'image' | 'video', name: fileNameOf(path), path };
    if (replaceId) { changeItem(replaceId, i => ({ ...i, media })); return; }
    const id = `media-${Date.now().toString(36)}`;
    const start = STAGE_ITEM_KINDS.media.start;
    change(l => ({ ...l, items: [...l.items, { id, kind: 'media', ...start, rect: { ...start.rect }, media }] }));
    setSelectedItemId(id);
  };
  const onMediaChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const media = await saveStageMedia(file);
    const replaceId = replacingMediaOf.current;
    replacingMediaOf.current = null;
    if (replaceId) { changeItem(replaceId, i => ({ ...i, media })); return; }
    const id = `media-${Date.now().toString(36)}`;
    const start = STAGE_ITEM_KINDS.media.start;
    change(l => ({ ...l, items: [...l.items, { id, kind: 'media', ...start, rect: { ...start.rect }, media }] }));
    setSelectedItemId(id);
  };
  // Layers: move the picked item up or down among items of its own kind (media always stays under the words)
  const moveLayer = (dir: 1 | -1) => {
    if (!selectedItem) return;
    const id = selectedItem.id;
    const isMedia = selectedItem.kind === 'media';
    change(l => {
      const items = [...l.items];
      const group = items.map((it, idx) => ({ it, idx })).filter(x => (x.it.kind === 'media') === isMedia);
      const at = group.findIndex(x => x.it.id === id);
      const other = group[at + dir];
      if (!other) return l;
      const a = group[at].idx, b = other.idx;
      [items[a], items[b]] = [items[b], items[a]];
      return { ...l, items };
    });
  };
  const addItem = (kind: StageItemKind) => {
    setAddMenuOpen(false);
    if (kind === 'media') { chooseMedia(null); return; }
    const id = `${kind}-${Date.now().toString(36)}`;
    const start = STAGE_ITEM_KINDS[kind].start;
    change(l => ({ ...l, items: [...l.items, { id, kind, ...start, rect: { ...start.rect }, style: { ...(start.style || {}) } }] }));
    setSelectedItemId(id);
    if (kind === 'text') setEditingWordsOf(id);
  };
  const removeItem = () => {
    if (!selectedItem) return;
    const id = selectedItem.id;
    change(l => ({ ...l, items: l.items.filter(i => i.id !== id) }));
    setSelectedItemId(null);
  };
  // Delete removes the picked item (not while its words are being typed)
  useDeleteKey(() => { if (!selectedItem || editingWordsOf) return false; removeItem(); return true; });
  const saveWords = (id: string, text: string) => {
    setEditingWordsOf(null);
    changeItem(id, i => ({ ...i, text }));
  };

  // ─── Layout choices ───
  const chooseLayout = (id: string) => {
    if (!style || id === layout.id) return;
    commit(customLayouts, { ...style, [slotField]: id });
    setSelectedItemId(null);
  };
  const duplicateLayout = () => {
    if (!style) return;
    const copy: StageLayout = { ...layout, id: `stage-${Date.now().toString(36)}`, name: uniqueName(`${layout.name} (copy)`), description: undefined };
    commit([...customLayouts, copy], { ...style, [slotField]: copy.id });
    setNotice(`Copied to "${copy.name}"`);
  };
  const renameLayout = async () => {
    const name = await askText('Name for this stage layout', layout.name, { okLabel: 'Rename' });
    if (name && name !== layout.name) commit(customLayouts.map(l => l.id === layout.id ? { ...l, name } : l));
  };
  const deleteLayout = async () => {
    if (!style || !(await askConfirm(`Delete the stage layout "${layout.name}"? Stage styles using it go back to a ready-made layout. Ctrl+Z brings it back.`, { okLabel: 'Delete', danger: true }))) return;
    commit(customLayouts.filter(l => l.id !== layout.id), { ...style, [slotField]: undefined });
    setNotice(`Deleted "${layout.name}"`);
  };

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

  // The canvas shows the live slide when it fits this layout, otherwise sample words
  const live = getLive(output);
  const liveSlot: Slot | null = live.slide ? (live.slide.type === 'scripture' ? 'scripture' : live.slide.declaration ? 'declaration' : 'lyrics') : null;
  const liveFits = !!live.slide && !live.hideText && liveSlot === slot;
  const sample = STAGE_SAMPLES[slot];
  const data = liveFits
    ? { slide: live.slide, nextSlide: live.nextSlide, songTitle: live.songTitle }
    : { slide: sample.slide, nextSlide: sample.next, songTitle: sample.songTitle };
  const g = selectedItem?.style || {};
  const colorValue = /^#[0-9a-f]{6}$/i.test(String(g.color || '')) ? String(g.color) : '#ffffff';

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#07070a] select-none">
      {/* HEADER: which stage screen and its Stage style */}
      <div className="h-11 px-3 border-b border-[#262635] flex items-center gap-3 shrink-0 bg-[#101015]">
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
            className={`${selectCls} max-w-[170px]`}
          >
            <option value="">(None — ready-made layouts)</option>
            {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowGuides(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${showGuides ? 'text-white bg-white/10' : 'text-neutral-500 hover:text-white'}`}
            title="Show or hide the item outlines"
          >
            {showGuides ? <Eye size={13} /> : <EyeOff size={13} />} Guides
          </button>
        </div>
      </div>

      {!canEdit && (
        <div className="mx-3 mt-2 px-3 py-1.5 rounded-lg border text-xs shrink-0 bg-blue-500/10 border-blue-500/20 text-blue-200">
          {output.name} uses the ready-made layouts. Pick a Stage style above to design its layouts.
        </div>
      )}

      {/* TOOLBAR */}
      <fieldset disabled={!canEdit} className={`min-w-0 border-0 p-0 m-0 shrink-0 ${canEdit ? '' : 'opacity-40'}`}>
        <div className="px-3 py-2 space-y-2 border-b border-[#262635] bg-[#0d0d12]">
          {/* Row 1: which layout */}
          <div className="flex flex-wrap items-center gap-2">
            <GroupLabel fixed>Layout</GroupLabel>
            <div className="flex rounded overflow-hidden" title="This style has a layout for song slides, one for declarations and one for scripture">
              <button type="button" onClick={() => setSlot('lyrics')} className={segBtn(slot === 'lyrics')}>For songs</button>
              <button type="button" onClick={() => setSlot('declaration')} className={segBtn(slot === 'declaration')}>For declarations</button>
              <button type="button" onClick={() => setSlot('scripture')} className={segBtn(slot === 'scripture')}>For scripture</button>
            </div>
            <select value={layout.id} onChange={(e) => chooseLayout(e.target.value)} className={`${selectCls} max-w-[220px]`} title={`The layout this style uses for ${STAGE_SLOT_LABEL[slot].noun} slides`}>
              <optgroup label="Ready-made">
                {STAGE_LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>
              {customLayouts.length > 0 && (
                <optgroup label="Your layouts">
                  {customLayouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </optgroup>
              )}
            </select>
            <button type="button" onClick={duplicateLayout} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title="Make a copy of this layout to change">
              <Copy size={11} /> Copy
            </button>
            {!readyMade && (
              <>
                <button type="button" onClick={renameLayout} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`}>
                  <Pencil size={11} /> Rename
                </button>
                <button type="button" onClick={deleteLayout} className={`${smallBtn} bg-white/5 text-red-300 hover:bg-red-500/20 flex items-center gap-1`}>
                  <Trash2 size={11} /> Delete
                </button>
              </>
            )}
            {readyMade && canEdit && <span className="text-[11px] text-neutral-500">Ready-made: your first change saves your own copy</span>}
          </div>

          {/* Row 2: the items on the screen */}
          <div className="flex flex-wrap items-center gap-2">
            <GroupLabel fixed>Items</GroupLabel>
            <div className="flex flex-wrap gap-1">
              {shown.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItemId(item.id)}
                  className={`${smallBtn} ${item.id === selectedItemId ? 'bg-pink-600 text-white' : 'bg-[#1e1e28] text-neutral-300 hover:text-white'}`}
                >
                  {itemName(item)}
                </button>
              ))}
            </div>
            <div className="relative" ref={addMenuRef}>
              <button type="button" onClick={() => setAddMenuOpen(v => !v)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`}>
                <Plus size={11} /> Add
              </button>
              {addMenuOpen && (
                <div className="fixed z-[200] w-60 py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl overflow-y-auto custom-scrollbar" style={addMenuPos ? { left: addMenuPos.left, top: addMenuPos.top, bottom: addMenuPos.bottom, maxHeight: addMenuPos.maxHeight } : undefined} data-stage-add-menu>
                  {ADDABLE.map(kind => (
                    <button key={kind} type="button" onClick={() => addItem(kind)} className="w-full px-3 py-1.5 text-left hover:bg-white/5 transition-colors">
                      <span className="block text-xs font-semibold text-white">{STAGE_ITEM_KINDS[kind].label}</span>
                      <span className="block text-[10px] text-neutral-500">{STAGE_ITEM_KINDS[kind].hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Divider />
            {selectedItem && hasWords(selectedItem) && (
              <button type="button" onClick={() => setEditingWordsOf(selectedItem.id)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title={selectedItem.kind === 'next-slide' ? 'Change the label above the next slide' : 'Change the words'}>
                <Type size={11} /> {selectedItem.kind === 'next-slide' ? 'Edit label' : 'Edit words'}
              </button>
            )}
            {selectedItem && (() => {
              const group = shown.items.filter(i => (i.kind === 'media') === (selectedItem.kind === 'media'));
              const at = group.findIndex(i => i.id === selectedItem.id);
              return (
                <span className="flex items-center gap-1" data-layer-controls>
                  <span className="text-[11px] text-neutral-400">Layer</span>
                  <button type="button" disabled={at >= group.length - 1} onClick={() => moveLayer(1)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title={selectedItem.kind === 'media' ? 'Bring forward (over other pictures and videos; words always stay on top)' : 'Bring forward'} data-layer-up>
                    <ArrowUp size={11} /> Forward
                  </button>
                  <button type="button" disabled={at <= 0} onClick={() => moveLayer(-1)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title="Send backward" data-layer-down>
                    <ArrowDown size={11} /> Backward
                  </button>
                </span>
              );
            })()}
            <button type="button" disabled={!selectedItem} onClick={removeItem} className={`${smallBtn} bg-white/5 text-red-300 hover:bg-red-500/20 flex items-center gap-1`} title={selectedItem ? 'Take this item off the layout' : 'Click an item first'}>
              <Trash2 size={11} /> Remove
            </button>
          </div>

          <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onMediaChosen} data-stage-media-input />
          {/* Row 3 for a picture or video: how much it shows and how it fills its box */}
          {selectedItem?.kind === 'media' ? (
            <div className="flex flex-wrap items-center gap-2" data-media-controls>
              <GroupLabel fixed>Media</GroupLabel>
              <span className="text-[11px] text-neutral-300 max-w-[200px] truncate" title={selectedItem.media?.name}>{selectedItem.media?.name || 'No file'}</span>
              <button type="button" onClick={() => chooseMedia(selectedItem.id)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`}><ImagePlus size={11} /> Replace…</button>
              <Divider />
              <span data-media-opacity>
                <MiniSlider label="Opacity" min={0} max={100} step={1} value={selectedItem.opacity ?? 100} format={(v) => `${Math.round(v)}%`} onChange={(v, phase) => changeItem(selectedItem.id, i => ({ ...i, opacity: v }), phase)} />
              </span>
              <div className="flex rounded overflow-hidden" title="Fill the box (cropping the edges) or fit inside it">
                <button type="button" onClick={() => changeItem(selectedItem.id, i => ({ ...i, fit: 'cover' }))} className={segBtn((selectedItem.fit || 'cover') === 'cover')}>Fill</button>
                <button type="button" onClick={() => changeItem(selectedItem.id, i => ({ ...i, fit: 'contain' }))} className={segBtn(selectedItem.fit === 'contain')}>Fit</button>
              </div>
              <button type="button" onClick={() => changeItem(selectedItem.id, i => ({ ...i, rect: { x: 0, y: 0, width: 1, height: 1 } }))} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10`} title="Make it cover the whole screen">Full screen</button>
              <span className="text-[11px] text-neutral-500">Pictures and videos are always under the words.</span>
            </div>
          ) : (
          /* Row 3: how the selected item's text looks */
          <fieldset disabled={!selectedItem} className={`min-w-0 border-0 p-0 m-0 flex flex-wrap items-center gap-2 ${selectedItem ? '' : 'opacity-40'}`}>
            <GroupLabel fixed>Text</GroupLabel>
            <FontSelect value={String(g.fontFamily || 'Inter, sans-serif')} onChange={(v) => setItemStyle({ fontFamily: v })} />
            <SizeStepper value={parseNum(g.fontSize, 60)} onChange={(v) => setItemStyle({ fontSize: `${v}px` })} />
            <select value={String(g.fontWeight || '700')} onChange={(e) => setItemStyle({ fontWeight: e.target.value })} className={selectCls} title="Weight">
              {WEIGHTS.map(w => <option key={w} value={w}>Weight {w}</option>)}
            </select>
            <ColorField value={colorValue} onChange={(v, phase) => setItemStyle({ color: v }, phase)} />
            <div className="flex rounded overflow-hidden" title="Line up the text in its box">
              {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                <button key={a} type="button" onClick={() => setItemStyle({ textAlign: a })} className={segBtn((g.textAlign || 'left') === a)}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setItemStyle({ textTransform: g.textTransform === 'uppercase' ? 'none' : 'uppercase' })} className={`${segBtn(g.textTransform === 'uppercase')} rounded`} title="Capitals">AA</button>
            {selectedItem && (selectedItem.kind === 'current-slide' || selectedItem.kind === 'next-slide') && (
              <TextPositionSwitch value={selectedItem.verticalAlign} onChange={(v) => changeItem(selectedItem.id, i => ({ ...i, verticalAlign: v }))} />
            )}
            {!selectedItem && <span className="text-[11px] text-neutral-500">Click an item on the screen to change it</span>}
          </fieldset>
          )}
        </div>
      </fieldset>

      {/* CANVAS: the stage screen with this layout; click empty space to deselect */}
      <div className="flex-1 min-h-0 p-3" data-stage-canvas onPointerDown={() => setSelectedItemId(null)}>
        <FixedStage className="w-full h-full">
          {(scale: number) => (
            <>
              <div className="absolute inset-0 bg-black" />
              <StageScreen
                layout={shown}
                slide={data.slide}
                nextSlide={data.nextSlide}
                songTitle={data.songTitle}
                background={style?.backgroundColor}
                sample
              />
              {showGuides && canEdit && stageDrawOrder(shown.items).map(item => (
                <React.Fragment key={item.id}>
                  {editingWordsOf !== item.id && (
                    <DesignBox
                      rect={item.rect}
                      scale={scale}
                      movable
                      selected={item.id === selectedItemId}
                      label={`${STAGE_ITEM_KINDS[item.kind].label} · drag to move${hasWords(item) ? ' · double-click to edit' : ''}`}
                      onSelect={() => setSelectedItemId(item.id)}
                      onChange={(r) => setRect(item.id, r, 'draft')}
                      onChangeEnd={(r) => setRect(item.id, r, 'commit')}
                      onDoubleClick={() => { if (hasWords(item)) setEditingWordsOf(item.id); }}
                    />
                  )}
                </React.Fragment>
              ))}
              {editingItem && (
                <InlineTextEditor
                  rect={editingItem.rect}
                  scale={scale}
                  initialText={editingItem.text ?? (editingItem.kind === 'next-slide' ? 'Next' : '')}
                  placeholder={editingItem.kind === 'next-slide' ? 'Label above the next slide' : 'Type the words…'}
                  hint={editingItem.kind === 'next-slide' ? 'Label above the next slide' : 'Words on the stage screen'}
                  onSave={(text) => saveWords(editingItem.id, text)}
                  onCancel={() => setEditingWordsOf(null)}
                />
              )}
              <div className="absolute inset-0 pointer-events-none z-30" style={{ boxShadow: `inset 0 0 0 ${2 / Math.max(scale, 0.0001)}px rgba(255,255,255,0.1)` }} />
            </>
          )}
        </FixedStage>
      </div>

      {/* FOOTER: where the words come from, and who sees changes */}
      <div className="h-9 px-3 border-t border-[#262635] bg-[#0b0b10] flex items-center gap-2 shrink-0 text-[11px] text-neutral-500 whitespace-nowrap overflow-hidden">
        <span className="text-white font-semibold">{layout.name}</span>
        <span className="truncate">
          · {liveFits ? `live: what ${output.name} shows now` : `sample ${STAGE_SLOT_LABEL[slot].noun} words (no ${STAGE_SLOT_LABEL[slot].noun} slide is showing)`}
          {style ? ` · changes reach every stage screen using "${style.name}" when you let go` : ''}
        </span>
        {notice && <span className="ml-auto text-emerald-400 flex items-center gap-1 shrink-0"><Check size={12} /> {notice}</span>}
      </div>
    </div>
  );
}
