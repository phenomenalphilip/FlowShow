import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDeleteKey } from '../lib/deleteKey';
import {
  ChevronDown, Copy, Eye, EyeOff, Film, FlipHorizontal, Frame, Type, FlipVertical, Image as ImageIcon, Maximize2, Minimize2, Palette,
  Pencil, Play, Plus, Radio, RefreshCw, RotateCcw, Save, Send, Trash2, ArrowUp, ArrowDown, Video,
} from 'lucide-react';
import type { PresentationItem, SlideDefinition } from '../App';
import { FixedStage } from './FixedStage';
import { DesignBox } from './DesignCanvas';
import { DRAG_MEDIA } from './ProjectsPanel';
import { DRAG_INPUT, type LiveInput } from '../lib/liveInputs';
import { ColorField, Divider, segBtn, selectCls, smallBtn } from './DesignControls';
import { askConfirm, askText } from '../lib/appDialogs';
import { groupColors } from '../lib/slideGroups';
import { DesignMediaControls, chooseDesignMediaFile, type DesignMedia } from '../lib/designMedia';
import {
  DEFAULT_SHOW_END_FADE, EMPTY_MIX, FULL_SCREEN_RECT, LiveMix, LiveMixLayer, MIX_BLENDS, MixBlend, MixEffects, MixLayer, MixMedia,
  MixRect, MixSource, MixSpan, NEW_MIX_BOX, SavedMix, ShowMix, layerPlaysAt, layerRuns, mixLayersAt, newMixId, rememberMixUrl, slidesSpan,
} from '../lib/mix';

type Phase = 'draft' | 'commit';
type Sel = { kind: 'layer'; id: string } | { kind: 'design'; slideId: string; mediaId: string } | null;
type Screen = { id: string; name: string };

export interface MixWorkspaceProps {
  /** The show being mixed (the one open in the Shows tab or setlist) */
  show: PresentationItem | null;
  /** Audience screens a layer can play on */
  screens: Screen[];
  /** The main screen (layers play there unless they say otherwise; the canvas shows it) */
  mainScreenId: string;
  liveSlideId: string | null;
  liveMix: LiveMix | null | undefined;
  /** Changes reach the screens at once (instead of waiting for Update screens / the next slide) */
  autoSend: boolean;
  onAutoSend: (on: boolean) => void;
  onChangeMix: (fn: (mix: ShowMix) => ShowMix) => void;
  onGoLive: (slide: SlideDefinition) => void;
  onUpdateScreens: () => void;
  /** Other shows, to copy this mix to */
  otherShows: { id: string; title: string; hasMix: boolean }[];
  onCopyMixTo: (showId: string) => void;
  savedMixes: SavedMix[];
  onSaveMix: (name: string) => void;
  onUseSavedMix: (id: string) => void;
  onRenameSavedMix: (id: string, name: string) => void;
  onDeleteSavedMix: (id: string) => void;
  /** The main screen showing this slide with these layers (words faint, so the media can be placed around them) */
  /** hideWords: leave the words out of the preview (only the media) */
  renderScreen: (slide: SlideDefinition | null, layers: LiveMixLayer[], hideWords?: boolean) => React.ReactNode;
  /** Pictures added to slides in Design mode: change (patch) or remove (null) one */
  onChangeDesignMedia: (slideId: string, mediaId: string, patch: Partial<DesignMedia> | null) => void;
  onEditInDesign: (slideId: string) => void;
  /** Opened from Design mode by double-clicking a picture or video: show this slide and pick it */
  focus?: { slideId: string; mediaId?: string; at: number } | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const stripUrls = (layers: LiveMixLayer[]) => JSON.stringify(layers.map(({ url: _u, ...l }) => l));
const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
const sourceIcon = (l: MixLayer) => l.source.kind === 'media' ? (l.source.media.type === 'video' ? Video : ImageIcon) : l.source.kind === 'input' ? Radio : l.source.kind === 'border' ? Frame : Palette;
const barColour = (l: MixLayer) => l.source.kind === 'input' ? 'bg-rose-500/70 border-rose-300/60'
  : l.source.kind !== 'media' ? 'bg-violet-500/70 border-violet-300/60'
  : l.source.media.type === 'video' ? 'bg-sky-500/70 border-sky-300/60' : 'bg-emerald-500/70 border-emerald-300/60';
const END_OPTIONS: { value: string; label: string }[] = [
  { value: '0.5', label: 'Fade out quickly (0.5 s)' },
  { value: '1', label: 'Fade out (1 s)' },
  { value: '1.5', label: 'Fade out (1.5 s)' },
  { value: '3', label: 'Fade out slowly (3 s)' },
  { value: '5', label: 'Fade out very slowly (5 s)' },
  { value: 'keep', label: 'Keep playing into the next show' },
];

/** A labelled slider for the settings column: dragging shows on the canvas only; letting go saves */
function Slider({ label, min, max, step, value, format, onChange }: {
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

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 border-b border-[#262635] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

/**
 * Mix mode: layers of media for one show. The canvas shows the main screen on the slide picked in the timeline;
 * the timeline shows which slides each layer plays on (drag a bar's ends to change it).
 */
export function MixWorkspace(p: MixWorkspaceProps) {
  const { show } = p;
  const slides = show?.slides || [];
  const n = slides.length;
  const saved: ShowMix = show?.mix || EMPTY_MIX;
  // An unfinished change (mid-drag, a slider being held): canvas only, never on the screens
  const [draft, setDraft] = useState<ShowMix | null>(null);
  const mix = draft ?? saved;
  const [sel, setSel] = useState<Sel>(null);
  // The slide picked in the timeline (null = follow the slide on the screens)
  const [playId, setPlayId] = useState<string | null>(null);
  const [guides, setGuides] = useState(true);
  // Leave the words out of the preview, to work on the media alone (only here: the screens still show them)
  const [wordsHidden, setWordsHiddenState] = useState(() => { try { return localStorage.getItem('fs-mix-hide-words') === '1'; } catch { return false; } });
  const setWordsHidden = (v: boolean) => { setWordsHiddenState(v); try { localStorage.setItem('fs-mix-hide-words', v ? '1' : '0'); } catch { /* fine */ } };
  const [menu, setMenu] = useState<'add' | 'mix' | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string } | null>(null);
  const [designDraft, setDesignDraft] = useState<{ slideId: string; mediaId: string; layout: MixRect } | null>(null);
  const [dropCol, setDropCol] = useState<number | null>(null);
  // Drag the bar above the timeline: up = a smaller preview and a taller timeline (remembered)
  // (A smaller preview by default: the timeline starts at 40% of the window)
  const defaultTimelineH = () => Math.max(220, Math.round(window.innerHeight * 0.4));
  const [timelineH, setTimelineH] = useState(() => { try { return Number(localStorage.getItem('fs-mix-timeline-h2')) || defaultTimelineH(); } catch { return defaultTimelineH(); } });
  useEffect(() => { try { localStorage.setItem('fs-mix-timeline-h2', String(timelineH)); } catch { /* fine */ } }, [timelineH]);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY, startH = timelineH;
    const total = workspaceRef.current?.getBoundingClientRect().height ?? 800;
    const onMove = (ev: PointerEvent) => setTimelineH(clamp(startH + (startY - ev.clientY), 110, Math.max(140, total - 44 - 180)));
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', onMove), { once: true });
  };
  const gridRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(null); setSel(null); setPlayId(null); setDesignDraft(null); }, [show?.id]);
  // Opened from Design mode on a slide picture: show that slide, with the picture picked
  useEffect(() => {
    if (!p.focus) return;
    setPlayId(p.focus.slideId);
    if (p.focus.mediaId) setSel({ kind: 'design', slideId: p.focus.slideId, mediaId: p.focus.mediaId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus?.at]);
  useEffect(() => {
    if (!menu && !ctx) return;
    const close = () => { setMenu(null); setCtx(null); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu, ctx]);

  const liveIndex = slides.findIndex(s => s.id === p.liveSlideId);
  const picked = playId ? slides.findIndex(s => s.id === playId) : -1;
  const playIndex = picked >= 0 ? picked : liveIndex >= 0 ? liveIndex : 0;
  const playSlide = slides[playIndex] || null;

  const selLayer = sel?.kind === 'layer' ? mix.layers.find(l => l.id === sel.id) : undefined;
  const designItems = useMemo(() => slides.flatMap((s, i) =>
    (s.designs?.[p.mainScreenId]?.media || []).map(m => ({ slide: s, index: i, media: m }))), [slides, p.mainScreenId]);
  const selDesign = sel?.kind === 'design' ? designItems.find(d => d.slide.id === sel.slideId && d.media.id === sel.mediaId) : undefined;
  const groups = useMemo(() => Array.from(new Set(slides.map(s => s.group).filter((g): g is string => !!g))), [slides]);

  // ─── Changing the mix ───
  const change = (fn: (m: ShowMix) => ShowMix, phase: Phase = 'commit') => {
    if (!show) return;
    if (phase === 'draft') { setDraft(prev => fn(prev ?? saved)); return; }
    setDraft(null);
    p.onChangeMix(fn);
  };
  const changeLayer = (id: string, patch: Partial<MixLayer> | ((l: MixLayer) => MixLayer), phase: Phase = 'commit') =>
    change(m => ({ ...m, layers: m.layers.map(l => l.id === id ? (typeof patch === 'function' ? patch(l) : { ...l, ...patch }) : l) }), phase);
  const setEffect = (id: string, patch: Partial<MixEffects>, phase: Phase = 'commit') =>
    changeLayer(id, l => ({ ...l, effects: { ...(l.effects || {}), ...patch } }), phase);

  /** Pick a layer; if it doesn't play on the slide shown, show its first slide */
  const pickLayer = (layer: MixLayer) => {
    setSel({ kind: 'layer', id: layer.id });
    if (!layerPlaysAt(layer, slides, playIndex)) {
      const first = layerRuns(layer, slides)[0];
      if (first) setPlayId(slides[first.from].id);
    }
  };
  /** Where new media starts: videos fill the screen, pictures (and live inputs) are a box in the middle */
  const startBox = (media: MixMedia | null): MixRect => media?.type === 'video' ? { ...FULL_SCREEN_RECT } : { ...NEW_MIX_BOX };
  const newLayer = (source: MixSource, span: MixSpan, name: string, layout: MixRect): MixLayer =>
    ({ id: newMixId(), name, source, span, layout, opacity: 100, blend: 'normal', fit: 'cover', loop: true, speed: 1, fadeIn: 1, fadeOut: 1 });
  const addLayer = (layer: MixLayer) => {
    change(m => ({ ...m, layers: [...m.layers, layer] }));
    pickLayer(layer);
  };
  const addFile = async () => {
    const file = await chooseDesignMediaFile();
    if (!file) return;
    const media: MixMedia = { type: file.type, name: file.name, path: file.path, storedId: file.storedId };
    addLayer(newLayer({ kind: 'media', media }, { kind: 'show' }, baseName(file.name), startBox(media)));
  };
  /** A border: a window (rounded to start with) with everything outside it covered in black, over everything */
  const addBorder = () => addLayer(newLayer(
    { kind: 'border', shape: 'rounded', outside: '#000000', color: '#ffffff', width: 0, glow: 0, radius: 80 },
    { kind: 'show' }, 'Border', { x: 0.03, y: 0.05, width: 0.94, height: 0.9 },
  ));
  const addColour = (gradient: boolean) => addLayer(newLayer(
    gradient ? { kind: 'gradient', from: '#1e3a8a', to: '#7c3aed', angle: 135 } : { kind: 'color', color: '#1e3a8a' },
    { kind: 'show' }, gradient ? 'Gradient' : 'Colour wash', { ...FULL_SCREEN_RECT },
  ));
  /** Media dragged from the Media tab */
  const mediaFromDrop = (e: React.DragEvent): MixMedia | null => {
    const raw = e.dataTransfer.getData(DRAG_MEDIA);
    if (!raw) return null;
    try {
      const m = JSON.parse(raw) as { name?: string; url?: string; type?: string; ref?: MixMedia['ref']; path?: string };
      if (!m.url) return null;
      const media: MixMedia = { type: m.type === 'video' ? 'video' : 'image', name: m.name || 'Media', url: m.url, ref: m.ref, path: m.path };
      rememberMixUrl(media, m.url);
      return media;
    } catch { return null; }
  };
  const isMediaDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types || []).some(t => t === DRAG_MEDIA || t === DRAG_INPUT);
  /** A camera, screen or NDI source dragged from the Media tab's Inputs */
  const inputFromDrop = (e: React.DragEvent): LiveInput | null => {
    try { const i = JSON.parse(e.dataTransfer.getData(DRAG_INPUT) || 'null') as LiveInput | null; return i && i.kind && i.id ? i : null; } catch { return null; }
  };
  /** Dropped on the screen: plays the whole show, centred where it was dropped */
  const dropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    const media = mediaFromDrop(e);
    const input = media ? null : inputFromDrop(e);
    if ((!media && !input) || !show) return;
    const stage = canvasRef.current?.querySelector('[data-mix-stage]')?.getBoundingClientRect();
    const box = startBox(media);
    if (stage && stage.width > 0 && box.width < 1) {
      box.x = clamp((e.clientX - stage.left) / stage.width - box.width / 2, 0, 1 - box.width);
      box.y = clamp((e.clientY - stage.top) / stage.height - box.height / 2, 0, 1 - box.height);
    }
    addLayer(media
      ? newLayer({ kind: 'media', media }, { kind: 'show' }, baseName(media.name), box)
      : newLayer({ kind: 'input', input: input! }, { kind: 'show' }, input!.label, box));
  };
  /** Whether a word of the slide (lyrics or a text box) is at this point on the canvas */
  const wordAt = (x: number, y: number) => Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[data-text-layer] [data-word-index]') || [])
    .some((el: HTMLElement) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
  // The slide column the mouse is over in the timeline (for B)
  const hoverCol = useRef<number | null>(null);
  const [cutNote, setCutNote] = useState<string | null>(null);
  useEffect(() => { if (!cutNote) return; const t = setTimeout(() => setCutNote(null), 2500); return () => clearTimeout(t); }, [cutNote]);
  /** Cut a layer in two after slide `col`: the first part ends there, the second carries on from the next slide */
  const cutLayer = (layer: MixLayer, col: number) => {
    if (layer.span.kind === 'group') { setCutNote(`"${layer.name}" plays on every ${layer.span.group}: choose Slides to cut it`); return; }
    const range = layer.span.kind === 'show' ? { from: 0, to: n - 1 } : layerRuns(layer, slides)[0];
    if (!range || col < range.from || col >= range.to) { setCutNote('Point at a slide inside the bar (not its last slide) and press B'); return; }
    const second: MixLayer = { ...(JSON.parse(JSON.stringify(layer)) as MixLayer), id: newMixId(), span: slidesSpan(slides, col + 1, range.to) };
    change(m => {
      const at = m.layers.findIndex(l => l.id === layer.id);
      if (at < 0) return m;
      const list = [...m.layers];
      list[at] = { ...list[at], span: slidesSpan(slides, range.from, col) };
      list.splice(at + 1, 0, second);
      return { ...m, layers: list };
    });
    setCutNote(`Cut after slide ${col + 1}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'b' && e.key !== 'B') || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!selLayer) return;
      e.preventDefault();
      cutLayer(selLayer, hoverCol.current ?? playIndex);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const colAt = (clientX: number) => {
    const el = gridRef.current;
    if (!el || !n) return 0;
    const r = el.getBoundingClientRect();
    return clamp(Math.floor((clientX - r.left) / (r.width / n)), 0, n - 1);
  };
  /** Dropped on the timeline: plays on that slide (stretch the bar for more) */
  const dropOnTimeline = (e: React.DragEvent) => {
    e.preventDefault();
    setDropCol(null);
    const media = mediaFromDrop(e);
    const input = media ? null : inputFromDrop(e);
    if ((!media && !input) || !n) return;
    const col = colAt(e.clientX);
    addLayer(media
      ? newLayer({ kind: 'media', media }, slidesSpan(slides, col, col), baseName(media.name), startBox(media))
      : newLayer({ kind: 'input', input: input! }, slidesSpan(slides, col, col), input!.label, { ...NEW_MIX_BOX }));
    setPlayId(slides[col].id);
  };
  const replaceSource = async (layer: MixLayer) => {
    const file = await chooseDesignMediaFile();
    if (!file) return;
    changeLayer(layer.id, { source: { kind: 'media', media: { type: file.type, name: file.name, path: file.path, storedId: file.storedId } } });
  };
  const moveLayer = (id: string, dir: 1 | -1) => change(m => {
    const list = [...m.layers];
    const at = list.findIndex(l => l.id === id);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= list.length) return m;
    [list[at], list[to]] = [list[to], list[at]];
    return { ...m, layers: list };
  });
  const duplicateLayer = (id: string) => {
    const l = mix.layers.find(x => x.id === id);
    if (!l) return;
    const copy: MixLayer = { ...JSON.parse(JSON.stringify(l)), id: newMixId(), name: `${l.name} (copy)` };
    change(m => { const at = m.layers.findIndex(x => x.id === id); const list = [...m.layers]; list.splice(at + 1, 0, copy); return { ...m, layers: list }; });
    setSel({ kind: 'layer', id: copy.id });
  };
  const deleteLayer = (id: string) => { change(m => ({ ...m, layers: m.layers.filter(l => l.id !== id) })); setSel(null); };
  // Delete removes the picked layer (or slide picture); Ctrl+Z brings it back
  useDeleteKey(() => {
    if (selLayer) { deleteLayer(selLayer.id); return true; }
    if (selDesign) { p.onChangeDesignMedia(selDesign.slide.id, selDesign.media.id, null); setSel(null); return true; }
    return false;
  });
  const renameLayer = async (l: MixLayer) => {
    const name = await askText('Layer name', l.name, { okLabel: 'Rename' });
    if (name?.trim()) changeLayer(l.id, { name: name.trim() });
  };

  // ─── Timeline bars ───
  const startBarDrag = (e: React.PointerEvent, layer: MixLayer, mode: 'move' | 'start' | 'end', run: { from: number; to: number }) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    pickLayer(layer);
    if (layer.span.kind !== 'slides') return;
    e.preventDefault();
    const startCol = colAt(e.clientX);
    let last: { f: number; t: number } | null = null;
    const onMove = (ev: PointerEvent) => {
      const c = colAt(ev.clientX);
      let f = run.from, t = run.to;
      if (mode === 'move') { const d = clamp(c - startCol, -run.from, n - 1 - run.to); f += d; t += d; }
      else if (mode === 'start') f = Math.min(c, run.to);
      else t = Math.max(c, run.from);
      if (last && last.f === f && last.t === t) return;
      last = { f, t };
      changeLayer(layer.id, { span: slidesSpan(slides, f, t) }, 'draft');
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      if (last) changeLayer(layer.id, { span: slidesSpan(slides, last.f, last.t) }, 'commit');
      else setPlayId(slides[colAt(ev.clientX)]?.id ?? null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  // ─── What the screens show ───
  const showIsLive = liveIndex >= 0;
  // Layers taken off with F1 / Clear all that would still be playing on the live slide
  const clearedHere = showIsLive && p.liveMix?.showId === show?.id
    ? (p.liveMix?.suppressed || []).filter(id => mixLayersAt(saved, slides, liveIndex).some(l => l.id === id)) : [];
  const expectedLive = showIsLive ? mixLayersAt(saved, slides, liveIndex).filter(l => !clearedHere.includes(l.id)) : [];
  const liveMatches = showIsLive && p.liveMix?.showId === show?.id && stripUrls(expectedLive) === stripUrls(p.liveMix?.layers || []);
  const hasMix = saved.layers.length > 0;

  const previewLayers: LiveMixLayer[] = mixLayersAt(mix, slides, playIndex);
  const canvasSlide = playSlide && designDraft && designDraft.slideId === playSlide.id ? {
    ...playSlide,
    designs: {
      ...(playSlide.designs || {}),
      [p.mainScreenId]: {
        ...(playSlide.designs?.[p.mainScreenId] || {}),
        media: (playSlide.designs?.[p.mainScreenId]?.media || []).map(m => m.id === designDraft.mediaId ? { ...m, layout: designDraft.layout } : m),
      },
    },
  } : playSlide;
  const playDesignMedia = designItems.filter(d => d.index === playIndex);
  const endValue = mix.keepPlaying ? 'keep' : String(mix.fadeOut ?? DEFAULT_SHOW_END_FADE);

  if (!show) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-2 bg-[#07070a] text-center px-6" data-mix-workspace>
        <Film size={28} className="text-neutral-600" />
        <p className="text-sm text-neutral-400 max-w-md">Open a song, declaration or presentation (Shows tab or your setlist) to mix media for it.</p>
      </div>
    );
  }

  const menuItem = 'w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-left text-xs text-neutral-200';
  const tracks = [...mix.layers].reverse();
  // The timeline's rows, top first: borders (over everything), the words, then the other layers (under the words)
  const rows: (MixLayer | 'words')[] = [...tracks.filter(l => l.source.kind === 'border'), 'words', ...tracks.filter(l => l.source.kind !== 'border')];
  const gridCols = { gridTemplateColumns: `repeat(${Math.max(slides.length, 1)}, minmax(76px, 1fr))`, gridTemplateRows: '32px' };
  const wordsLeft = (
    <div key="words" className="h-8 px-1.5 flex items-center gap-1.5 border-b border-white/5" title="The show's words. The eye hides them here only, to work on the media alone; the screens still show them." data-mix-track="Words">
      <button type="button" onClick={() => setWordsHidden(!wordsHidden)} className="p-0.5 rounded text-neutral-400 hover:text-white" title={wordsHidden ? 'Show the words here again' : 'Hide the words here (the screens still show them)'} data-mix-hide-words>
        {wordsHidden ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <Type size={11} className="text-neutral-500 shrink-0" />
      <span className={`text-[11px] truncate ${wordsHidden ? 'text-neutral-500 line-through' : 'text-neutral-300'}`}>Words</span>
    </div>
  );
  const wordsRight = (
    <div key="words" className="grid h-8 border-b border-white/5" style={gridCols} data-mix-words-row>
      <div style={{ gridColumn: `1 / ${Math.max(slides.length, 1) + 1}`, gridRow: 1 }}
        className={`my-1 mx-0.5 rounded border border-white/15 bg-white/10 text-[10px] text-neutral-300 font-semibold flex items-center px-2 ${wordsHidden ? 'opacity-30' : ''}`}>
        Words{wordsHidden ? ' · hidden here' : ''}
      </div>
    </div>
  );

  return (
    <div ref={workspaceRef} className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#07070a] select-none" data-mix-workspace>
      {/* HEADER: the show, whether its mix is on the screens, and what happens when the show ends */}
      <div className="h-11 px-3 border-b border-[#262635] flex items-center gap-2.5 shrink-0 bg-[#101015]">
        {cutNote && <span className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[120] px-3 py-1.5 rounded-lg bg-[#18181b] border border-white/10 text-xs text-neutral-100 shadow-2xl" data-mix-cut-note>{cutNote}</span>}
        <Film size={14} className="text-pink-400 shrink-0" />
        <span className="text-xs font-semibold text-white truncate max-w-[220px]" title={show.title}>{show.title}</span>
        {hasMix && (showIsLive ? (liveMatches && clearedHere.length ? (
          <>
            <span className="text-neutral-300 text-[11px] whitespace-nowrap" data-mix-status="cleared">Mix cleared (F1)</span>
            <button type="button" onClick={p.onUpdateScreens} className={`${smallBtn} bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1`} title="Put this show's mix back on the screens" data-mix-update>
              <Play size={10} className="fill-current" /> Play again
            </button>
          </>
        ) : liveMatches ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white whitespace-nowrap" data-mix-status="live">● On the screens</span>
        ) : (
          <>
            <span className="text-amber-300 text-[11px] whitespace-nowrap" data-mix-status="changed">Changes not on the screens yet</span>
            <button type="button" onClick={p.onUpdateScreens} className={`${smallBtn} bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1`} data-mix-update>
              <Send size={10} /> Update screens
            </button>
          </>
        )) : (
          <>
            <span className="text-neutral-400 text-[11px] whitespace-nowrap" data-mix-status="off">Not on the screens</span>
            {playSlide && (
              <button type="button" onClick={() => p.onGoLive(playSlide)} className={`${smallBtn} bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1`} title={`Show slide ${playIndex + 1} on the screens, with its mix`} data-mix-golive>
                <Play size={10} className="fill-current" /> Go live
              </button>
            )}
          </>
        ))}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setMenu(menu === 'add' ? null : 'add')} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} data-mix-add>
              <Plus size={11} /> Add <ChevronDown size={11} />
            </button>
            {menu === 'add' && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl" data-mix-add-menu>
                <button type="button" className={menuItem} onClick={() => { setMenu(null); void addFile(); }} data-mix-add-file><ImageIcon size={13} className="text-neutral-400" /> Picture or video…</button>
                <button type="button" className={menuItem} onClick={() => { setMenu(null); addColour(false); }} data-mix-add-colour><Palette size={13} className="text-neutral-400" /> Colour wash</button>
                <button type="button" className={menuItem} onClick={() => { setMenu(null); addColour(true); }} data-mix-add-gradient><Palette size={13} className="text-neutral-400" /> Gradient</button>
                <button type="button" className={menuItem} onClick={() => { setMenu(null); addBorder(); }} data-mix-add-border><Frame size={13} className="text-neutral-400" /> Border</button>
                <div className="px-3 pt-1.5 pb-1 text-[10px] text-neutral-500 leading-snug border-t border-white/5 mt-1">Or drag from the Media tab: onto the screen (plays the whole show) or onto a slide in the timeline.</div>
              </div>
            )}
          </div>
          <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setMenu(menu === 'mix' ? null : 'mix')} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} data-mix-menu-button>
              Mix <ChevronDown size={11} />
            </button>
            {menu === 'mix' && (
              <div className="absolute right-0 top-full mt-1 z-50 w-72 max-h-[60vh] overflow-y-auto custom-scrollbar py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl" data-mix-menu>
                <button type="button" disabled={!hasMix} className={`${menuItem} disabled:opacity-40`} data-mix-save
                  onClick={async () => { setMenu(null); const name = await askText('Name for this mix (to use it in other shows)', `${show.title} mix`, { okLabel: 'Save' }); if (name?.trim()) p.onSaveMix(name.trim()); }}>
                  <Save size={13} className="text-neutral-400" /> Save as a reusable mix…
                </button>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-500">Use a saved mix</div>
                {p.savedMixes.length === 0 && <div className="px-3 pb-1.5 text-[11px] text-neutral-500">None yet</div>}
                {p.savedMixes.map(m => (
                  <div key={m.id} className="flex items-center gap-1 px-1.5" data-saved-mix={m.name}>
                    <button type="button" className={`${menuItem} flex-1 min-w-0`} title={`Use "${m.name}" for this show (replaces its mix)`}
                      onClick={async () => { setMenu(null); if (hasMix && !(await askConfirm(`Replace the mix of "${show.title}" with "${m.name}"?`, { okLabel: 'Replace' }))) return; p.onUseSavedMix(m.id); }}>
                      <Film size={12} className="text-neutral-400 shrink-0" /> <span className="truncate">{m.name}</span>
                      <span className="ml-auto text-[10px] text-neutral-500 shrink-0">{m.mix.layers.length} layer{m.mix.layers.length === 1 ? '' : 's'}</span>
                    </button>
                    <button type="button" className="p-1 rounded text-neutral-500 hover:text-white hover:bg-white/10" title="Rename"
                      onClick={async () => { setMenu(null); const name = await askText('Mix name', m.name, { okLabel: 'Rename' }); if (name?.trim()) p.onRenameSavedMix(m.id, name.trim()); }}><Pencil size={11} /></button>
                    <button type="button" className="p-1 rounded text-neutral-500 hover:text-red-300 hover:bg-red-500/10" title="Delete"
                      onClick={async () => { setMenu(null); if (await askConfirm(`Delete the saved mix "${m.name}"? Shows that use it keep their own copy.`, { okLabel: 'Delete', danger: true })) p.onDeleteSavedMix(m.id); }}><Trash2 size={11} /></button>
                  </div>
                ))}
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-500 border-t border-white/5 mt-1">Copy this mix to</div>
                {!hasMix && <div className="px-3 pb-1.5 text-[11px] text-neutral-500">Add a layer first</div>}
                {hasMix && p.otherShows.map(s => (
                  <button key={s.id} type="button" className={menuItem} data-mix-copy-to={s.title}
                    onClick={async () => { setMenu(null); if (s.hasMix && !(await askConfirm(`"${s.title}" already has a mix. Replace it with a copy of this one?`, { okLabel: 'Replace' }))) return; p.onCopyMixTo(s.id); }}>
                    <Copy size={12} className="text-neutral-400 shrink-0" /> <span className="truncate">{s.title}</span>
                    {s.hasMix && <span className="ml-auto text-[10px] text-amber-300/80 shrink-0">has a mix</span>}
                  </button>
                ))}
                {hasMix && (
                  <>
                    <div className="h-px bg-white/5 my-1" />
                    <button type="button" className={`${menuItem} text-red-300`} data-mix-clear
                      onClick={async () => { setMenu(null); if (await askConfirm(`Remove every layer of the mix of "${show.title}"?`, { okLabel: 'Remove', danger: true })) { change(m => ({ ...m, layers: [] })); setSel(null); } }}>
                      <Trash2 size={13} /> Clear this mix
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <Divider />
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-400" title="What the mix does when you move on to another show">
            Show ends:
            <select
              value={endValue}
              onChange={(e) => change(m => e.target.value === 'keep' ? { ...m, keepPlaying: true } : { ...m, keepPlaying: undefined, fadeOut: parseFloat(e.target.value) })}
              className={`${selectCls} max-w-[200px]`}
              data-mix-show-end
            >
              {END_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-300 cursor-pointer" title="On: changes go to the screens as soon as you let go. Off: they wait until you click Update screens (or the next slide goes live).">
            <input type="checkbox" checked={p.autoSend} onChange={(e) => p.onAutoSend(e.target.checked)} className="accent-pink-500" data-mix-autosend />
            Send edits at once
          </label>
          <button type="button" onClick={() => setGuides(v => !v)} className={`${smallBtn} ${guides ? 'bg-white/10 text-white' : 'bg-white/5 text-neutral-500'}`} title="Show or hide the outlines of the layers">Guides</button>
        </div>
      </div>

      {/* CANVAS + SETTINGS */}
      <div className="flex-1 min-h-0 flex">
        <div
          ref={canvasRef}
          className="flex-1 min-w-0 min-h-0 p-3"
          onDragOver={(e) => { if (isMediaDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
          onDrop={dropOnCanvas}
          onDoubleClickCapture={(e) => {
            // Double-click on the words: design them in Design mode (before a layer's outline takes the click)
            if (playSlide && wordAt(e.clientX, e.clientY)) { e.stopPropagation(); p.onEditInDesign(playSlide.id); }
          }}
          data-mix-canvas
        >
          <FixedStage className="w-full h-full">
            {(scale: number) => (
              <>
                <div className="absolute inset-0 bg-black" data-mix-stage />
                {p.renderScreen(canvasSlide, previewLayers, wordsHidden)}
                {guides && previewLayers.filter(l => l.id !== selLayer?.id).map(l => (
                  <React.Fragment key={l.id}>
                    <DesignBox rect={l.layout} scale={scale} movable label={`${l.name} · drag to move · corners to resize`}
                      onSelect={() => setSel({ kind: 'layer', id: l.id })}
                      onChange={(r) => changeLayer(l.id, { layout: r }, 'draft')}
                      onChangeEnd={(r) => changeLayer(l.id, { layout: r }, 'commit')} />
                  </React.Fragment>
                ))}
                {guides && playDesignMedia.filter(d => !(selDesign && selDesign.media.id === d.media.id)).map(d => (
                  <React.Fragment key={d.media.id}>
                    <DesignBox rect={d.media.layout} scale={scale} movable label="Slide picture (from Design mode)" tag={{ text: 'Slide picture', tone: 'grey' }}
                      onSelect={() => setSel({ kind: 'design', slideId: d.slide.id, mediaId: d.media.id })}
                      onChange={(r) => setDesignDraft({ slideId: d.slide.id, mediaId: d.media.id, layout: r })}
                      onChangeEnd={(r) => { setDesignDraft(null); p.onChangeDesignMedia(d.slide.id, d.media.id, { layout: r }); }} />
                  </React.Fragment>
                ))}
                {guides && selLayer && layerPlaysAt(selLayer, slides, playIndex) && !selLayer.hidden && (
                  <DesignBox rect={selLayer.layout} scale={scale} movable selected label={`${selLayer.name} · drag to move · corners to resize`}
                    onSelect={() => setSel({ kind: 'layer', id: selLayer.id })}
                    onChange={(r) => changeLayer(selLayer.id, { layout: r }, 'draft')}
                    onChangeEnd={(r) => changeLayer(selLayer.id, { layout: r }, 'commit')} />
                )}
                {guides && selDesign && selDesign.index === playIndex && (
                  <DesignBox rect={designDraft?.mediaId === selDesign.media.id ? designDraft.layout : selDesign.media.layout} scale={scale} movable selected label="Slide picture (from Design mode)"
                    onSelect={() => undefined}
                    onChange={(r) => setDesignDraft({ slideId: selDesign.slide.id, mediaId: selDesign.media.id, layout: r })}
                    onChangeEnd={(r) => { setDesignDraft(null); p.onChangeDesignMedia(selDesign.slide.id, selDesign.media.id, { layout: r }); }} />
                )}
              </>
            )}
          </FixedStage>
        </div>

        {/* SETTINGS for the picked layer */}
        <div className="w-72 shrink-0 border-l border-[#262635] bg-[#0d0d12] overflow-y-auto custom-scrollbar" data-mix-inspector>
          {selLayer ? (
            <React.Fragment key={selLayer.id}><LayerSettings
              layer={selLayer}
              slides={slides}
              groups={groups}
              screens={p.screens}
              mainScreenId={p.mainScreenId}
              onChange={(patch, phase) => changeLayer(selLayer.id, patch, phase)}
              onEffect={(patch, phase) => setEffect(selLayer.id, patch, phase)}
              onReplace={() => void replaceSource(selLayer)}
              onMove={(dir) => moveLayer(selLayer.id, dir)}
              onDuplicate={() => duplicateLayer(selLayer.id)}
              onDelete={() => deleteLayer(selLayer.id)}
              isTop={mix.layers[mix.layers.length - 1]?.id === selLayer.id}
              isBottom={mix.layers[0]?.id === selLayer.id}
            /></React.Fragment>
          ) : selDesign ? (
            <div className="p-3 space-y-3" data-mix-design-settings>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Slide picture</div>
                <p className="text-[11px] text-neutral-400 mt-1">Added in Design mode on slide {selDesign.index + 1}. It shows on that slide only, above the mix.</p>
              </div>
              <DesignMediaControls
                item={selDesign.media}
                onChange={(patch) => p.onChangeDesignMedia(selDesign.slide.id, selDesign.media.id, patch)}
                onReplace={async () => { const f = await chooseDesignMediaFile(); if (f) p.onChangeDesignMedia(selDesign.slide.id, selDesign.media.id, { type: f.type, name: f.name, path: f.path, storedId: f.storedId }); }}
                onRemove={() => { p.onChangeDesignMedia(selDesign.slide.id, selDesign.media.id, null); setSel(null); }}
              />
              <button type="button" onClick={() => p.onEditInDesign(selDesign.slide.id)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10`}>Open the slide in Design mode</button>
            </div>
          ) : (
            <div className="p-4 space-y-3 text-[11px] text-neutral-400 leading-relaxed" data-mix-help>
              <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Mix</div>
              <p>Layers of pictures, videos and colour under the words of <span className="text-neutral-200">{show.title}</span>. The mix travels with this show to every setlist.</p>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Drag from the <span className="text-neutral-200">Media tab</span> onto the screen (plays the whole show) or onto a slide below (plays on that slide). Cameras, screens and NDI sources too (Media → Inputs).</li>
                <li>Drag a bar's ends in the timeline to choose the slides it plays on.</li>
                <li>Click a layer to change its opacity, blend, effects and fades.</li>
                <li>Double-click the words to design them in Design mode.</li>
                <li>Pick a layer, point at a slide in the timeline and press <span className="text-neutral-200">B</span> to cut it after that slide.</li>
                <li>When a slide goes live, its layers go on the main screen. Layers that carry on keep playing.</li>
                <li><span className="text-neutral-200">F1</span> clears the mix with the background.</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* TIMELINE: one row per layer (top layer first), one column per slide */}
      <div
        className="h-[6px] shrink-0 bg-[#1a1a24] hover:bg-pink-500/50 cursor-row-resize transition-colors"
        onPointerDown={startResize}
        onDoubleClick={() => setTimelineH(defaultTimelineH())}
        title="Drag up for a smaller preview and more room below · double-click to reset"
        data-mix-resize
      />
      <div className="shrink-0 bg-[#0b0b10] overflow-y-auto custom-scrollbar" style={{ height: timelineH }} data-mix-timeline>
        <div className="flex min-w-0">
          <div className="w-44 shrink-0 border-r border-[#262635] bg-[#0d0d12]">
            <div className="h-10 px-2 flex items-center text-[10px] uppercase tracking-wider text-neutral-500 border-b border-[#262635]">Layers · top first</div>
            {rows.map(l => {
              if (l === 'words') return wordsLeft;
              const Icon = sourceIcon(l);
              const on = selLayer?.id === l.id;
              return (
                <div
                  key={l.id}
                  onClick={() => pickLayer(l)}
                  onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, id: l.id }); }}
                  className={`h-8 px-1.5 flex items-center gap-1.5 border-b border-white/5 cursor-pointer ${on ? 'bg-pink-600/20' : 'hover:bg-white/5'}`}
                  title="Click to change it · right-click for more"
                  data-mix-track={l.name}
                >
                  <button type="button" onClick={(e) => { e.stopPropagation(); changeLayer(l.id, { hidden: l.hidden ? undefined : true }); }} className="p-0.5 rounded text-neutral-400 hover:text-white" title={l.hidden ? 'Play it again' : 'Keep it in the mix but don’t play it'}>
                    {l.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <Icon size={11} className="text-neutral-500 shrink-0" />
                  <span className={`text-[11px] truncate ${l.hidden ? 'text-neutral-500 line-through' : on ? 'text-white' : 'text-neutral-300'}`}>{l.name}</span>
                </div>
              );
            })}
            {designItems.length > 0 && (
              <div className="h-8 px-2 flex items-center gap-1.5 border-b border-white/5 text-[11px] text-neutral-400" title="Pictures added to single slides in Design mode">
                <ImageIcon size={11} className="text-neutral-500" /> Slide pictures
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
            <div
              ref={gridRef}
              className="relative"
              style={{ minWidth: Math.max(n, 1) * 76 }}
              onDragOver={(e) => { if (isMediaDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropCol(colAt(e.clientX)); } }}
              onDragLeave={() => setDropCol(null)}
              onDrop={dropOnTimeline}
              onMouseMove={(e) => { hoverCol.current = colAt(e.clientX); }}
              onMouseLeave={() => { hoverCol.current = null; }}
              data-mix-grid
            >
              {/* Slides */}
              <div className="grid h-10 border-b border-[#262635]" style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(76px, 1fr))` }}>
                {slides.map((s, i) => {
                  const startsGroup = !!s.group && slides[i - 1]?.group !== s.group;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setPlayId(s.id)}
                      onDoubleClick={() => p.onGoLive(s)}
                      className={`relative px-1.5 text-left border-r border-white/5 overflow-hidden ${i === playIndex ? 'bg-pink-600/25' : 'hover:bg-white/5'} ${dropCol === i ? 'ring-2 ring-inset ring-sky-400' : ''}`}
                      title={`Slide ${i + 1}: ${s.text.split('\n')[0]}\nClick to show it here · double-click to go live`}
                      data-mix-slide={i + 1}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-neutral-300">{i + 1}</span>
                        {i === liveIndex && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="On the screens" />}
                        {startsGroup && <span className={`text-[9px] font-bold uppercase truncate ${groupColors(s.group!).text}`}>{s.group}</span>}
                      </div>
                      <div className="text-[9px] text-neutral-500 truncate">{s.text.split('\n')[0] || ' '}</div>
                    </button>
                  );
                })}
              </div>

              {/* Layers */}
              {rows.map(l => l === 'words' ? wordsRight : (
                <div key={l.id} className="grid h-8 border-b border-white/5" style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(76px, 1fr))`, gridTemplateRows: '32px' }}>
                  {n > 0 && <div className="bg-white/[0.04]" style={{ gridColumn: playIndex + 1, gridRow: 1 }} />}
                  {layerRuns(l, slides).map(run => {
                    const draggable = l.span.kind === 'slides';
                    const on = selLayer?.id === l.id;
                    return (
                      <div
                        key={`${run.from}-${run.to}`}
                        style={{ gridColumn: `${run.from + 1} / ${run.to + 2}`, gridRow: 1 }}
                        className={`relative my-1 mx-0.5 rounded border text-[10px] text-white font-semibold flex items-center px-2 overflow-hidden ${barColour(l)} ${on ? 'ring-2 ring-white' : ''} ${l.hidden ? 'opacity-30' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                        onPointerDown={(e) => startBarDrag(e, l, 'move', run)}
                        onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, id: l.id }); }}
                        title={l.span.kind === 'show' ? `${l.name}: plays the whole show` : l.span.kind === 'group' ? `${l.name}: plays on every ${l.span.group}` : `${l.name}: drag to move, drag the ends to change which slides`}
                        data-mix-bar={l.name}
                      >
                        <span className="truncate pointer-events-none">{l.name}{l.span.kind === 'show' ? ' · whole show' : l.span.kind === 'group' ? ` · every ${l.span.group}` : ''}</span>
                        {draggable && (
                          <>
                            <span className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60" onPointerDown={(e) => startBarDrag(e, l, 'start', run)} data-mix-bar-start />
                            <span className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60" onPointerDown={(e) => startBarDrag(e, l, 'end', run)} data-mix-bar-end />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Pictures added to single slides in Design mode */}
              {designItems.length > 0 && (
                <div className="grid h-8 border-b border-white/5" style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(76px, 1fr))`, gridTemplateRows: '32px' }}>
                  {designItems.map(d => (
                    <button
                      key={d.media.id}
                      type="button"
                      style={{ gridColumn: d.index + 1, gridRow: 1 }}
                      onClick={() => { setSel({ kind: 'design', slideId: d.slide.id, mediaId: d.media.id }); setPlayId(d.slide.id); }}
                      className={`my-1 mx-0.5 rounded border border-amber-300/50 bg-amber-500/40 text-[10px] text-white px-1.5 flex items-center gap-1 overflow-hidden ${selDesign?.media.id === d.media.id ? 'ring-2 ring-white' : ''}`}
                      title={`${d.media.name} (Design mode, slide ${d.index + 1})`}
                      data-mix-design-item={d.index + 1}
                    >
                      <ImageIcon size={10} className="shrink-0" /> <span className="truncate">{d.media.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {tracks.length === 0 && (
                <div className="h-20 flex items-center px-4 text-[11px] text-neutral-500" data-mix-empty>
                  No layers yet. Drag a picture or video from the Media tab onto the screen above (plays the whole show) or onto a slide here (plays on that slide), or use Add.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right-click on a layer */}
      {ctx && (() => {
        const l = mix.layers.find(x => x.id === ctx.id);
        if (!l) return null;
        const at = mix.layers.findIndex(x => x.id === l.id);
        return (
          <div className="fixed z-[150] min-w-[200px] py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl"
            style={{ left: Math.min(ctx.x, window.innerWidth - 210), top: ctx.y, transform: ctx.y > window.innerHeight / 2 ? 'translateY(-100%)' : undefined }}
            onPointerDown={(e) => e.stopPropagation()} data-mix-context>
            <button type="button" className={menuItem} onClick={() => { setCtx(null); void renameLayer(l); }}><Pencil size={13} className="text-neutral-400" /> Rename</button>
            <button type="button" className={menuItem} onClick={() => { setCtx(null); duplicateLayer(l.id); }}><Copy size={13} className="text-neutral-400" /> Duplicate</button>
            <button type="button" disabled={at === mix.layers.length - 1} className={`${menuItem} disabled:opacity-40`} onClick={() => { setCtx(null); moveLayer(l.id, 1); }}><ArrowUp size={13} className="text-neutral-400" /> Bring forward</button>
            <button type="button" disabled={at === 0} className={`${menuItem} disabled:opacity-40`} onClick={() => { setCtx(null); moveLayer(l.id, -1); }}><ArrowDown size={13} className="text-neutral-400" /> Send backward</button>
            <button type="button" className={menuItem} onClick={() => { setCtx(null); changeLayer(l.id, { hidden: l.hidden ? undefined : true }); }}>{l.hidden ? <Eye size={13} className="text-neutral-400" /> : <EyeOff size={13} className="text-neutral-400" />} {l.hidden ? 'Play it' : 'Don’t play it'}</button>
            <div className="h-px bg-white/5 my-1" />
            <button type="button" className={`${menuItem} text-red-300`} onClick={() => { setCtx(null); deleteLayer(l.id); }} data-mix-delete><Trash2 size={13} /> Delete layer</button>
          </div>
        );
      })()}
    </div>
  );
}

/** Ready-made colours (worship-friendly washes), plus any colour */
const PALETTE = [
  '#000000', '#ffffff', '#0f172a', '#1e3a8a', '#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6',
  '#059669', '#65a30d', '#facc15', '#f59e0b', '#ea580c', '#dc2626', '#be123c', '#db2777',
  '#c026d3', '#7c3aed', '#4c1d95', '#78350f',
];
function ColourPalette({ value, onChange }: { value: string; onChange: (v: string, phase: Phase) => void }) {
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

type BorderSource = Extract<MixSource, { kind: 'border' }>;
/** A border's shape, what covers the outside, and the edge line */
function BorderSettings({ border, onChange }: { border: BorderSource; onChange: (patch: Partial<BorderSource>, phase?: Phase) => void }) {
  const shape = border.shape || 'rect';
  const outside = border.outside || '#000000';
  return (
    <div className="mt-2 space-y-3" data-mix-border-settings>
      <p className="text-[11px] text-neutral-500 leading-snug">Drag the shape on the screen to move it, its corners to resize. Everything outside it stays covered, whatever you show.</p>
      <div className="flex items-center gap-2 text-[11px] text-neutral-400">
        <span className="w-[72px] shrink-0">Shape</span>
        <div className="flex rounded overflow-hidden">
          {([['rect', 'Rectangle'], ['rounded', 'Rounded'], ['oval', 'Oval']] as const).map(([s, label]) => (
            <button key={s} type="button" onClick={() => onChange({ shape: s })} className={segBtn(shape === s)} data-mix-border-shape={s}>{label}</button>
          ))}
        </div>
      </div>
      {shape === 'rounded' && (
        <Slider label="Corners" min={0} max={540} step={1} value={border.radius ?? 80} format={(v) => `${v}px`} onChange={(v, phase) => onChange({ radius: v }, phase)} />
      )}
      <div>
        <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
          <span>Outside</span>
          <button type="button" onClick={() => onChange({ outside: outside === 'transparent' ? '#000000' : 'transparent' })} className="text-neutral-500 hover:text-white" data-mix-border-outside-none>
            {outside === 'transparent' ? 'Cover it' : 'Don’t cover'}
          </button>
        </div>
        {outside === 'transparent'
          ? <p className="text-[11px] text-neutral-500">Not covered: only the edge line shows.</p>
          : <ColourPalette value={outside} onChange={(v, phase) => onChange({ outside: v }, phase)} />}
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] text-neutral-400">Edge line</div>
        <ColourPalette value={border.color} onChange={(v, phase) => onChange({ color: v }, phase)} />
        <Slider label="Thickness" min={0} max={120} step={1} value={border.width} format={(v) => v ? `${v}px` : 'none'} onChange={(v, phase) => onChange({ width: v }, phase)} />
        {border.width > 0 && <Slider label="Glow" min={0} max={200} step={1} value={border.glow} format={(v) => v ? `${v}px` : 'none'} onChange={(v, phase) => onChange({ glow: v }, phase)} />}
      </div>
    </div>
  );
}

/** Everything about one layer: what it plays, when, how it looks, and on which screens */
function LayerSettings({ layer, slides, groups, screens, mainScreenId, onChange, onEffect, onReplace, onMove, onDuplicate, onDelete, isTop, isBottom }: {
  layer: MixLayer;
  slides: SlideDefinition[];
  groups: string[];
  screens: Screen[];
  mainScreenId: string;
  onChange: (patch: Partial<MixLayer> | ((l: MixLayer) => MixLayer), phase?: Phase) => void;
  onEffect: (patch: Partial<MixEffects>, phase?: Phase) => void;
  onReplace: () => void;
  onMove: (dir: 1 | -1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  isTop: boolean;
  isBottom: boolean;
}) {
  const [name, setName] = useState(layer.name);
  useEffect(() => setName(layer.name), [layer.name]);
  const fx = layer.effects || {};
  const isVideo = layer.source.kind === 'media' && layer.source.media.type === 'video';
  const isBorder = layer.source.kind === 'border';
  const isFull = layer.layout.x === 0 && layer.layout.y === 0 && layer.layout.width === 1 && layer.layout.height === 1;
  const range = layer.span.kind === 'slides' ? (() => {
    const fi = slides.findIndex(s => s.id === (layer.span as any).fromId); const ti = slides.findIndex(s => s.id === (layer.span as any).toId);
    return { from: fi >= 0 ? fi : (layer.span as any).from, to: ti >= 0 ? ti : (layer.span as any).to };
  })() : null;
  const slideLabel = (i: number) => `Slide ${i + 1}${slides[i]?.group ? ` · ${slides[i].group}` : ''}`;
  const playsOn = layer.outputs?.length ? layer.outputs : [mainScreenId];
  const toggleScreen = (id: string) => {
    const next = playsOn.includes(id) ? playsOn.filter(x => x !== id) : [...playsOn, id];
    onChange({ outputs: next.length === 0 || (next.length === 1 && next[0] === mainScreenId) ? undefined : next });
  };
  const setSpanKind = (kind: MixSpan['kind']) => {
    if (kind === layer.span.kind) return;
    if (kind === 'show') onChange({ span: { kind: 'show' } });
    else if (kind === 'group') onChange({ span: { kind: 'group', group: groups[0] || '' } });
    else onChange({ span: slidesSpan(slides, 0, Math.max(0, slides.length - 1)) });
  };
  const blendHint = MIX_BLENDS.find(b => b.value === (layer.blend || 'normal'))?.hint;

  return (
    <div data-mix-layer-settings>
      <div className="px-3 pt-3 pb-2 border-b border-[#262635]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== layer.name) onChange({ name: name.trim() }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-full bg-transparent text-sm font-semibold text-white outline-none border-b border-transparent focus:border-pink-500"
          data-mix-layer-name
        />
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-400 min-w-0">
          {layer.source.kind === 'media' ? (
            <>
              {isVideo ? <Video size={12} className="shrink-0" /> : <ImageIcon size={12} className="shrink-0" />}
              <span className="truncate" title={layer.source.media.path || layer.source.media.name}>{layer.source.media.name}</span>
              <button type="button" onClick={onReplace} className="ml-auto shrink-0 flex items-center gap-1 text-neutral-300 hover:text-white" title="Use another picture or video"><RefreshCw size={11} /> Replace</button>
            </>
          ) : layer.source.kind === 'input' ? (
            <>
              <Radio size={12} className="shrink-0 text-rose-300" />
              <span className="truncate" title={layer.source.input.label}>Live: {layer.source.input.label}</span>
            </>
          ) : layer.source.kind === 'color' ? (
            <span>Colour wash</span>
          ) : layer.source.kind === 'border' ? (
            <span>Border · over everything, words too</span>
          ) : (
            <span>Gradient</span>
          )}
        </div>
        {layer.source.kind === 'color' && (
          <div className="mt-2"><ColourPalette value={layer.source.color} onChange={(v, phase) => onChange({ source: { kind: 'color', color: v } }, phase)} /></div>
        )}
        {layer.source.kind === 'gradient' && (
          <div className="mt-2 space-y-2">
            <div><div className="text-[10px] text-neutral-500 mb-1">From</div><ColourPalette value={layer.source.from} onChange={(v, phase) => onChange(l => ({ ...l, source: { ...(l.source as any), from: v } }), phase)} /></div>
            <div><div className="text-[10px] text-neutral-500 mb-1">To</div><ColourPalette value={layer.source.to} onChange={(v, phase) => onChange(l => ({ ...l, source: { ...(l.source as any), to: v } }), phase)} /></div>
          </div>
        )}
        {layer.source.kind === 'border' && (
          <BorderSettings border={layer.source} onChange={(patch, phase) => onChange(l => ({ ...l, source: { ...(l.source as any), ...patch } }), phase)} />
        )}
        {layer.source.kind === 'gradient' && (
          <div className="mt-2"><Slider label="Angle" min={0} max={360} step={5} value={layer.source.angle} format={(v) => `${v}°`} onChange={(v, phase) => onChange(l => ({ ...l, source: { ...(l.source as any), angle: v } }), phase)} /></div>
        )}
      </div>

      <Section title="Plays on">
        <div className="flex rounded overflow-hidden">
          <button type="button" onClick={() => setSpanKind('slides')} className={`${segBtn(layer.span.kind === 'slides')} flex-1`} data-mix-span="slides">Slides</button>
          <button type="button" onClick={() => setSpanKind('group')} disabled={!groups.length} className={`${segBtn(layer.span.kind === 'group')} flex-1 disabled:opacity-30`} title={groups.length ? 'Every slide of one section, e.g. every Chorus' : 'This show has no sections yet (Verse, Chorus…): set them in Design mode'} data-mix-span="group">Every section</button>
          <button type="button" onClick={() => setSpanKind('show')} className={`${segBtn(layer.span.kind === 'show')} flex-1`} data-mix-span="show">Whole show</button>
        </div>
        {range && (
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <select value={range.from} onChange={(e) => onChange({ span: slidesSpan(slides, Number(e.target.value), Math.max(Number(e.target.value), range.to)) })} className={`${selectCls} flex-1 min-w-0`} data-mix-from>
              {slides.map((_, i) => <option key={i} value={i}>{slideLabel(i)}</option>)}
            </select>
            <span>to</span>
            <select value={range.to} onChange={(e) => onChange({ span: slidesSpan(slides, Math.min(range.from, Number(e.target.value)), Number(e.target.value)) })} className={`${selectCls} flex-1 min-w-0`} data-mix-to>
              {slides.map((_, i) => <option key={i} value={i}>{slideLabel(i)}</option>)}
            </select>
          </div>
        )}
        {layer.span.kind === 'group' && (
          <select value={layer.span.group} onChange={(e) => onChange({ span: { kind: 'group', group: e.target.value } })} className={`${selectCls} w-full`} data-mix-group>
            {groups.map(g => <option key={g} value={g}>Every {g}</option>)}
          </select>
        )}
        {layer.span.kind === 'show' && <p className="text-[11px] text-neutral-500">The whole time this show is on. It keeps playing from slide to slide.</p>}
      </Section>

      <Section title="Look" right={
        <button type="button" onClick={() => onChange({ layout: isFull ? { ...NEW_MIX_BOX } : { ...FULL_SCREEN_RECT } })} className="text-[11px] text-neutral-300 hover:text-white flex items-center gap-1" data-mix-full>
          {isFull ? <><Minimize2 size={11} /> Smaller</> : <><Maximize2 size={11} /> Full screen</>}
        </button>
      }>
        <Slider label="Opacity" min={0} max={100} step={1} value={layer.opacity ?? 100} format={(v) => `${v}%`} onChange={(v, phase) => onChange({ opacity: v }, phase)} />
        {!isBorder && <label className="flex items-center gap-2 text-[11px] text-neutral-400" title={blendHint}>
          <span className="w-[72px] shrink-0">Blend</span>
          <select value={layer.blend || 'normal'} onChange={(e) => onChange({ blend: e.target.value as MixBlend })} className={`${selectCls} flex-1`} data-mix-blend>
            {MIX_BLENDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </label>}
        {layer.source.kind === 'media' && (
          <div className="flex items-center gap-2 text-[11px] text-neutral-400">
            <span className="w-[72px] shrink-0">Fill the box</span>
            <div className="flex rounded overflow-hidden">
              <button type="button" onClick={() => onChange({ fit: 'cover' })} className={segBtn((layer.fit || 'cover') === 'cover')} title="Fill the box (may crop)">Fill</button>
              <button type="button" onClick={() => onChange({ fit: 'contain' })} className={segBtn(layer.fit === 'contain')} title="Show all of it">Fit</button>
            </div>
          </div>
        )}
        <Slider label="Rotation" min={-180} max={180} step={1} value={layer.rotation ?? 0} format={(v) => `${v}°`} onChange={(v, phase) => onChange({ rotation: v || undefined }, phase)} />
        {!isBorder && <><div className="flex items-center gap-2 text-[11px] text-neutral-400">
          <span className="w-[72px] shrink-0">Shape</span>
          <div className="flex rounded overflow-hidden">
            {(['square', 'rounded', 'circle'] as const).map(s => (
              <button key={s} type="button" onClick={() => onChange({ shape: s === 'square' ? undefined : s })} className={segBtn((layer.shape || 'square') === s)}>
                {s === 'square' ? 'Square' : s === 'rounded' ? 'Rounded' : 'Circle'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-neutral-400">
          <span className="w-[72px] shrink-0">Flip</span>
          <button type="button" onClick={() => onChange({ flipX: layer.flipX ? undefined : true })} className={`${smallBtn} flex items-center gap-1 ${layer.flipX ? 'bg-pink-600 text-white' : 'bg-white/5 text-neutral-300 hover:bg-white/10'}`} title="Flip left to right"><FlipHorizontal size={12} /> Across</button>
          <button type="button" onClick={() => onChange({ flipY: layer.flipY ? undefined : true })} className={`${smallBtn} flex items-center gap-1 ${layer.flipY ? 'bg-pink-600 text-white' : 'bg-white/5 text-neutral-300 hover:bg-white/10'}`} title="Flip upside down"><FlipVertical size={12} /> Upside down</button>
        </div></>}
      </Section>

      {!isBorder && <Section title="Effects" right={
        <button type="button" onClick={() => onChange({ effects: undefined })} disabled={!layer.effects} className="text-[11px] text-neutral-400 hover:text-white disabled:opacity-30 flex items-center gap-1"><RotateCcw size={11} /> Reset</button>
      }>
        <Slider label="Brightness" min={0} max={200} step={1} value={fx.brightness ?? 100} format={(v) => `${v}%`} onChange={(v, phase) => onEffect({ brightness: v }, phase)} />
        <Slider label="Contrast" min={0} max={200} step={1} value={fx.contrast ?? 100} format={(v) => `${v}%`} onChange={(v, phase) => onEffect({ contrast: v }, phase)} />
        <Slider label="Saturation" min={0} max={200} step={1} value={fx.saturation ?? 100} format={(v) => v === 0 ? 'black & white' : `${v}%`} onChange={(v, phase) => onEffect({ saturation: v }, phase)} />
        {(layer.source.kind === 'media' || layer.source.kind === 'input') && (
          <div className="space-y-1.5" data-mix-tint-settings>
            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>Tint</span>
              {fx.tint && <button type="button" onClick={() => onEffect({ tint: undefined, tintAmount: undefined })} className="text-neutral-500 hover:text-white">None</button>}
            </div>
            <ColourPalette value={fx.tint || ''} onChange={(v, phase) => onEffect({ tint: v }, phase)} />
            {fx.tint && <Slider label="Tint amount" min={0} max={100} step={1} value={fx.tintAmount ?? 100} format={(v) => `${v}%`} onChange={(v, phase) => onEffect({ tintAmount: v }, phase)} />}
          </div>
        )}
        <Slider label="Hue" min={-180} max={180} step={1} value={fx.hue ?? 0} format={(v) => `${v}°`} onChange={(v, phase) => onEffect({ hue: v }, phase)} />
        <Slider label="Blur" min={0} max={60} step={1} value={fx.blur ?? 0} format={(v) => `${v}px`} onChange={(v, phase) => onEffect({ blur: v }, phase)} />
        <Slider label="Vignette" min={0} max={100} step={1} value={fx.vignette ?? 0} format={(v) => `${v}%`} onChange={(v, phase) => onEffect({ vignette: v }, phase)} />
      </Section>}

      {isVideo && (
        <Section title="Video">
          <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
            <input type="checkbox" checked={layer.loop !== false} onChange={(e) => onChange({ loop: e.target.checked ? undefined : false })} className="accent-pink-500" />
            Loop (start again at the end)
          </label>
          <Slider label="Speed" min={0.25} max={2} step={0.05} value={layer.speed ?? 1} format={(v) => v === 1 ? 'normal' : `${v.toFixed(2)}×`} onChange={(v, phase) => onChange({ speed: Math.round(v * 100) / 100 }, phase)} />
          <label className="flex items-center gap-2 text-[11px] text-neutral-400">
            <span className="w-[72px] shrink-0">Start at</span>
            <input type="number" min={0} step={0.5} value={layer.startAt ?? 0} onChange={(e) => onChange({ startAt: Math.max(0, Number(e.target.value) || 0) || undefined })} className={`${selectCls} w-20`} />
            <span>seconds</span>
          </label>
        </Section>
      )}

      <Section title="Fades">
        <Slider label="Fade in" min={0} max={5} step={0.1} value={layer.fadeIn ?? 1} format={(v) => `${v.toFixed(1)}s`} onChange={(v, phase) => onChange({ fadeIn: v }, phase)} />
        <Slider label="Fade out" min={0} max={5} step={0.1} value={layer.fadeOut ?? 1} format={(v) => `${v.toFixed(1)}s`} onChange={(v, phase) => onChange({ fadeOut: v }, phase)} />
      </Section>

      <Section title="Screens">
        {screens.map(s => (
          <label key={s.id} className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer" data-mix-screen={s.name}>
            <input type="checkbox" checked={playsOn.includes(s.id)} onChange={() => toggleScreen(s.id)} className="accent-pink-500" />
            {s.name}{s.id === mainScreenId && <span className="text-neutral-500">(main)</span>}
          </label>
        ))}
      </Section>

      <div className="px-3 py-3 flex flex-wrap gap-1.5">
        <button type="button" disabled={isTop} onClick={() => onMove(1)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title="In front of the layer above it"><ArrowUp size={11} /> Forward</button>
        <button type="button" disabled={isBottom} onClick={() => onMove(-1)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title="Behind the layer below it"><ArrowDown size={11} /> Backward</button>
        <button type="button" onClick={onDuplicate} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`}><Copy size={11} /> Duplicate</button>
        <button type="button" onClick={onDelete} className={`${smallBtn} bg-white/5 text-red-300 hover:bg-red-500/20 flex items-center gap-1`} data-mix-delete-layer><Trash2 size={11} /> Delete</button>
      </div>
    </div>
  );
}
