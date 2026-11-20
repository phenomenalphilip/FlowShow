import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft, AlignCenter, AlignRight, Minus, Plus, RotateCcw, Eye, EyeOff, Info, Check, Play, Radio, Scissors, Trash2, Send, X, BookmarkPlus, ChevronLeft, Tag,
} from 'lucide-react';
import { GROUP_PRESETS, groupColors } from '../lib/slideGroups';
import { tokenize } from '../lib/TokenEngine';
import type { CustomTextBox, OutputSettings, SlideDefinition, SlideDesign, TemplateSource } from '../App';
import type { TextPosition } from '../lib/templates';
import {
  PresentationTemplate, AnimationConfig, AnimationType, getScrollPositions, SCROLL_POS_MIN, SCROLL_POS_MAX, FALLBACK_ANIMATION, saveTemplate,
} from '../lib/templates';
import { FONT_OPTIONS, MOTION_PRESETS, LAYOUT_PRESETS, SHADOW_PRESETS, ScrollMarker, MOTION_DEFAULTS, GENERIC_MOTION_DEFAULTS } from './TemplateEditor';
import { FixedStage } from './FixedStage';
import { DesignBox, InlineTextEditor, Rect, getPlacement, placeAcross, placeDown, resizeBox } from './DesignCanvas';
import {
  Phase, WEIGHTS, selectCls, segBtn, smallBtn, GroupLabel, Divider, SizeStepper, NumField, ColorField, MiniSlider,
  DesignFor, DesignForSwitch, DesignStatus, StatusBadges, Notice, MotionOptions, MotionLayers, ExitSelect, FontSelect, TextPositionSwitch,
} from './DesignControls';

export interface OutputTemplateInfo {
  templateId?: string;
  source: TemplateSource;
  styleName?: string;
}

/** How the slide looks on this screen right now: its template with this slide's own design on top */
export interface DesignLook {
  global: React.CSSProperties;
  layout: Rect;
  animation?: AnimationConfig;
  /** Styles of single words, by word number across the slide */
  words?: { [wordIndex: number]: React.CSSProperties };
  lines?: { [lineIndex: number]: React.CSSProperties };
  verticalAlign?: TextPosition;
}

interface LiveDesignWorkspaceProps {
  outputs: OutputSettings[];
  selectedOutputId: string;
  onSelectOutput: (id: string) => void;
  /** Switch Design mode to designing how scripture looks */
  onDesignFor?: (v: DesignFor) => void;
  templates: PresentationTemplate[];
  templateInfo: OutputTemplateInfo;
  onAssignTemplate: (templateId: string) => void;
  look: DesignLook;
  /** This slide's own design on this screen; undefined = it shows the template look */
  design?: SlideDesign;
  onChangeDesign: (fn: (d: SlideDesign) => SlideDesign) => void;
  onCopyDesign: (toSlideIds: string[]) => void;
  onResetDesign: (slideIds: string[]) => void;
  /** Show this slide's text boxes (and hidden lyrics) on every other screen; returns how many screens */
  onSendTextBoxesToAllScreens: () => number;
  canSplit: boolean;
  onSplitSlide: () => void;
  /** Add a new slide at this position in the song (0 = first); returns its id */
  onInsertSlide?: (index: number) => string;
  onDeleteSlide?: (slideId: string) => void;
  /** Move slides (kept in their order) to just before position `beforeIndex` of the song */
  onMoveSlides?: (slideIds: string[], beforeIndex: number) => void;
  onSetSlideGroup?: (slideIds: string[], group: string | undefined) => void;
  /** Give every slide of the group the given slide's look (its template and designs on every screen) */
  onUseLookForGroup?: (group: string, fromSlideId: string) => void;
  /** This output's style turns slide text off */
  textHidden: boolean;
  status: DesignStatus;
  /** The slide on the canvas is the one this screen is showing */
  slideIsOnAir: boolean;
  /** Nothing is picked in the strip, so the canvas follows the slide on air */
  followingLive: boolean;
  /** Draws the output as the projector does. draftDesign = an unfinished edit, shown on the canvas only */
  renderOutput: (scrollPreviewPos?: number, draftDesign?: SlideDesign, highlightWordIndex?: number) => React.ReactNode;
  slideText: string | null;
  onEditSlideText: (text: string) => void;
  songTitle?: string;
  slides: SlideDefinition[];
  liveSlideId?: string;
  canvasSlideId?: string;
  /** The slide on the canvas, also when it isn't one of `slides` (e.g. a Bible verse on air) */
  canvasSlide?: SlideDefinition | null;
  onPickSlide: (slide: SlideDefinition) => void;
  onGoLive: (slide: SlideDefinition) => void;
  onFollowLive: () => void;
}

/** The lyrics box, or a custom text box id */
type Target = 'lyrics' | string;

const NEW_BOX_LAYOUT: Rect = { x: 0.15, y: 0.4, width: 0.7, height: 0.2 };
const NEW_BOX_STYLE: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif', fontSize: '80px', fontWeight: '700', color: '#ffffff', textAlign: 'center', textTransform: 'none',
};

const parseNum = (v: unknown, fallback: number) => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const toPct = (v: number) => Math.round(v * 1000) / 10;
/** 0 → 'Left', 50 → 'Centre', 100 → 'Right', otherwise the % */
const placementLabel = (v: number, start: string, end: string) => v <= 0 ? start : v >= 100 ? end : v === 50 ? 'Centre' : `${v}%`;
const boxName = (b: CustomTextBox, i: number) => {
  const first = b.text.split('\n')[0].trim();
  return first ? (first.length > 16 ? `${first.slice(0, 15)}…` : first) : `Text ${i + 1}`;
};

const sourceLabel = (info: OutputTemplateInfo) => {
  switch (info.source) {
    case 'style': return `set by style "${info.styleName || 'Style'}"`;
    case 'slide-output': return 'set on this slide';
    case 'slide':
    case 'song-output':
    case 'song': return 'set on this song';
    case 'output-default': return "this screen's default";
    case 'screen-scripture': return "this screen's scripture template";
    case 'screen-declaration': return "this screen's Declarations template";
    default: return 'plain text';
  }
};


export function LiveDesignWorkspace({
  outputs, selectedOutputId, onSelectOutput, onDesignFor, templates, templateInfo, onAssignTemplate,
  look, design, onChangeDesign, onCopyDesign, onResetDesign, onSendTextBoxesToAllScreens, canSplit, onSplitSlide, onInsertSlide, onDeleteSlide, onMoveSlides,
  onSetSlideGroup, onUseLookForGroup,
  textHidden, status, slideIsOnAir, followingLive,
  renderOutput, slideText, onEditSlideText, songTitle, slides, liveSlideId, canvasSlideId, canvasSlide: canvasSlideProp,
  onPickSlide, onGoLive, onFollowLive,
}: LiveDesignWorkspaceProps) {
  const [showGuides, setShowGuides] = useState(true);
  const [replayKey, setReplayKey] = useState(0);
  const [parkedFader, setParkedFader] = useState<'start' | 'end' | null>(null);
  // Slides picked as targets for "copy this slide's design" (Shift+drag, Shift+click or Ctrl+click in the strip)
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const anchorRef = useRef<number | null>(null);
  const sweepRef = useRef<{ start: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Target>('lyrics');
  const [editing, setEditing] = useState<Target | null>(null);
  // A single lyrics word being styled (word number across the slide)
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  // An unfinished edit (mid-drag, or a new text box still being typed): canvas only, never sent to the screens
  const [draft, setDraft] = useState<SlideDesign | null>(null);
  // A slide just added: open its words for typing once it is on the canvas
  const [typeIntoSlideId, setTypeIntoSlideId] = useState<string | null>(null);
  // Right-click menu on a strip slide
  const [slideMenu, setSlideMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [menuView, setMenuView] = useState<'main' | 'groups'>('main');
  // A slide (or the selected slides) being dragged to a new place in the strip
  const [reorder, setReorder] = useState<{ ids: string[]; before: number } | null>(null);
  const suppressClickRef = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slideMenu) return;
    const close = () => setSlideMenu(null);
    // Caught before the app's own shortcuts, so Escape closes the menu instead of clearing the screens
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('[data-slide-menu]'))) close();
    };
    const strip = stripRef.current;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', close);
    strip?.addEventListener('scroll', close);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', close);
      strip?.removeEventListener('scroll', close);
    };
  }, [slideMenu]);

  useEffect(() => { setEditing(null); setDraft(null); setSelected('lyrics'); setSelectedWord(null); }, [canvasSlideId, selectedOutputId]);
  // Runs after the reset above, so a newly added slide opens straight into typing
  useEffect(() => {
    if (typeIntoSlideId && canvasSlideId === typeIntoSlideId) {
      setEditing('lyrics');
      setTypeIntoSlideId(null);
    }
  }, [canvasSlideId, typeIntoSlideId]);
  useEffect(() => { setChosen(new Set()); anchorRef.current = null; }, [slides[0]?.id, selectedOutputId]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  // Keep the slide being designed visible in the strip
  useEffect(() => {
    if (!canvasSlideId || !stripRef.current) return;
    stripRef.current
      .querySelector(`[data-slide-id="${CSS.escape(canvasSlideId)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [canvasSlideId]);

  const outputName = outputs.find(o => o.id === selectedOutputId)?.name || 'this screen';
  const canvasIndex = slides.findIndex(s => s.id === canvasSlideId);
  const canvasSlide = canvasIndex >= 0 ? slides[canvasIndex] : canvasSlideProp ?? undefined;
  // New text boxes (on any screen) that go out when this slide goes live
  const waitingCount = Object.values(canvasSlide?.designs || {}).flatMap(d => d.customBoxes || []).filter(b => b.waiting).length;
  const canDesign = slideText !== null && !textHidden;
  const toolbarEnabled = canDesign && editing === null;

  const current: SlideDesign = draft ?? design ?? {};
  const boxes = current.customBoxes || [];
  const lyricsHidden = !!current.hideLyrics;
  const selectedBox = selected === 'lyrics' ? undefined : boxes.find(b => b.id === selected);
  const target: Target = selectedBox ? selectedBox.id : 'lyrics';
  // Edits to a hidden or waiting box don't reach the screen
  const targetOffScreen = !!selectedBox && (!!selectedBox.hidden || !!selectedBox.waiting);
  const isSavedBox = (id: string) => (design?.customBoxes || []).some(b => b.id === id);

  // The lyrics look, including an unfinished edit
  const lyricsLook: DesignLook = draft ? {
    global: { ...look.global, ...(draft.global || {}) },
    layout: draft.layout || look.layout,
    animation: draft.animation ? { ...(look.animation || FALLBACK_ANIMATION), ...draft.animation } as AnimationConfig : look.animation,
  } : look;
  // What the toolbar shows: the lyrics, or the selected text box
  const elementLook: DesignLook = selectedBox ? {
    global: selectedBox.style || {},
    layout: selectedBox.layout,
    animation: selectedBox.animation ? { ...FALLBACK_ANIMATION, ...selectedBox.animation } as AnimationConfig : undefined,
  } : lyricsLook;

  // The slide's words, numbered across the slide the same way the screens number them
  const slideWords = useMemo(() => {
    const words: string[] = [];
    let offset = 0;
    (slideText || '').split('\n').forEach(line => {
      const tokens = tokenize(line, [], undefined, offset);
      tokens.forEach(t => { if ((t.wordIndex ?? -1) >= 0) words[t.wordIndex as number] = t.value; });
      offset += tokens.filter(t => (t.wordIndex ?? -1) >= 0).length;
    });
    return words;
  }, [slideText]);
  const wordActive = target === 'lyrics' && !lyricsHidden && selectedWord !== null && selectedWord < slideWords.length;
  const wordStyle: React.CSSProperties = wordActive
    ? { ...(look.words?.[selectedWord!] || {}), ...(draft?.words?.[selectedWord!] || {}) }
    : {};
  const wordHasOwnStyle = wordActive && Object.keys(design?.words?.[selectedWord!] || {}).length > 0;

  // Clicking (not dragging) inside the lyrics box picks the word under the pointer, or no word
  const pickWordAt = (x: number, y: number) => {
    const hit = document.elementsFromPoint(x, y).find((el): el is HTMLElement =>
      el instanceof HTMLElement && el.dataset.wordIndex !== undefined
      && !!el.closest('[data-text-layer="lyrics"]') && !!el.closest('[data-design-canvas]'));
    setSelectedWord(hit ? Number(hit.dataset.wordIndex) : null);
  };

  // Every edit goes into this slide's own design for this screen; the template is never changed
  const mutate = (fn: (d: SlideDesign) => SlideDesign, phase: Phase) => {
    if (phase === 'draft') {
      setDraft(prev => fn(prev ?? design ?? {}));
      return;
    }
    setDraft(null);
    onChangeDesign(fn);
  };
  const editTarget = (t: Target, phase: Phase, onLyrics: (d: SlideDesign) => SlideDesign, onBox: (b: CustomTextBox) => CustomTextBox) =>
    mutate(d => t === 'lyrics' ? onLyrics(d) : { ...d, customBoxes: (d.customBoxes || []).map(b => b.id === t ? onBox(b) : b) }, phase);

  // Text styling goes to the picked word when there is one, otherwise to the whole box
  const setGlobal = (patch: React.CSSProperties, phase: Phase = 'commit') => {
    if (wordActive) {
      const w = selectedWord!;
      mutate(d => ({ ...d, words: { ...(d.words || {}), [w]: { ...(d.words?.[w] || {}), ...patch } } }), phase);
      return;
    }
    editTarget(target, phase, d => ({ ...d, global: { ...(d.global || {}), ...patch } }), b => ({ ...b, style: { ...(b.style || {}), ...patch } }));
  };
  const clearWordStyle = () => {
    if (selectedWord === null) return;
    const w = selectedWord;
    mutate(d => {
      const { [w]: _removed, ...rest } = d.words || {};
      return { ...d, words: Object.keys(rest).length ? rest : undefined };
    }, 'commit');
  };
  const setLayoutOf = (t: Target, patch: Partial<Rect>, phase: Phase = 'commit') =>
    editTarget(t, phase, d => ({ ...d, layout: { ...look.layout, ...(d.layout || {}), ...patch } }), b => ({ ...b, layout: { ...b.layout, ...patch } }));
  const setLayout = (patch: Partial<Rect>, phase: Phase = 'commit') => setLayoutOf(target, patch, phase);
  const setAnim = (patch: Partial<AnimationConfig>, phase: Phase = 'commit') =>
    editTarget(target, phase, d => ({ ...d, animation: { ...(d.animation || {}), ...patch } }), b => ({ ...b, animation: { ...(b.animation || {}), ...patch } }));
  const setMotionType = (type: AnimationType) => setAnim({ type, ...(MOTION_DEFAULTS[type] || GENERIC_MOTION_DEFAULTS) });

  // A new text box stays off the screens until its slide goes live (Go live)
  const addTextBox = () => {
    const box: CustomTextBox = { id: `box-${Date.now().toString(36)}`, text: '', layout: NEW_BOX_LAYOUT, style: NEW_BOX_STYLE, waiting: true };
    mutate(d => ({ ...d, customBoxes: [...(d.customBoxes || []), box] }), 'draft');
    setSelected(box.id);
    setEditing(box.id);
  };
  const saveText = (t: Target, text: string) => {
    setEditing(null);
    if (t === 'lyrics') { setSelectedWord(null); onEditSlideText(text); return; }
    if (!text.trim()) { cancelText(t); return; }
    if (isSavedBox(t)) {
      mutate(d => ({ ...d, customBoxes: (d.customBoxes || []).map(b => b.id === t ? { ...b, text } : b) }), 'commit');
      return;
    }
    const box = draft?.customBoxes?.find(b => b.id === t);
    if (!box) return;
    mutate(d => ({ ...d, customBoxes: [...(d.customBoxes || []), { ...box, text }] }), 'commit');
    setNotice('Text box added');
  };
  const cancelText = (t: Target) => {
    setEditing(null);
    if (t !== 'lyrics' && !isSavedBox(t)) { setDraft(null); setSelected('lyrics'); }
  };
  const deleteBox = (id: string) => {
    mutate(d => ({ ...d, customBoxes: (d.customBoxes || []).filter(b => b.id !== id) }), 'commit');
    setSelected('lyrics');
  };
  // Hiding takes the box off the screen at once but keeps it here, so it can be shown again
  const toggleBoxHidden = (id: string) => editTarget(id, 'commit', d => d, b => ({ ...b, hidden: b.hidden ? undefined : true }));
  const toggleLyrics = () => mutate(d => ({ ...d, hideLyrics: lyricsHidden ? undefined : true }), 'commit');
  const sendBoxes = () => {
    const n = onSendTextBoxesToAllScreens();
    const waiting = (design?.customBoxes || []).some(b => b.waiting);
    setNotice(!n ? 'No other screens are switched on'
      : `${waiting ? 'Copied' : 'Sent'} to ${n} other screen${n === 1 ? '' : 's'}${waiting ? ' · new boxes wait for Go live' : ''}`);
  };
  const splitSlide = () => { onSplitSlide(); setNotice('Slide split in two'); };
  const resetSlide = () => {
    if (!canvasSlideId) return;
    const n = design?.customBoxes?.length || 0;
    if (n && !window.confirm(`Put this slide back to the template look on ${outputName}? Its ${n} text box${n === 1 ? '' : 'es'} will be removed.`)) return;
    setDraft(null);
    onResetDesign([canvasSlideId]);
  };

  const g = wordActive ? { ...elementLook.global, ...wordStyle } : elementLook.global;
  const box = elementLook.layout;
  const anim = elementLook.animation;
  const isScroll = anim?.type === 'vertical-scroll';
  const isWordStack = anim?.type === 'word-stack';
  const scrollPos = getScrollPositions(anim);
  const lyricsScroll = lyricsLook.animation?.type === 'vertical-scroll';
  const lyricsScrollPos = getScrollPositions(lyricsLook.animation);
  const placement = getPlacement(box);
  const parkedPos = lyricsScroll && target === 'lyrics' && parkedFader ? lyricsScrollPos[parkedFader] : undefined;
  const colorValue = /^#[0-9a-f]{6}$/i.test(String(g.color || '')) ? String(g.color) : '#ffffff';
  const shadowValue = String(g.textShadow || 'none');
  const canSendBoxes = (design?.customBoxes?.length ?? 0) > 0 || !!design?.hideLyrics;

  const otherSlideIds = slides.filter(s => s.id !== canvasSlideId).map(s => s.id);
  const chosenTargets = otherSlideIds.filter(id => chosen.has(id));
  const rangeIds = (a: number, b: number) => slides.slice(Math.min(a, b), Math.max(a, b) + 1).map(s => s.id);

  // Where a dragged slide would land: before the first card whose middle is right of the pointer
  const dropIndexAt = (clientX: number) => {
    const cardEls: HTMLElement[] = stripRef.current ? Array.from(stripRef.current.querySelectorAll<HTMLElement>('[data-slide-id]')) : [];
    const i = cardEls.findIndex(el => { const r = el.getBoundingClientRect(); return clientX < r.left + r.width / 2; });
    return i === -1 ? cardEls.length : i;
  };
  // The order the strip would have if `ids` moved to just before position `before`
  const orderAfterMove = (ids: string[], before: number) => {
    const moving = new Set(ids);
    const rest = slides.filter(s => !moving.has(s.id));
    const at = slides.slice(0, before).filter(s => !moving.has(s.id)).length;
    rest.splice(at, 0, ...slides.filter(s => moving.has(s.id)));
    return rest;
  };
  const moveChangesOrder = (ids: string[], before: number) =>
    orderAfterMove(ids, before).some((s, i) => s.id !== slides[i].id);

  // Scroll the strip while a dragged slide is held near its left or right edge
  const startEdgeScroll = (getX: () => number, onScrolled: () => void) => {
    const id = window.setInterval(() => {
      const strip = stripRef.current;
      if (!strip) return;
      const r = strip.getBoundingClientRect();
      const x = getX();
      const step = x < r.left + 48 ? -14 : x > r.right - 48 ? 14 : 0;
      if (step) { strip.scrollLeft += step; onScrolled(); }
    }, 16);
    return () => window.clearInterval(id);
  };

  // Plain press on a slide: a click opens it for designing; dragging it (or the selected slides it
  // belongs to) moves it to a new place in the song
  const beginReorder = (index: number, e: React.PointerEvent) => {
    if (!onMoveSlides) return;
    const pressed = slides[index].id;
    const ids = chosen.has(pressed) && chosen.size > 1 ? slides.filter(s => chosen.has(s.id)).map(s => s.id) : [pressed];
    const start = { x: e.clientX, y: e.clientY };
    let lastX = e.clientX;
    let active = false;
    let before = index;
    let stopEdgeScroll: (() => void) | null = null;
    const update = () => {
      before = dropIndexAt(lastX);
      setReorder({ ids, before });
    };
    const onMove = (ev: PointerEvent) => {
      lastX = ev.clientX;
      if (!active) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
        active = true;
        stopEdgeScroll = startEdgeScroll(() => lastX, update);
      }
      update();
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      stopEdgeScroll?.();
      setReorder(null);
      if (!active) return;
      // The click that follows the release must not open a slide for designing
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      if (ev.type === 'pointerup' && moveChangesOrder(ids, before)) {
        onMoveSlides(ids, before);
        anchorRef.current = null;
        setNotice(ids.length > 1 ? `${ids.length} slides moved` : 'Slide moved');
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Strip selection: Shift+click picks a range from the last pick, Shift+drag sweeps across slides,
  // Ctrl/Cmd+click adds or removes one slide. A plain click opens the slide for designing.
  const onCardPointerDown = (index: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      beginReorder(index, e);
      return;
    }
    if (e.shiftKey) {
      e.preventDefault();
      const anchor = anchorRef.current ?? (canvasIndex >= 0 ? canvasIndex : index);
      setChosen(new Set(rangeIds(anchor, index)));
      sweepRef.current = { start: index };
      window.addEventListener('pointerup', () => { sweepRef.current = null; }, { once: true });
    } else if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const id = slides[index].id;
      setChosen(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      anchorRef.current = index;
    }
  };
  const onCardPointerEnter = (index: number) => {
    if (sweepRef.current) setChosen(new Set(rangeIds(sweepRef.current.start, index)));
  };

  const insertAt = (index: number) => {
    if (!onInsertSlide) return;
    setTypeIntoSlideId(onInsertSlide(index));
    setNotice('Slide added. Type its words, then press Ctrl+Enter');
  };
  const deleteSlide = (slideId: string) => {
    if (!onDeleteSlide) return;
    onDeleteSlide(slideId);
    setChosen(prev => { const next = new Set(prev); next.delete(slideId); return next; });
    setNotice('Slide deleted. Ctrl+Z brings it back');
  };

  // ─── Groups (Verse 1, Chorus, Bridge…) ───
  // Right-click acts on all selected slides when the slide clicked is one of them
  const menuTargets = (index: number) => {
    const id = slides[index].id;
    return chosen.has(id) && chosen.size > 1 ? slides.filter(s => chosen.has(s.id)).map(s => s.id) : [id];
  };
  const setGroupFor = (ids: string[], group: string | undefined) => {
    onSetSlideGroup?.(ids, group);
    const what = ids.length > 1 ? `${ids.length} slides` : 'Slide';
    setNotice(group ? `${what} grouped as ${group}` : `${what}: group removed`);
  };
  const askCustomGroup = (ids: string[]) => {
    const name = window.prompt('Group name (for example Verse 5, Chorus 2, Vamp)')?.trim();
    if (name) setGroupFor(ids, name);
  };
  const applyLookToGroup = (group: string, fromSlideId: string) => {
    onUseLookForGroup?.(group, fromSlideId);
    const n = slides.filter(s => s.group === group).length;
    setNotice(`All ${n} ${group} slide${n === 1 ? '' : 's'} now look like this one`);
  };
  // Save the lyrics look of this slide (on this screen) as a template that any slide or song can use
  const saveLookAsTemplate = async () => {
    const suggested = `${songTitle || 'Song'} – ${canvasSlide?.group || `Slide ${canvasIndex + 1}`}`;
    const name = window.prompt('Name for the new template', suggested)?.trim();
    if (!name) return;
    const template: PresentationTemplate = {
      id: `custom-${Date.now()}`,
      name,
      category: 'custom',
      tagline: 'Saved from Design mode',
      description: `Saved from a slide of "${songTitle || 'a song'}" on ${outputName}.`,
      badge: 'Custom',
      isCustom: true,
      styles: { global: { ...lyricsLook.global }, lines: look.lines, layout: { ...lyricsLook.layout } },
      animation: { ...(lyricsLook.animation || FALLBACK_ANIMATION) },
      backgroundPreview: '#09090b',
    };
    await saveTemplate(template);
    setNotice(`Saved as template "${name}"`);
  };

  const copyToAll = () => {
    if (!window.confirm(`Copy this slide's design (including its text boxes) to all ${otherSlideIds.length} other slides on ${outputName}? Any design they have on this screen will be replaced.`)) return;
    onCopyDesign(otherSlideIds);
    setNotice(`Design copied to ${otherSlideIds.length} slide${otherSlideIds.length === 1 ? '' : 's'}`);
  };
  const copyToChosen = () => {
    onCopyDesign(chosenTargets);
    setNotice(`Design copied to ${chosenTargets.length} slide${chosenTargets.length === 1 ? '' : 's'}`);
    setChosen(new Set());
  };
  const resetChosen = () => {
    onResetDesign(chosenTargets);
    setNotice(`${chosenTargets.length} slide${chosenTargets.length === 1 ? '' : 's'} back to the template look`);
    setChosen(new Set());
  };

  const editingBox = editing && editing !== 'lyrics' ? boxes.find(b => b.id === editing) : undefined;

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#07070a] select-none">
      {/* HEADER: which screen, which template underneath, screen status */}
      <div className="h-11 px-3 border-b border-[#262635] flex items-center gap-3 shrink-0 bg-[#101015]">
        <div className="flex gap-1 p-0.5 bg-black/40 rounded-lg shrink-0">
          {outputs.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelectOutput(o.id)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                o.id === selectedOutputId ? 'bg-pink-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
        {onDesignFor && <DesignForSwitch value="lyrics" onChange={onDesignFor} />}

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Template</span>
          <select
            value={templateInfo.templateId || ''}
            onChange={(e) => e.target.value && onAssignTemplate(e.target.value)}
            className={`${selectCls} max-w-[200px]`}
            title="The starting look. Slide designs sit on top of it and never change it."
          >
            {!templateInfo.templateId && <option value="">None (plain text)</option>}
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <span className="text-[11px] text-neutral-500 truncate">{sourceLabel(templateInfo)}</span>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <StatusBadges status={status} />
          <button
            type="button"
            onClick={() => setShowGuides(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${showGuides ? 'text-white bg-white/10' : 'text-neutral-500 hover:text-white'}`}
            title="Show or hide the text box outlines and scroll markers"
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

      {/* TOOLBAR: edits the selected box in this slide's own design for this screen */}
      <fieldset disabled={!toolbarEnabled} className={`min-w-0 border-0 p-0 m-0 shrink-0 ${toolbarEnabled ? '' : 'opacity-40'}`}>
        <div className="px-3 py-2 space-y-2 border-b border-[#262635] bg-[#0d0d12]">
          {/* Row 0: which text box is being edited */}
          <div className="flex flex-wrap items-center gap-2">
            <GroupLabel fixed>Boxes</GroupLabel>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => { setSelected('lyrics'); setSelectedWord(null); }}
                className={`${smallBtn} ${target === 'lyrics' && !wordActive ? 'bg-pink-600 text-white' : 'bg-[#1e1e28] text-neutral-300 hover:text-white'} ${lyricsHidden ? 'line-through decoration-2' : ''}`}
                title={lyricsHidden ? 'The lyrics are hidden on this screen' : 'The song lyrics (click a word on the canvas to style just that word)'}
              >
                Lyrics{lyricsHidden ? ' (hidden)' : ''}
              </button>
              {wordActive && (
                <span className="flex items-center rounded bg-pink-600 text-white text-[11px] font-semibold" title="Text changes now apply to this word only">
                  <span className="pl-2 pr-1 py-1">Word: “{slideWords[selectedWord!]}”</span>
                  <button type="button" onClick={() => setSelectedWord(null)} className="px-1 py-1 hover:bg-white/20 rounded-r" title="Back to styling the whole lyrics box">
                    <X size={11} />
                  </button>
                </span>
              )}
              {boxes.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => { setSelected(b.id); setSelectedWord(null); }}
                  className={`${smallBtn} flex items-center gap-1 ${target === b.id ? 'bg-pink-600 text-white' : 'bg-[#1e1e28] text-neutral-300 hover:text-white'} ${b.hidden ? 'line-through decoration-2' : ''}`}
                  title={b.hidden ? `Hidden on ${outputName}` : b.waiting ? 'Not on the screen yet: it goes out when you click Go live' : undefined}
                >
                  {b.waiting && !b.hidden && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                  {boxName(b, i)}{b.hidden ? ' (hidden)' : ''}
                </button>
              ))}
            </div>
            <button type="button" onClick={addTextBox} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title="Add your own text to this slide on this screen">
              <Plus size={11} /> Add text box
            </button>
            <Divider />
            {wordActive && (
              <button type="button" disabled={!wordHasOwnStyle} onClick={clearWordStyle} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title="Give this word the same look as the rest of the lyrics again">
                <RotateCcw size={11} /> Clear word style
              </button>
            )}
            {target === 'lyrics' ? (
              <button type="button" onClick={toggleLyrics} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} title={`Show or hide the lyrics on ${outputName} for this slide`}>
                {lyricsHidden ? <><Eye size={11} /> Show lyrics</> : <><EyeOff size={11} /> Hide lyrics</>}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => toggleBoxHidden(target)}
                  className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`}
                  title={selectedBox?.hidden
                    ? (selectedBox.waiting ? 'Un-hide it (it goes on the screen when you click Go live)' : `Show it on ${outputName} again`)
                    : `Take it off ${outputName} but keep it here, to show again later`}
                >
                  {selectedBox?.hidden ? <><Eye size={11} /> Show text box</> : <><EyeOff size={11} /> Hide text box</>}
                </button>
                <button type="button" onClick={() => deleteBox(target)} className={`${smallBtn} bg-white/5 text-red-300 hover:bg-red-500/20 flex items-center gap-1`}>
                  <Trash2 size={11} /> Delete text box
                </button>
              </>
            )}
            <button
              type="button"
              disabled={!canSendBoxes}
              onClick={sendBoxes}
              className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`}
              title={canSendBoxes ? 'Show these text boxes (and the hidden lyrics) for this slide on every screen' : 'Add a text box or hide the lyrics first'}
            >
              <Send size={11} /> Send text boxes to all screens
            </button>
          </div>

          {/* Row 1: text */}
          <div className="flex flex-wrap items-center gap-2">
            <GroupLabel fixed>{wordActive ? 'Word' : 'Text'}</GroupLabel>
            <FontSelect value={String(g.fontFamily || '')} onChange={(v) => setGlobal({ fontFamily: v })} />
            <SizeStepper value={parseNum(g.fontSize, 110)} onChange={(v) => setGlobal({ fontSize: `${v}px` })} />
            <select value={String(g.fontWeight || '700')} onChange={(e) => setGlobal({ fontWeight: e.target.value })} className={selectCls} title="Weight">
              {WEIGHTS.map(w => <option key={w} value={w}>Weight {w}</option>)}
            </select>
            <ColorField value={colorValue} onChange={(v, phase) => setGlobal({ color: v }, phase)} />
            <button type="button" onClick={() => setGlobal({ textTransform: g.textTransform === 'uppercase' ? 'none' : 'uppercase' })} className={`${segBtn(g.textTransform === 'uppercase')} rounded`} title="Uppercase">AA</button>
            <div className={`flex rounded overflow-hidden ${wordActive ? 'opacity-30' : ''}`} title={wordActive ? 'Alignment applies to the whole box' : 'How lines line up with each other'}>
              {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                <button key={a} type="button" disabled={wordActive} onClick={() => setGlobal({ textAlign: a })} className={segBtn((g.textAlign || 'center') === a)}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
            <select value={SHADOW_PRESETS.some(s => s.value === shadowValue) ? shadowValue : '__custom'} onChange={(e) => setGlobal({ textShadow: e.target.value })} className={`${selectCls} max-w-[170px]`} title="Shadow">
              {!SHADOW_PRESETS.some(s => s.value === shadowValue) && <option value="__custom" disabled>Shadow: custom</option>}
              {SHADOW_PRESETS.map(s => <option key={s.label} value={s.value}>Shadow: {s.label}</option>)}
            </select>
            <MiniSlider label="Letters" min={-0.05} max={0.4} step={0.01} value={parseNum(g.letterSpacing, 0)} format={(v) => `${v.toFixed(2)}em`} onChange={(v, phase) => setGlobal({ letterSpacing: `${v}em` }, phase)} />
          </div>

          {/* Row 2: line spacing + where the box sits (or drag it on the canvas) */}
          <div className="flex flex-wrap items-center gap-2">
            <GroupLabel fixed>Layout</GroupLabel>
            <MiniSlider label="Lines" min={0.8} max={2} step={0.05} value={parseNum(g.lineHeight, 1.15)} format={(v) => v.toFixed(2)} onChange={(v, phase) => setGlobal({ lineHeight: String(v) }, phase)} />
            <Divider />
            <MiniSlider label="Across" min={0} max={100} step={1} value={placement.across} format={(v) => placementLabel(v, 'Left', 'Right')} onChange={(v, phase) => setLayout(placeAcross(box, v), phase)} />
            <MiniSlider label="Down" min={0} max={100} step={1} value={placement.down} format={(v) => placementLabel(v, 'Top', 'Bottom')} onChange={(v, phase) => setLayout(placeDown(box, v), phase)} />
            <NumField label="W" value={toPct(box.width)} onChange={(v) => setLayout(resizeBox(box, { width: v / 100 }))} />
            <NumField label="H" value={toPct(box.height)} onChange={(v) => setLayout(resizeBox(box, { height: v / 100 }))} />
            <select value="" onChange={(e) => { const p = LAYOUT_PRESETS[Number(e.target.value)]; if (p) setLayout(p.layout); }} className={selectCls} title="Jump to a position preset">
              <option value="" disabled>Presets…</option>
              {LAYOUT_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
            </select>
            <Divider />
            <TextPositionSwitch
              value={selectedBox ? selectedBox.verticalAlign : (draft?.verticalAlign ?? design?.verticalAlign ?? look.verticalAlign)}
              onChange={(v) => editTarget(target, 'commit', d => ({ ...d, verticalAlign: v }), b => ({ ...b, verticalAlign: v }))}
            />
          </div>

          {/* Row 3: motion */}
          <div className="flex flex-wrap items-center gap-2">
            <GroupLabel fixed>Motion</GroupLabel>
            <select value={anim?.type || ''} onChange={(e) => setMotionType(e.target.value as AnimationType)} className={selectCls} title="Animation">
              {!anim && <option value="">Simple fade</option>}
              {MOTION_PRESETS.map(m => <option key={m.type} value={m.type}>{m.label}</option>)}
            </select>
            {isScroll ? (
              <>
                <MiniSlider label="Duration" min={3} max={60} step={1} value={anim?.duration || 14} format={(v) => `${v}s`} onChange={(v, phase) => setAnim({ duration: v }, phase)} />
                <MiniSlider label="Start" min={SCROLL_POS_MIN} max={SCROLL_POS_MAX} step={1} value={scrollPos.start} format={(v) => `${v}%`} onChange={(v, phase) => setAnim({ scrollStartPos: v }, phase)} onActiveChange={(on) => setParkedFader(on ? 'start' : null)} />
                <MiniSlider label="Stop" min={SCROLL_POS_MIN} max={SCROLL_POS_MAX} step={1} value={scrollPos.end} format={(v) => `${v}%`} onChange={(v, phase) => setAnim({ scrollEndPos: v }, phase)} onActiveChange={(on) => setParkedFader(on ? 'end' : null)} />
                <div className="flex rounded overflow-hidden">
                  <button type="button" onClick={() => setAnim({ scrollLoop: true })} className={segBtn(anim?.scrollLoop !== false)}>Loop</button>
                  <button type="button" onClick={() => setAnim({ scrollLoop: false })} className={segBtn(anim?.scrollLoop === false)}>Once</button>
                </div>
              </>
            ) : isWordStack ? (
              <>
                <MiniSlider label="Between words" min={0.05} max={2} step={0.05} value={anim?.stagger ?? 0.35} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => setAnim({ stagger: v }, phase)} />
                <MiniSlider label="Pop" min={0.1} max={1} step={0.05} value={anim?.duration ?? 0.35} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => setAnim({ duration: v }, phase)} />
              </>
            ) : anim?.type === 'flicker' || anim?.type === 'bounce' ? (
              <>
                <MiniSlider label="Between words" min={0} max={1} step={0.01} value={anim.stagger ?? (anim.type === 'bounce' ? 0.12 : 0.08)} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => setAnim({ stagger: v }, phase)} />
                <MiniSlider label="Duration" min={0.2} max={10} step={0.05} value={anim.duration || (anim.type === 'bounce' ? 0.8 : 0.9)} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => setAnim({ duration: v }, phase)} />
                <button
                  type="button"
                  onClick={() => setAnim({ effectLoop: !anim.effectLoop })}
                  className={`${segBtn(!!anim.effectLoop)} rounded`}
                  title={anim.type === 'bounce' ? 'Keep the words gently bouncing after they land' : 'Keep the words flickering now and then after they appear'}
                >
                  {anim.type === 'bounce' ? 'Keep bouncing' : 'Keep flickering'}
                </button>
              </>
            ) : anim?.type === 'scroll-in' || anim?.type === 'ticker' || anim?.type === 'karaoke' ? (
              <MotionOptions anim={anim} onChange={(patch, phase) => setAnim(patch, phase)} />
            ) : anim ? (
              <MiniSlider label="Duration" min={0.1} max={10} step={0.05} value={anim.duration || 0.6} format={(v) => `${v.toFixed(2)}s`} onChange={(v, phase) => setAnim({ duration: v }, phase)} />
            ) : null}
            <MotionLayers anim={anim} onChange={(patch, phase) => setAnim(patch, phase)} />
            {anim && anim.type !== 'ticker' && (
              <>
                <Divider />
                <ExitSelect anim={anim} onChange={(patch, phase) => setAnim(patch, phase)} />
              </>
            )}
          </div>
        </div>
      </fieldset>

      {/* SLIDE BAR: which slide is being designed and whether it has its own design */}
      <div className="h-9 px-3 border-b border-[#262635] bg-[#0b0b10] flex items-center gap-3 shrink-0 text-xs">
        <span className="font-semibold text-white whitespace-nowrap">{canvasIndex >= 0 ? `Slide ${canvasIndex + 1}` : 'Slide'}</span>
        {design ? (
          <span className="px-2 py-0.5 rounded bg-pink-500/15 text-pink-300 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Own design</span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-white/5 text-neutral-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Template look</span>
        )}
        {design && canvasSlideId && (
          <button type="button" onClick={resetSlide} className={`${smallBtn} bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 flex items-center gap-1 shrink-0`}>
            <RotateCcw size={11} /> Reset to template
          </button>
        )}
        <button
          type="button"
          disabled={!canSplit}
          onClick={splitSlide}
          className={`${smallBtn} bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 flex items-center gap-1 shrink-0`}
          title={canSplit ? 'Split this slide into two halves (both keep this design)' : 'A slide needs at least two lines to split'}
        >
          <Scissors size={11} /> Split
        </button>
        <button
          type="button"
          disabled={slideText === null}
          onClick={saveLookAsTemplate}
          className={`${smallBtn} bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 flex items-center gap-1 shrink-0`}
          title="Save this slide's look (font, colours, position and motion) as a template you can use on any slide or song"
        >
          <BookmarkPlus size={11} /> Save as template
        </button>
        {!notice && <span className="text-neutral-500 truncate hidden 2xl:inline">Edits change only this slide on {outputName}; the template is not changed.</span>}
        {/* Passing messages give way when space is short; the status and buttons after them never do */}
        <div className="ml-auto flex items-center gap-2 min-w-0">
          {notice && <span className="text-emerald-400 text-[11px] flex items-center gap-1 min-w-0"><Check size={12} className="shrink-0" /><span className="truncate">{notice}</span></span>}
          {draft && editing === null && (
            <span className="text-amber-300 text-[11px] truncate">{slideIsOnAir && !targetOffScreen ? 'Release to send to the screen…' : 'Release to apply…'}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {waitingCount > 0 && (
            <span className="flex items-center gap-1 text-amber-300 text-[11px] whitespace-nowrap" title="New text boxes stay off the screens until this slide goes live">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {waitingCount} new text box{waitingCount === 1 ? '' : 'es'} waiting
            </span>
          )}
          {slideIsOnAir ? (
            <>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${status.presenting && !status.textCleared ? 'bg-red-600 text-white' : 'bg-neutral-700/60 text-neutral-300'}`}>
                ● On this screen
              </span>
              {waitingCount > 0 && canvasSlide && !canvasSlide.disabled && (
                <button type="button" onClick={() => onGoLive(canvasSlide)} className={`${smallBtn} bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1`} title="Put the new text boxes on the screens">
                  <Play size={10} className="fill-current" /> Go live
                </button>
              )}
            </>
          ) : (
            <>
              <span className="text-blue-300 text-[11px] whitespace-nowrap">Not on screen</span>
              {canvasSlide && !canvasSlide.disabled && (
                <button type="button" onClick={() => onGoLive(canvasSlide)} className={`${smallBtn} bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1`}>
                  <Play size={10} className="fill-current" /> Go live
                </button>
              )}
            </>
          )}
          {!followingLive && (
            <button type="button" onClick={onFollowLive} className={`${smallBtn} bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 flex items-center gap-1`} title="Show the slide that is on air">
              <Radio size={11} /> Back to live slide
            </button>
          )}
        </div>
      </div>

      {textHidden && (
        <Notice>This screen's style "{templateInfo.styleName || 'Style'}" hides slide text, so there's no text to design here.</Notice>
      )}

      {/* CANVAS: what the selected screen shows for this slide (plus any unfinished edit) */}
      <div className="flex-1 min-h-0 p-3" data-design-canvas>
        <FixedStage className="w-full h-full">
          {(scale: number) => (
            <>
              <div className="absolute inset-0 bg-black" />
              <React.Fragment key={replayKey}>{renderOutput(parkedPos, draft ?? undefined, wordActive ? selectedWord! : undefined)}</React.Fragment>
              {showGuides && canDesign && target === 'lyrics' && lyricsScroll && !lyricsHidden && (
                <>
                  <ScrollMarker pos={lyricsScrollPos.start} color="#f59e0b" label="START" />
                  <ScrollMarker pos={lyricsScrollPos.end} color="#10b981" label="STOP" />
                </>
              )}
              {showGuides && canDesign && !lyricsHidden && editing !== 'lyrics' && (
                <DesignBox
                  rect={lyricsLook.layout}
                  scale={scale}
                  movable
                  selected={target === 'lyrics'}
                  label="Lyrics · click a word to style it · drag to move · double-click to edit words"
                  onSelect={() => setSelected('lyrics')}
                  onChange={(r) => setLayoutOf('lyrics', r, 'draft')}
                  onChangeEnd={(r) => setLayoutOf('lyrics', r, 'commit')}
                  onClickThrough={pickWordAt}
                  onDoubleClick={() => setEditing('lyrics')}
                />
              )}
              {showGuides && canDesign && boxes.map(b => (
                <React.Fragment key={b.id}>
                  {editing !== b.id && (
                    <DesignBox
                      rect={b.layout}
                      scale={scale}
                      movable
                      selected={target === b.id}
                      label={`${b.hidden ? 'Hidden text box' : 'Text box'} · drag to move · double-click to edit`}
                      tag={b.hidden ? { text: 'Hidden', tone: 'grey' } : b.waiting ? { text: 'Waiting for Go live', tone: 'amber' } : undefined}
                      onSelect={() => { setSelected(b.id); setSelectedWord(null); }}
                      onChange={(r) => setLayoutOf(b.id, r, 'draft')}
                      onChangeEnd={(r) => setLayoutOf(b.id, r, 'commit')}
                      onDoubleClick={() => setEditing(b.id)}
                    />
                  )}
                </React.Fragment>
              ))}
              {editing === 'lyrics' && slideText !== null && (
                <InlineTextEditor
                  rect={lyricsLook.layout}
                  scale={scale}
                  initialText={slideText}
                  hint="Editing the words on this slide (all screens)"
                  sendsToScreen={slideIsOnAir}
                  onSave={(text) => saveText('lyrics', text)}
                  onCancel={() => cancelText('lyrics')}
                />
              )}
              {editingBox && (
                <InlineTextEditor
                  rect={editingBox.layout}
                  scale={scale}
                  initialText={editingBox.text}
                  placeholder="Type your text…"
                  hint={editingBox.waiting ? `New text box (${outputName} only) · it goes on the screen when you click Go live` : `Editing this text box (${outputName} only)`}
                  sendsToScreen={slideIsOnAir && !editingBox.hidden && !editingBox.waiting}
                  onSave={(text) => saveText(editingBox.id, text)}
                  onCancel={() => cancelText(editingBox.id)}
                />
              )}
              {slideText === null && (
                <div className="absolute inset-0 flex items-center justify-center text-neutral-600 font-sans font-bold uppercase tracking-widest" style={{ fontSize: 40 }}>
                  Select a song to design
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none z-30" style={{ boxShadow: `inset 0 0 0 ${2 / Math.max(scale, 0.0001)}px rgba(255,255,255,0.1)` }} />
            </>
          )}
        </FixedStage>
      </div>

      {/* SLIDE STRIP: click to design, double-click to go live, Shift+drag / Shift+click / Ctrl+click to select, right-click for more */}
      <div className="h-[104px] shrink-0 border-t border-[#262635] bg-[#0d0d12] flex items-stretch">
        <div className="w-[17rem] shrink-0 px-3 py-2 border-r border-[#262635] flex flex-col justify-between">
          <div className="min-w-0">
            <div className="text-xs text-white font-semibold truncate">{songTitle || '—'}</div>
            <div className="text-[10px] text-neutral-500 leading-snug">Click to design · Double-click to go live<br />Drag to move · Right-click for more</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 mb-1">Copy this slide's design to</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!design || otherSlideIds.length === 0}
                onClick={copyToAll}
                className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10`}
                title={design ? undefined : 'This slide uses the template look. Design it first.'}
              >
                All slides
              </button>
              <button
                type="button"
                disabled={!design || chosenTargets.length === 0}
                onClick={copyToChosen}
                className={`${smallBtn} bg-pink-600/80 text-white hover:bg-pink-600`}
                title={design ? 'Select slides first: Shift+drag across them, or Ctrl+click them' : 'This slide uses the template look. Design it first.'}
              >
                Selected ({chosenTargets.length})
              </button>
              {chosen.size > 0 && (
                <>
                  <button type="button" disabled={chosenTargets.length === 0} onClick={resetChosen} className={`${smallBtn} text-neutral-400 hover:text-white`} title="Put the selected slides back to the template look">
                    Reset
                  </button>
                  <button type="button" onClick={() => { setChosen(new Set()); anchorRef.current = null; }} className={`${smallBtn} text-neutral-500 hover:text-white`} title="Clear the selection">
                    <X size={11} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <div
          ref={stripRef}
          onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}
          className="flex-1 min-w-0 flex gap-2 overflow-x-auto px-2 py-2 custom-scrollbar"
        >
          {slides.length === 0 && (
            onInsertSlide
              ? <AddFirstSlideButton onClick={() => insertAt(0)} />
              : <div className="self-center text-xs text-neutral-600 px-2">No song slides</div>
          )}
          {slides.map((s, i) => {
            const isLive = s.id === liveSlideId;
            const isCanvas = s.id === canvasSlideId;
            const isChosen = chosen.has(s.id);
            const hasDesign = !!s.designs?.[selectedOutputId];
            const isMoving = !!reorder?.ids.includes(s.id);
            const showDropMarker = !!reorder && reorder.before === i && moveChangesOrder(reorder.ids, i);
            return (
              <React.Fragment key={s.id}>
                {showDropMarker && <DropMarker />}
                <div
                  role="button"
                  tabIndex={0}
                  data-slide-id={s.id}
                  onPointerDown={(e) => onCardPointerDown(i, e)}
                  onPointerEnter={() => onCardPointerEnter(i)}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuView('main'); setSlideMenu({ x: e.clientX, y: e.clientY, index: i }); }}
                  onClick={(e) => {
                    if (suppressClickRef.current || e.shiftKey || e.ctrlKey || e.metaKey) return;
                    onPickSlide(s);
                    anchorRef.current = i;
                  }}
                  onDoubleClick={(e) => { if (!s.disabled && !e.shiftKey && !e.ctrlKey && !e.metaKey) onGoLive(s); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') onPickSlide(s); }}
                  className={`relative w-40 shrink-0 rounded-lg border text-left px-2 pb-4 pt-6 cursor-pointer transition-colors outline-none ${
                    isCanvas ? 'border-blue-400 bg-blue-500/10' : isLive ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                  } ${isChosen ? 'ring-2 ring-pink-500' : isCanvas ? 'ring-1 ring-blue-400/40' : ''} ${isMoving ? 'opacity-30' : s.disabled ? 'opacity-40' : ''}`}
                  title={isCanvas ? 'Being designed · drag to move · right-click for more' : 'Click to design · double-click to go live · drag to move · right-click for more'}
                >
                  <span className="absolute top-1 left-1.5 right-10 flex items-center gap-1 text-[10px] font-bold text-neutral-400 min-w-0">
                    {isChosen && <span className="w-3.5 h-3.5 shrink-0 rounded-full bg-pink-500 text-white flex items-center justify-center"><Check size={9} strokeWidth={3} /></span>}
                    {i + 1}
                    {s.group && (
                      <span className={`px-1 rounded text-[9px] uppercase tracking-wide truncate ${groupColors(s.group).bg} ${groupColors(s.group).text}`}>{s.group}</span>
                    )}
                  </span>
                  {isLive && <span className="absolute top-1 right-2 text-[9px] font-bold tracking-wider text-pink-400">LIVE</span>}
                  <span className="block text-[10px] leading-snug text-neutral-200 line-clamp-2 whitespace-pre-line">{s.text}</span>
                  {hasDesign && <span className="absolute bottom-1 right-2 text-[9px] font-bold text-pink-400" title={`Has its own design on ${outputName}`}>✦ Own design</span>}
                </div>
              </React.Fragment>
            );
          })}
          {reorder && reorder.before === slides.length && moveChangesOrder(reorder.ids, slides.length) && <DropMarker />}
        </div>
      </div>

      {/* Right-click menu for a strip slide (opens above the pointer, since the strip is at the bottom) */}
      {slideMenu && slides[slideMenu.index] && (() => {
        const menuSlide = slides[slideMenu.index];
        const targets = menuTargets(slideMenu.index);
        const act = (fn: () => void) => () => { setSlideMenu(null); fn(); };
        return (
          <div
            data-slide-menu
            className="fixed z-[150] min-w-[210px] py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl text-xs text-neutral-200"
            style={{ left: Math.min(slideMenu.x, window.innerWidth - 220), top: slideMenu.y, transform: 'translateY(-100%)' }}
          >
            {menuView === 'main' ? (
              <>
                <MenuButton disabled={!onInsertSlide} onClick={act(() => insertAt(slideMenu.index))}><Plus size={13} /> Add slide before</MenuButton>
                <MenuButton disabled={!onInsertSlide} onClick={act(() => insertAt(slideMenu.index + 1))}><Plus size={13} /> Add slide after</MenuButton>
                <div className="h-px bg-white/5 my-1" />
                <MenuButton disabled={!onSetSlideGroup} onClick={() => setMenuView('groups')}>
                  <Tag size={13} /> Set group{targets.length > 1 ? ` (${targets.length} slides)` : ''}…
                  {menuSlide.group && <span className={`ml-auto text-[10px] ${groupColors(menuSlide.group).text}`}>{menuSlide.group}</span>}
                </MenuButton>
                {menuSlide.group && (
                  <MenuButton disabled={!onUseLookForGroup} onClick={act(() => applyLookToGroup(menuSlide.group!, menuSlide.id))}>
                    <Send size={13} /> Use this look for all {menuSlide.group} slides
                  </MenuButton>
                )}
                <div className="h-px bg-white/5 my-1" />
                <MenuButton onClick={act(() => onPickSlide(menuSlide))}><Eye size={13} /> Design this slide</MenuButton>
                <MenuButton disabled={!!menuSlide.disabled} onClick={act(() => onGoLive(menuSlide))}><Play size={13} /> Go live</MenuButton>
                <div className="h-px bg-white/5 my-1" />
                <MenuButton danger disabled={!onDeleteSlide} onClick={act(() => deleteSlide(menuSlide.id))}><Trash2 size={13} /> Delete slide</MenuButton>
              </>
            ) : (
              <>
                <MenuButton onClick={() => setMenuView('main')}>
                  <ChevronLeft size={13} /> Group for {targets.length > 1 ? `${targets.length} slides` : `slide ${slideMenu.index + 1}`}
                </MenuButton>
                <div className="h-px bg-white/5 my-1" />
                {GROUP_PRESETS.map(g => (
                  <React.Fragment key={g}>
                    <MenuButton onClick={act(() => setGroupFor(targets, g))}>
                      <span className={`w-2 h-2 rounded-full ${groupColors(g).dot}`} /> {g}
                      {menuSlide.group === g && <Check size={12} className="ml-auto" />}
                    </MenuButton>
                  </React.Fragment>
                ))}
                <MenuButton onClick={act(() => askCustomGroup(targets))}><Plus size={13} /> Other name…</MenuButton>
                {slides.some(s => targets.includes(s.id) && s.group) && (
                  <>
                    <div className="h-px bg-white/5 my-1" />
                    <MenuButton danger onClick={act(() => setGroupFor(targets, undefined))}><X size={13} /> Remove group</MenuButton>
                  </>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/** Shows where a dragged slide will land */
function DropMarker() {
  return <div className="w-1 shrink-0 self-stretch rounded-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.8)]" />;
}

function MenuButton({ onClick, disabled = false, danger = false, children }: { onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'hover:bg-white/5 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

/** Shown only when the song has no slides yet (otherwise right-click a slide to add one) */
function AddFirstSlideButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="self-center px-3 py-2 rounded-lg flex items-center gap-1.5 text-[11px] text-neutral-300 hover:bg-white/5">
      <span className="w-4 h-4 rounded-full bg-pink-600 text-white flex items-center justify-center"><Plus size={10} strokeWidth={3} /></span>
      Add a slide
    </button>
  );
}
