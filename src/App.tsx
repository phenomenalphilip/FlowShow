import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Settings, MonitorPlay, Mic, BookOpen, Music, Image as ImageIcon, 
  Plus, Search, List, Grid, X, LayoutTemplate, Layers, Play,
  SquareSquare, MonitorOff, MonitorUp, EyeOff, FileText,
  Activity, Upload, ExternalLink, Edit2, Copy, Trash, GripVertical, Split,
  Pause, Volume2, VolumeX, Save, ChevronDown, ExternalLink as LaunchIcon, Clock, Lock, Unlock, PanelLeft, PanelLeftClose,
  Radio, Tv, Wifi, ListOrdered, Check, Sparkles, ChevronRight, ChevronLeft,
  Folder, FolderPlus, RotateCcw, Eye, MoreHorizontal, MoreVertical, Calendar, Puzzle, Sliders, Info, Minus, Maximize2, Square, Wand2
} from 'lucide-react';
import { ndiService, NdiSource, NdiOutputChannel } from './lib/ndi';
import { SetlistManager } from './components/SetlistManager';
import { ServiceSetlist, SetlistItem, loadCurrentSetlist, saveCurrentSetlist, DEFAULT_SAMPLE_SETLIST } from './lib/setlist';

function formatTime(seconds: number) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

import { MediaLibrary } from './components/MediaLibrary';
import { AudioModule } from './components/AudioModule';
import { AddSongModal } from './components/AddSongModal';
import { get, set } from 'idb-keyval';
import { SmartTextLayout } from './components/SmartTextLayout';
import { FixedStage } from './components/FixedStage';
import { BibleVersion, getBibleList, getBible, saveBible, deleteBible, initDatabase } from './lib/bibleDb';
import { parseBibleXml } from './lib/xmlParser';
import { AnimationConfig, PresentationTemplate, STARTER_TEMPLATES, getStoredTemplates, subscribeTemplates, getCachedTemplates, FALLBACK_ANIMATION } from './lib/templates';
import { LiveDesignWorkspace, OutputTemplateInfo } from './components/LiveDesignWorkspace';
import { detectGroups, groupColors } from './lib/slideGroups';
import { GroupMenu } from './components/GroupMenu';
import { TemplateGalleryModal, TemplateGalleryModalProps, InlineTemplateGrid } from './components/TemplateGalleryModal';
import { StageScreen } from './components/StageScreen';
import { StageWorkspace, StageLiveData } from './components/StageWorkspace';
import { DEFAULT_LYRICS_STAGE_LAYOUT, DEFAULT_SCRIPTURE_STAGE_LAYOUT, StageLayout, stageLayoutFor } from './lib/stageLayouts';

export type SlideType = 'lyrics' | 'scripture' | 'blank' | 'media';

export type SlideDefinition = {
  id: string;
  text: string;
  source?: string;
  backgroundUrl?: string;
  type: SlideType;
  disabled?: boolean;
  templateId?: string;
  outputTemplates?: { [outputId: string]: string };
  /** This slide's own look per screen, made in Design mode; layered over the template without changing it */
  designs?: { [outputId: string]: SlideDesign };
  /** Song section this slide belongs to, e.g. "Verse 1", "Chorus", "Bridge" */
  group?: string;
  animation?: AnimationConfig;
  styleOverrides?: {
    global?: React.CSSProperties & { '--font-scale'?: number };
    words?: { [wordIndex: number]: React.CSSProperties };
    lines?: { [lineIndex: number]: React.CSSProperties };
    layout?: { x: number; y: number; width: number; height: number };
    sourceGlobal?: React.CSSProperties & { '--font-scale'?: number };
    sourceLayout?: { x: number; y: number; width: number; height: number };
  };
};

export type OutputType = 'hdmi' | 'ndi';
/** Who a screen (or a style) is for: the audience ('normal') or the people on stage */
export type ScreenKind = 'normal' | 'stage';

// ─── Presentation Style ───────────────────────────────────────────────────────
// A named, reusable style that an output can reference.
// A style owns its background settings and two template slots (lyrics / scripture).
// Outputs point to a style by id; the style's templates override per-song templates.
export interface PresentationStyle {
  id: string;
  name: string;
  /** Chosen when the style is made; a stage output only offers Stage styles and vice versa (missing = normal) */
  kind?: ScreenKind;
  /** Stage styles: the stage layout for lyrics/song slides */
  lyricsStageLayoutId?: string;
  /** Stage styles: the stage layout for scripture slides */
  scriptureStageLayoutId?: string;
  backgroundColor: string;
  backgroundMedia?: { url: string; type: 'image' | 'video'; fileName?: string } | null;
  transition: 'none' | 'fade' | 'slide' | 'zoom';
  mediaFit: 'contain' | 'cover' | 'fill' | 'none';
  aspectRatio: '16:9' | '4:3' | '1:1';
  activeLayers: { background: boolean; slide: boolean; overlays: boolean };
  /** Template id used for lyrics/song slides */
  lyricsTemplateId?: string;
  /** Template id used for scripture slides */
  scriptureTemplateId?: string;
  /** Optional text-style overrides for lyrics */
  lyricsStyleOverride?: { global?: React.CSSProperties & { '--font-scale'?: number }; layout?: { x: number; y: number; width: number; height: number } };
  /** Optional text-style overrides for scripture */
  scriptureStyleOverride?: { global?: React.CSSProperties & { '--font-scale'?: number }; layout?: { x: number; y: number; width: number; height: number }; sourceGlobal?: React.CSSProperties & { '--font-scale'?: number }; sourceLayout?: { x: number; y: number; width: number; height: number } };
}

export const DEFAULT_STYLES: PresentationStyle[] = [
  {
    id: 'default',
    name: 'Default',
    backgroundColor: '#000000',
    transition: 'fade',
    mediaFit: 'contain',
    aspectRatio: '16:9',
    activeLayers: { background: true, slide: true, overlays: true },
  },
  {
    id: 'stage',
    name: 'Stage',
    kind: 'stage',
    lyricsStageLayoutId: DEFAULT_LYRICS_STAGE_LAYOUT,
    scriptureStageLayoutId: DEFAULT_SCRIPTURE_STAGE_LAYOUT,
    backgroundColor: '#000000',
    transition: 'none',
    mediaFit: 'contain',
    aspectRatio: '16:9',
    activeLayers: { background: true, slide: true, overlays: true },
  },
];

/** Built-in styles come back on every load, so they can't be deleted */
export const BUILT_IN_STYLE_IDS = new Set(DEFAULT_STYLES.map(s => s.id));

export interface OutputSettings {
  id: string;
  name: string;
  enabled: boolean;
  outputType: OutputType;
  /** Chosen when the output is made: an audience screen ('normal', the default) or a stage screen */
  kind?: ScreenKind;
  /** Id of the PresentationStyle this output uses */
  styleId?: string;
  defaultTemplateId?: string;
  defaultBackground: { 
    url?: string; 
    color?: string; 
    type: 'image' | 'video' | 'color' | 'ndi' | 'none'; 
    fileName?: string;
    ndiSourceId?: string;
  } | null;
  lyricsStyleEnabled: boolean;
  lyricsStyle: { global?: React.CSSProperties & { '--font-scale'?: number }; layout?: { x: number; y: number; width: number; height: number } } | React.CSSProperties;
  bibleStyleEnabled: boolean;
  bibleStyle: { global?: React.CSSProperties & { '--font-scale'?: number }; layout?: { x: number; y: number; width: number; height: number }; sourceGlobal?: React.CSSProperties & { '--font-scale'?: number }; sourceLayout?: { x: number; y: number; width: number; height: number } } | React.CSSProperties;
  // HDMI-specific
  displayId?: string;
  // NDI-specific
  ndiStreamName?: string;
  ndiGroup?: string;
  ndiResolution?: '1920x1080' | '1280x720' | '3840x2160';
  ndiFrameRate?: number;
  ndiTransparent?: boolean;
  ndiAlphaChannel?: boolean;
}

export interface GlobalSettings {
  outputs: OutputSettings[];
  styles: PresentationStyle[];
  /** Stage layouts made in the Stage tab (the ready-made ones aren't stored) */
  stageLayouts?: StageLayout[];
}

const DEFAULT_SETTINGS: GlobalSettings = {
  outputs: [
    {
      id: 'main',
      name: 'Output 1',
      enabled: true,
      outputType: 'hdmi',
      defaultTemplateId: 'cinematic-ambient',
      defaultBackground: null,
      lyricsStyleEnabled: false,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
      bibleStyleEnabled: false,
      bibleStyle: {
        global: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
        sourceGlobal: { color: '#fbbf24', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal' },
        sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 }
      }
    },
    {
      id: 'output-2',
      name: 'Output 2',
      enabled: true,
      outputType: 'ndi',
      ndiStreamName: 'FlowShow NDI - NDI 1',
      ndiResolution: '1920x1080',
      ndiFrameRate: 30,
      ndiTransparent: true,
      defaultTemplateId: 'cinematic-ambient',
      defaultBackground: null,
      lyricsStyleEnabled: false,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
      bibleStyleEnabled: false,
      bibleStyle: {
        global: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
        sourceGlobal: { color: '#fbbf24', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal' },
        sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 }
      }
    }
  ],
  styles: DEFAULT_STYLES,
};

export type PresentState = {
  slide: SlideDefinition | null;
  globalBackground: { url: string; type: 'image' | 'video', fileName?: string } | null;
  clearText: boolean;
  clearedOutputs?: Record<string, boolean>; 
  lockedOutputs?: Record<string, boolean>; 
  frozenStates?: Record<string, { slide: SlideDefinition | null; bg: any; clearText: boolean }>; 
  videoInitState?: {
    time: number;
    muted: boolean;
    playing: boolean;
  };
  settings?: GlobalSettings;
  isPresenting?: boolean;
  /** What stage screens show besides the live slide */
  stage?: StageInfo;
};

export interface StageInfo {
  /** The slide that comes after the live one (null at the end) */
  nextSlide: SlideDefinition | null;
  songTitle?: string;
}

export const isStageOutput = (o: OutputSettings | null | undefined) => o?.kind === 'stage';
export const styleKind = (s: PresentationStyle): ScreenKind => s.kind ?? 'normal';

/** A new output with the usual defaults. A stage output starts with the first Stage style. */
export const createOutput = (type: OutputType, kind: ScreenKind, existing: OutputSettings[], styles: PresentationStyle[]): OutputSettings => {
  const stage = kind === 'stage';
  const name = stage ? `Stage ${existing.filter(isStageOutput).length + 1}`
    : type === 'ndi' ? `NDI ${existing.filter(o => o.outputType === 'ndi').length + 1}`
    : `Output ${existing.length + 1}`;
  return {
    id: `${type}-${Date.now()}`,
    name,
    enabled: true,
    outputType: type,
    kind,
    styleId: stage ? styles.find(s => styleKind(s) === 'stage')?.id : undefined,
    defaultBackground: null,
    lyricsStyleEnabled: false,
    lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
    bibleStyleEnabled: false,
    bibleStyle: {
      global: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
      layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
      sourceGlobal: { color: '#fbbf24', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal' },
      sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 }
    },
    ...(type === 'ndi' ? {
      ndiStreamName: `FlowShow NDI - ${name}`,
      ndiGroup: '',
      ndiResolution: '1920x1080' as const,
      ndiFrameRate: 30,
      ndiTransparent: !stage,
      ndiAlphaChannel: false
    } : {})
  };
};

const CHANNEL_NAME = 'flowshow_presence_channel';

// Undo: changes closer together than this count as one step; keep this many steps
const UNDO_MERGE_MS = 500;
const UNDO_LIMIT = 100;

import { getTemplateById } from './lib/templates';

type SongTemplateRefs = { id?: string; templateId?: string; outputTemplates?: { [outputId: string]: string } };
export type TemplateSource = 'style' | 'slide-output' | 'slide' | 'song-output' | 'song' | 'output-default' | 'none';

/**
 * Which template an output uses for a slide, and where that choice came from.
 * Priority: Style template -> Slide output override -> Slide general -> Song output override -> Song general -> Output default
 */
export const resolveTemplateSource = (
  slide: Pick<SlideDefinition, 'type' | 'templateId' | 'outputTemplates'> | null | undefined,
  outputConfig?: OutputSettings,
  song?: SongTemplateRefs,
  presentationStyle?: PresentationStyle
): { templateId?: string; source: TemplateSource } => {
  const outputId = outputConfig?.id || 'main';
  const styleTemplateId = presentationStyle
    ? (slide?.type === 'scripture' ? presentationStyle.scriptureTemplateId : presentationStyle.lyricsTemplateId)
    : undefined;

  const chain: [string | undefined, TemplateSource][] = [
    [styleTemplateId, 'style'],
    [slide?.outputTemplates?.[outputId], 'slide-output'],
    [slide?.templateId, 'slide'],
    [song?.outputTemplates?.[outputId], 'song-output'],
    [song?.templateId, 'song'],
    [outputConfig?.defaultTemplateId, 'output-default'],
  ];
  const hit = chain.find(([id]) => !!id);
  if (!hit || hit[0] === NO_TEMPLATE_ID) return { templateId: undefined, source: 'none' };
  return { templateId: hit[0], source: hit[1] };
};

/** An extra text box added to a slide on one output in Design mode */
export interface CustomTextBox {
  id: string;
  text: string;
  layout: { x: number; y: number; width: number; height: number };
  style?: React.CSSProperties;
  animation?: Partial<AnimationConfig>;
  /** Kept on the slide but not shown on the screen */
  hidden?: boolean;
  /** Newly added: not on the screen until its slide goes live */
  waiting?: boolean;
}

/** Whether a custom text box appears on the screens (the Design canvas also shows hidden and waiting boxes) */
export const isBoxOnScreen = (box: CustomTextBox) => !box.hidden && !box.waiting;

export interface SlideDesign {
  global?: React.CSSProperties;
  layout?: { x: number; y: number; width: number; height: number };
  animation?: Partial<AnimationConfig>;
  /** Hide the slide's own lyrics on this output */
  hideLyrics?: boolean;
  customBoxes?: CustomTextBox[];
  /** Styles for single words of the lyrics, by word number across the slide */
  words?: { [wordIndex: number]: React.CSSProperties };
}

type ResolvedLook = { styleOverrides: SlideDefinition['styleOverrides']; animation?: AnimationConfig };
type WordStyles = { [wordIndex: number]: React.CSSProperties };

export const resolveCustomBoxAnimation = (box: CustomTextBox): AnimationConfig | undefined =>
  box.animation ? { ...FALLBACK_ANIMATION, ...box.animation } as AnimationConfig : undefined;

const mergeWordStyles = (base: WordStyles | undefined, extra: WordStyles | undefined): WordStyles | undefined => {
  if (!extra) return base;
  const merged: WordStyles = { ...(base || {}) };
  for (const [key, style] of Object.entries(extra)) merged[Number(key)] = { ...(merged[Number(key)] || {}), ...style };
  return merged;
};

const applySlideDesign = (base: ResolvedLook, design?: SlideDesign): ResolvedLook => {
  if (!design) return base;
  return {
    styleOverrides: {
      ...base.styleOverrides,
      global: { ...(base.styleOverrides?.global || {}), ...(design.global || {}) },
      layout: design.layout || base.styleOverrides?.layout,
      words: mergeWordStyles(base.styleOverrides?.words, design.words),
    },
    animation: design.animation
      ? { ...(base.animation || FALLBACK_ANIMATION), ...design.animation } as AnimationConfig
      : base.animation,
  };
};

/** The look of a slide on one output: its template, then the slide's own design for that output on top. */
export const resolveSlideForOutput = (
  slide: SlideDefinition | null,
  outputConfig?: OutputSettings,
  song?: SongTemplateRefs,
  presentationStyle?: PresentationStyle
): ResolvedLook => {
  const base = resolveBaseLook(slide, outputConfig, song, presentationStyle);
  return slide ? applySlideDesign(base, slide.designs?.[outputConfig?.id || 'main']) : base;
};

const resolveBaseLook = (
  slide: SlideDefinition | null,
  outputConfig?: OutputSettings,
  song?: SongTemplateRefs,
  presentationStyle?: PresentationStyle
): ResolvedLook => {
  if (!slide) return { styleOverrides: undefined, animation: undefined };

  const { templateId, source } = resolveTemplateSource(slide, outputConfig, song, presentationStyle);
  const styleTemplateId = source === 'style' ? templateId : undefined;
  const template = templateId ? getTemplateById(templateId) : undefined;

  // Display style template is authoritative: ignore song/slide look (which is baked into
  // slide.styleOverrides/animation when a template is applied to a song). Word-level emphasis is kept.
  if (styleTemplateId && template) {
    return {
      styleOverrides: {
        global: { ...(template.styles.global || {}) },
        lines: { ...(template.styles.lines || {}) },
        words: slide.styleOverrides?.words,
        layout: template.styles.layout,
        sourceGlobal: { ...(template.styles.sourceGlobal || {}) },
        sourceLayout: template.styles.sourceLayout
      },
      animation: template.animation
    };
  }

  let baseGlobal = template?.styles.global || {};
  let baseLayout = template?.styles.layout;
  let baseLines = template?.styles.lines || {};
  let animation = slide.animation || template?.animation;

  let mergedStyle: SlideDefinition['styleOverrides'] = {
    ...slide.styleOverrides,
    global: {
      ...baseGlobal,
      ...(slide.styleOverrides?.global || {})
    },
    lines: {
      ...baseLines,
      ...(slide.styleOverrides?.lines || {})
    },
    layout: slide.styleOverrides?.layout || baseLayout,
    sourceGlobal: {
      ...(template?.styles.sourceGlobal || {}),
      ...(slide.styleOverrides?.sourceGlobal || {})
    },
    sourceLayout: slide.styleOverrides?.sourceLayout || template?.styles.sourceLayout
  };

  // Legacy style overrides if explicitly toggled on
  if (slide.type === 'lyrics' && outputConfig?.lyricsStyleEnabled) {
    const legacy = (outputConfig.lyricsStyle as any)?.global || outputConfig.lyricsStyle;
    mergedStyle.global = { ...mergedStyle.global, ...legacy };
    if ((outputConfig.lyricsStyle as any)?.layout) {
      mergedStyle.layout = (outputConfig.lyricsStyle as any).layout;
    }
  }
  if (slide.type === 'scripture' && outputConfig?.bibleStyleEnabled) {
    const bibleStyle = outputConfig.bibleStyle as any;
    mergedStyle.global = { ...mergedStyle.global, ...bibleStyle?.global || bibleStyle };
    if (bibleStyle?.layout) mergedStyle.layout = bibleStyle.layout;
    mergedStyle.sourceGlobal = { ...mergedStyle.sourceGlobal, ...bibleStyle?.sourceGlobal };
    if (bibleStyle?.sourceLayout) mergedStyle.sourceLayout = bibleStyle.sourceLayout;
  }

  return { styleOverrides: mergedStyle, animation };
};

// Explicit "no template": stops the fallback to song/output default templates (a display style's template still wins).
export const NO_TEMPLATE_ID = 'none';

// Reference the template by id instead of copying its look, so later template edits show up.
// Clears previously copied look; keeps word-level emphasis.
const linkSlideToTemplate = (s: SlideDefinition, templateId: string): SlideDefinition => ({
  ...s,
  templateId,
  animation: undefined,
  styleOverrides: s.styleOverrides?.words ? { words: s.styleOverrides.words } : undefined
});

/** A design with nothing in it is dropped, so the slide shows its template */
const hasDesignContent = (d: SlideDesign | undefined): d is SlideDesign => !!d && (
  !!d.layout || !!d.hideLyrics || (d.customBoxes?.length ?? 0) > 0 ||
  Object.keys(d.global || {}).length > 0 || Object.keys(d.animation || {}).length > 0 ||
  Object.keys(d.words || {}).length > 0
);

/** A slide design without the parts a template sets (font, size, colours, position, motion); word styles and text boxes stay */
const withoutOwnLook = (d: SlideDesign): SlideDesign => ({ ...d, global: undefined, layout: undefined, animation: undefined });

/** The slide with its waiting text boxes put on the screens (the same slide object when none are waiting) */
const releaseWaitingBoxes = (slide: SlideDefinition): SlideDefinition => {
  const designs = slide.designs;
  if (!designs || !Object.values(designs).some(d => d.customBoxes?.some(b => b.waiting))) return slide;
  const released: { [outputId: string]: SlideDesign } = {};
  for (const [outputId, d] of Object.entries(designs)) {
    released[outputId] = d.customBoxes?.some(b => b.waiting)
      ? { ...d, customBoxes: d.customBoxes.map(b => b.waiting ? { ...b, waiting: undefined } : b) }
      : d;
  }
  return { ...slide, designs: released };
};

/** Look up the PresentationStyle assigned to an output, given the full settings. */
export const getStyleForOutput = (outputConfig: OutputSettings | undefined, settings: GlobalSettings | undefined): PresentationStyle | undefined => {
  if (!outputConfig?.styleId || !settings?.styles) return undefined;
  return settings.styles.find(s => s.id === outputConfig.styleId);
};

type RawBackground = { url?: string; color?: string; type: 'image' | 'video' | 'color' | 'ndi' | 'none'; fileName?: string } | null | undefined;

/**
 * Resolve the effective background for a single output, applying the output's
 * assigned Style rules on top of the raw (song/global/default) background.
 *
 * Priority (highest first):
 *   1. Style activeLayers.background === false  → null (suppress entirely)
 *   2. Style has backgroundMedia                → use style's own media
 *   3. Otherwise                               → pass rawBackground through unchanged
 */
export const resolveOutputBackground = (
  rawBackground: RawBackground,
  outputConfig: OutputSettings | undefined,
  settings: GlobalSettings | undefined
): RawBackground => {
  const style = getStyleForOutput(outputConfig, settings);
  if (!style) return rawBackground;

  // Style explicitly disables the background layer
  if (!style.activeLayers.background) return null;

  // Style supplies its own background media (overrides song/output background)
  if (style.backgroundMedia) {
    return { url: style.backgroundMedia.url, type: style.backgroundMedia.type, fileName: style.backgroundMedia.fileName };
  }

  return rawBackground;
};

const applyGlobalStyles = (
  slide: SlideDefinition | null,
  outputConfig?: OutputSettings,
  settings?: GlobalSettings
): SlideDefinition['styleOverrides'] => {
  const presStyle = getStyleForOutput(outputConfig, settings);
  return resolveSlideForOutput(slide, outputConfig, undefined, presStyle).styleOverrides;
};

// We import the new component for settings
import { OutputStyleEditor, OutputStyleConfig } from './components/OutputStyleEditor';
import { StylesManager } from './components/StylesManager';

function SettingsModal({ isOpen, onClose, settings, onSave, isPresenting, onTogglePresenting, onToggleLockOutput }: any) {
  const [activeTab, setActiveTab] = useState('outputs');
  const [activeOutputId, setActiveOutputId] = useState(settings.outputs[0]?.id || 'main');
  const [local, setLocal] = useState<GlobalSettings>(settings);
  const [allTemplates, setAllTemplates] = useState<PresentationTemplate[]>(STARTER_TEMPLATES);
  useEffect(() => { getStoredTemplates().then(setAllTemplates); }, []);
  const [editingStyleType, setEditingStyleType] = useState<'lyrics' | 'scripture' | null>(null);
  const [detectedScreens, setDetectedScreens] = useState<any[]>([]);
  const [selectingTemplateForOutput, setSelectingTemplateForOutput] = useState<OutputSettings | null>(null);
  const [ndiSources, setNdiSources] = useState<NdiSource[]>(ndiService.getDiscoveredSources());
  const [isScanningNdi, setIsScanningNdi] = useState(false);
  const [showNewOutputModal, setShowNewOutputModal] = useState(false);
  const [selectedNewOutputType, setSelectedNewOutputType] = useState<OutputType | null>(null);
  const [selectedNewOutputKind, setSelectedNewOutputKind] = useState<ScreenKind | null>(null);

  // While open, only pull in styles (saved instantly) so other unsaved edits survive.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && wasOpenRef.current) {
      setLocal(prev => ({ ...prev, styles: settings.styles }));
    } else {
      setLocal(settings);
    }
    wasOpenRef.current = isOpen;
  }, [settings, isOpen]);

  // Styles save immediately (not gated on "Save Settings").
  const commitStyleChange = (fn: (prev: GlobalSettings) => GlobalSettings) => {
    setLocal(fn);
    onSave((prev: GlobalSettings) => fn(prev));
  };
  useEffect(() => {
     const current = local.outputs.find(o => o.id === activeOutputId);
     if (!current) setActiveOutputId(local.outputs[0]?.id || 'main');
  }, [local.outputs, activeOutputId]);

  if (!isOpen) return null;

  const updateOutput = (id: string, updatedFields: Partial<OutputSettings>) => {
    setLocal(prev => ({ ...prev, outputs: prev.outputs.map(o => o.id === id ? { ...o, ...updatedFields } : o) }));
  };

  const activeOutput = local.outputs.find(o => o.id === activeOutputId);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const fileName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => updateOutput(activeOutputId, { defaultBackground: { type, url: ev.target?.result as string, fileName } });
    reader.readAsDataURL(file);
  };

  const detectScreens = async () => {
    try {
        if ('getScreenDetails' in window) {
            const details = await (window as any).getScreenDetails();
            setDetectedScreens(details.screens);
        } else {
            alert('Screen detection not supported in this browser or iframe.');
        }
    } catch (err: any) {
        console.warn(err);
        alert('Could not detect screens. ' + err.message);
    }
  };

  const closeNewOutputModal = () => {
    setShowNewOutputModal(false);
    setSelectedNewOutputType(null);
    setSelectedNewOutputKind(null);
  };

  const addNewOutput = (type: OutputType, kind: ScreenKind) => {
    const newOutput = createOutput(type, kind, local.outputs, local.styles);
    setLocal(prev => ({ ...prev, outputs: [...prev.outputs, newOutput] }));
    setActiveOutputId(newOutput.id);
    closeNewOutputModal();
  };

  const removeOutput = (id: string) => {
    setLocal(prev => ({ ...prev, outputs: prev.outputs.filter(o => o.id !== id) }));
    if (activeOutputId === id) {
      setActiveOutputId(local.outputs[0]?.id || 'main');
    }
  };

  const StyleConfigurator = ({ title, enabled, styleObj, onToggle, onEdit }: any) => {
    return (
      <div className="bg-[#121214] border border-white/5 p-6 rounded-xl mb-4 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-3 cursor-pointer group">
             <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-blue-500 rounded cursor-pointer" />
             <span className="font-bold uppercase tracking-wider text-sm text-neutral-300 group-hover:text-white transition-colors">{title}</span>
          </label>
          <button 
             disabled={!enabled}
             onClick={onEdit} 
             className="bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/5"
          >
             Edit Layout & Format
          </button>
        </div>
      </div>
    );
  };

  // Output-specific configuration panel (the main config body)
  const renderOutputConfig = () => {
    if (!activeOutput) return null;
    const isNdi = activeOutput.outputType === 'ndi';
    const isHdmi = activeOutput.outputType === 'hdmi' || !activeOutput.outputType;
    const isStage = isStageOutput(activeOutput);

    return (
      <div className="space-y-6">
        {/* Enabled Toggle */}
        <div className="bg-[#121214] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Enabled</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={activeOutput.enabled} 
                onChange={(e) => updateOutput(activeOutputId, { enabled: e.target.checked })}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* What the screen is for (chosen when it was made) */}
        <div className="bg-[#121214] border border-white/5 rounded-xl px-5 py-3 flex items-center gap-3">
          {isStage ? <Tv size={16} className="text-amber-400 shrink-0" /> : <MonitorPlay size={16} className="text-blue-400 shrink-0" />}
          <div className="text-xs">
            <span className="font-semibold text-white">{isStage ? 'Stage output' : 'Normal output'}</span>
            <span className="text-neutral-500"> · {isStage ? 'for the people on stage: current and next slide, section name and time' : 'for the audience: lyrics and scripture in your templates and designs'}</span>
          </div>
        </div>

        {/* Style selector — pick which PresentationStyle this output uses (only styles of the same kind) */}
        <div className="bg-[#121214] border border-white/5 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">{isStage ? 'Stage style' : 'Style'}</span>
            <select
              value={activeOutput.styleId || ''}
              onChange={(e) => updateOutput(activeOutputId, { styleId: e.target.value || undefined })}
              className="bg-[#1e1e28] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 cursor-pointer min-w-[160px]"
            >
              <option value="">{isStage ? '(None — ready-made stage layouts)' : '(None — use output defaults)'}</option>
              {local.styles.filter(s => styleKind(s) === (isStage ? 'stage' : 'normal')).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {activeOutput.styleId && (() => {
            const sel = local.styles.find(s => s.id === activeOutput.styleId);
            if (!sel) return null;
            if (isStage) return (
              <div className="text-[11px] text-neutral-500 leading-relaxed space-y-0.5 pt-1 border-t border-white/5">
                <div>Lyrics layout: <span className="text-neutral-300">{stageLayoutFor(sel, { type: 'lyrics' }, local.stageLayouts).name}</span></div>
                <div>Scripture layout: <span className="text-neutral-300">{stageLayoutFor(sel, { type: 'scripture' }, local.stageLayouts).name}</span></div>
                <div>Background: <span className="text-neutral-300">{sel.backgroundColor}</span></div>
              </div>
            );
            return (
              <div className="text-[11px] text-neutral-500 leading-relaxed space-y-0.5 pt-1 border-t border-white/5">
                {sel.lyricsTemplateId && <div>Lyrics template: <span className="text-neutral-300">{getTemplateById(sel.lyricsTemplateId)?.name || sel.lyricsTemplateId}</span></div>}
                {sel.scriptureTemplateId && <div>Scripture template: <span className="text-neutral-300">{getTemplateById(sel.scriptureTemplateId)?.name || sel.scriptureTemplateId}</span></div>}
                <div>Background: <span className="text-neutral-300">{sel.backgroundColor}</span> · Transition: <span className="text-neutral-300">{sel.transition}</span> · Fit: <span className="text-neutral-300">{sel.mediaFit}</span></div>
              </div>
            );
          })()}
        </div>

        {/* TYPE-SPECIFIC: NDI® Settings */}
        {isNdi && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <Wifi size={16} />
              <span className="text-sm font-bold">NDI®</span>
            </div>

            <div className="bg-[#121214] border border-white/5 rounded-xl overflow-hidden">
              {/* Size & Frame Rate Row */}
              <div className="grid grid-cols-2 divide-x divide-white/5">
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block mb-1.5">Size</span>
                  <select 
                    value={activeOutput.ndiResolution || '1920x1080'} 
                    onChange={(e) => updateOutput(activeOutputId, { ndiResolution: e.target.value as any })}
                    className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer w-full"
                  >
                    <option value="1920x1080" className="bg-[#121214]">1920x1080</option>
                    <option value="1280x720" className="bg-[#121214]">1280x720</option>
                    <option value="3840x2160" className="bg-[#121214]">3840x2160</option>
                  </select>
                </div>
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block mb-1.5">Frame rate</span>
                  <select 
                    value={activeOutput.ndiFrameRate || 30} 
                    onChange={(e) => updateOutput(activeOutputId, { ndiFrameRate: parseInt(e.target.value) })}
                    className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer w-full"
                  >
                    <option value="30" className="bg-[#121214]">30 fps</option>
                    <option value="60" className="bg-[#121214]">60 fps</option>
                    <option value="25" className="bg-[#121214]">25 fps</option>
                    <option value="24" className="bg-[#121214]">24 fps</option>
                  </select>
                </div>
              </div>

              {/* Name & Group Row */}
              <div className="grid grid-cols-2 divide-x divide-white/5 border-t border-white/5">
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block mb-1.5">Name</span>
                  <input 
                    type="text" 
                    value={activeOutput.ndiStreamName || `FlowShow NDI - ${activeOutput.name}`}
                    onChange={(e) => updateOutput(activeOutputId, { ndiStreamName: e.target.value })}
                    className="bg-transparent text-white text-sm font-medium outline-none w-full"
                    placeholder="FlowShow NDI - NDI 1"
                  />
                </div>
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">Group</span>
                  <input 
                    type="text" 
                    value={activeOutput.ndiGroup || ''}
                    onChange={(e) => updateOutput(activeOutputId, { ndiGroup: e.target.value })}
                    className="bg-transparent text-white text-sm font-medium outline-none w-full"
                    placeholder="(default)"
                  />
                </div>
              </div>
            </div>

            {/* Transparent Toggle */}
            <div className="bg-[#121214] border border-white/5 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Transparent</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={activeOutput.ndiTransparent !== false} 
                    onChange={(e) => updateOutput(activeOutputId, { ndiTransparent: e.target.checked })}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <p className="text-xs text-neutral-500 mt-1.5">Enable 32-bit RGBA alpha channel for clean lower-thirds overlay in OBS/vMix</p>
            </div>
          </div>
        )}

        {/* TYPE-SPECIFIC: HDMI Settings */}
        {isHdmi && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <MonitorPlay size={16} />
              <span className="text-sm font-bold">HDMI / DisplayPort</span>
            </div>

            <div className="bg-[#121214] border border-white/5 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Target Display</span>
                <button onClick={detectScreens} className="text-xs bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white px-3 py-1.5 rounded-lg transition-all border border-white/10 font-medium">
                  Detect Screens
                </button>
              </div>
              <select 
                value={activeOutput.displayId || ''} 
                onChange={(e) => updateOutput(activeOutputId, { displayId: e.target.value })}
                className="bg-[#09090B] border border-white/10 rounded-lg text-sm px-3 py-2.5 text-white outline-none focus:border-blue-500 w-full"
              >
                <option value="">-- No Display Selected --</option>
                {detectedScreens.map((s, i) => (
                  <option key={s.label || i} value={s.label}>{s.label || `Display ${i + 1}`}</option>
                ))}
              </select>
              {detectedScreens.length > 0 && (
                <p className="text-[10px] text-emerald-400 mt-2">{detectedScreens.length} display(s) detected on this system</p>
              )}
              {!activeOutput.displayId && (
                <p className="text-[10px] text-orange-400 mt-2">You must select a display to go LIVE to {activeOutput.name}.</p>
              )}
            </div>
          </div>
        )}

        {/* Default Background and style overrides: audience screens only (a stage screen's look comes from its Stage style) */}
        {!isStage && <>
        <div className="bg-[#121214] border border-white/5 p-5 rounded-xl shadow-sm">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-3">Default Background</h3>
          <div className="flex flex-wrap items-center gap-3">
            <select 
              className="bg-[#09090B] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 font-medium min-w-[180px]" 
              value={activeOutput.defaultBackground ? activeOutput.defaultBackground.type : 'none'} 
              onChange={(e) => { 
                const val = e.target.value; 
                if (val === 'none') updateOutput(activeOutputId, { defaultBackground: null }); 
                else if (val === 'color') updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: '#0a0a0a' } }); 
                else if (val === 'image') updateOutput(activeOutputId, { defaultBackground: { type: 'image', url: '' } }); 
                else if (val === 'ndi') updateOutput(activeOutputId, { defaultBackground: { type: 'ndi', ndiSourceId: ndiSources[0]?.id || '', fileName: ndiSources[0]?.name || 'Live Camera Feed' } });
              }}
            >
              <option value="none">Transparent (None)</option>
              <option value="color">Solid Color</option>
              <option value="image">Media (Image / Video)</option>
              <option value="ndi">NDI Live Video Feed</option>
            </select>
            {activeOutput.defaultBackground?.type === 'color' && (
              <input type="color" value={activeOutput.defaultBackground.color || '#0a0a0a'} onChange={e => updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: e.target.value }})} className="h-9 w-14 cursor-pointer border-none bg-transparent" />
            )}
            {activeOutput.defaultBackground?.type === 'ndi' && (
              <div className="flex items-center gap-2 bg-[#09090B] px-3 py-2 rounded-lg border border-white/5 flex-1">
                <Radio size={14} className="text-red-400 animate-pulse shrink-0" />
                <select
                  value={activeOutput.defaultBackground.ndiSourceId || ''}
                  onChange={(e) => {
                    const found = ndiSources.find(s => s.id === e.target.value);
                    updateOutput(activeOutputId, {
                      defaultBackground: { type: 'ndi', ndiSourceId: e.target.value, fileName: found?.name || 'NDI Stream' }
                    });
                  }}
                  className="bg-transparent text-xs text-white font-medium outline-none flex-1 cursor-pointer"
                >
                  {ndiSources.map(src => (
                    <option key={src.id} value={src.id} className="bg-[#121214]">{src.name} ({src.ip})</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => { setIsScanningNdi(true); const found = await ndiService.scanNetworkSources(); setNdiSources([...found]); setIsScanningNdi(false); }}
                  disabled={isScanningNdi}
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-bold shrink-0"
                >
                  {isScanningNdi ? 'Scanning...' : 'Scan'}
                </button>
              </div>
            )}
            {(activeOutput.defaultBackground?.type === 'image' || activeOutput.defaultBackground?.type === 'video') && (
              <div className="flex items-center gap-3 bg-[#09090B] px-3 py-2 rounded-lg border border-white/5 flex-1">
                <label className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors shrink-0">Browse... <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" /></label>
                {activeOutput.defaultBackground.url ? (
                  <span className="text-xs text-neutral-300 truncate flex-1 font-mono">{activeOutput.defaultBackground.fileName || 'Local Media File'}</span>
                ) : ( <span className="text-xs text-red-400 italic">No media selected yet</span> )}
              </div>
            )}
          </div>
        </div>

        {/* Style Overrides */}
        <StyleConfigurator title="Override Lyrics Style" enabled={activeOutput.lyricsStyleEnabled} onToggle={(val: boolean) => updateOutput(activeOutputId, { lyricsStyleEnabled: val })} onEdit={() => setEditingStyleType('lyrics')} />
        <StyleConfigurator title="Override Bible Style" enabled={activeOutput.bibleStyleEnabled} onToggle={(val: boolean) => updateOutput(activeOutputId, { bibleStyleEnabled: val })} onEdit={() => setEditingStyleType('scripture')} />
        </>}
      </div>
    );
  };

  // Tabs marked hidden are kept for later; set hidden: false to bring one back.
  const SETTINGS_NAV = [
    { id: 'general', name: 'General', icon: Settings, hidden: true },
    { id: 'outputs', name: 'Outputs', icon: MonitorPlay },
    { id: 'style', name: 'Styles', icon: Sparkles },
    { id: 'audio', name: 'Audio', icon: Volume2, hidden: true },
    { id: 'connection', name: 'Connection', icon: Wifi, hidden: true },
    { id: 'files', name: 'Files', icon: FileText, hidden: true },
    { id: 'profiles', name: 'Profiles', icon: Layers, hidden: true },
    { id: 'theme', name: 'Theme', icon: LayoutTemplate, hidden: true },
    { id: 'smart', name: 'Smart', icon: Activity, hidden: true },
    { id: 'help', name: 'Help', icon: BookOpen }
  ].filter(item => !item.hidden);

  return (
    <>
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 lg:p-6 animate-in fade-in duration-200">
       <div className="bg-[#09090B] border border-white/10 rounded-2xl w-full max-w-6xl h-[88vh] flex overflow-hidden shadow-2xl">
          {/* LEFT SETTINGS SIDEBAR */}
          <div className="w-52 bg-[#030303] border-r border-white/5 p-4 flex flex-col gap-1 shrink-0">
             <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-4 px-3">Settings</div>
             {SETTINGS_NAV.map(item => {
               const Icon = item.icon;
               const isActive = activeTab === item.id;
               return (
                 <button
                   key={item.id}
                   onClick={() => setActiveTab(item.id)}
                   className={`text-left px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2.5 ${
                     isActive 
                       ? 'bg-blue-600/20 text-blue-400 shadow-sm' 
                       : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                   }`}
                 >
                   <Icon size={15} />
                   {item.name}
                 </button>
               );
             })}
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#09090B]">
             <div className="flex-1 overflow-y-auto p-6 lg:p-8 custom-scrollbar">
               {activeTab === 'outputs' && (
                  <div className="flex gap-6 h-full">
                     {/* Center Column: Config */}
                     <div className="flex-1 min-w-0 space-y-6">
                        <div className="flex items-center justify-between pb-2 border-b border-white/5">
                          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            Outputs
                            <span className="text-xs text-neutral-500 font-normal">({local.outputs.length} active)</span>
                          </h2>
                          <div className="flex items-center gap-2 text-neutral-500">
                            <button onClick={() => alert("FlowShow Output Engine: Supports multi-screen HDMI displays and low-latency network NDI streams with 32-bit alpha transparency.")} className="p-1 hover:text-white transition-colors" title="Output Information">
                              <span className="text-xs font-mono font-bold border border-white/20 rounded-full w-4 h-4 flex items-center justify-center">i</span>
                            </button>
                          </div>
                        </div>

                        {activeOutput ? renderOutputConfig() : (
                          <div className="text-center py-16 text-neutral-500">
                            <MonitorPlay size={40} className="mx-auto mb-3 text-neutral-600" />
                            <p className="text-sm">No outputs configured. Add one below.</p>
                          </div>
                        )}
                     </div>

                     {/* Right Column: Live Output Monitor Stack (Matches Image e) */}
                     <div className="w-64 xl:w-72 border-l border-white/5 pl-6 flex flex-col gap-3 shrink-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Live Outputs</span>
                          <span className="text-[10px] font-mono text-emerald-400 font-bold">MONITORS</span>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                          {local.outputs.map(out => {
                            const isSelected = activeOutputId === out.id;
                            const isNdi = out.outputType === 'ndi';
                            const isTransparent = isNdi && out.ndiTransparent !== false;

                            return (
                              <div
                                key={out.id}
                                onClick={() => setActiveOutputId(out.id)}
                                className={`rounded-xl border transition-all cursor-pointer p-2 ${
                                  isSelected 
                                    ? 'border-blue-500 bg-blue-600/10' 
                                    : 'border-white/10 bg-[#030303] hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5 px-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <div className={`w-2 h-2 rounded-full ${out.enabled ? (isNdi ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400') : 'bg-neutral-600'}`} />
                                    <span className="text-xs font-bold text-white truncate">{out.name}</span>
                                  </div>
                                  <span className="flex items-center gap-1 shrink-0">
                                    {isStageOutput(out) && <span className="text-[9px] font-bold uppercase px-1 rounded bg-amber-500/15 text-amber-400">Stage</span>}
                                    <span className="text-[9px] font-mono uppercase px-1 rounded bg-white/5 text-neutral-400">
                                      {isNdi ? 'NDI' : 'HDMI'}
                                    </span>
                                  </span>
                                </div>

                                <div 
                                  className="aspect-video w-full rounded-lg border border-white/5 overflow-hidden relative flex items-center justify-center"
                                  style={isTransparent ? {
                                    backgroundImage: 'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
                                    backgroundSize: '12px 12px',
                                    backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                                    backgroundColor: '#09090b'
                                  } : { backgroundColor: '#000000' }}
                                >
                                  {isTransparent ? (
                                    <div className="text-center z-10 select-none">
                                      <Wifi size={16} className="text-emerald-400 mx-auto mb-0.5" />
                                      <span className="text-[9px] font-mono text-white/70 block">32-bit RGBA</span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-mono text-neutral-600 uppercase">Screen Off</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Transport / Monitor Toolbar */}
                        <div className="pt-2 border-t border-white/5 flex items-center justify-around text-neutral-400 text-xs">
                          <button onClick={() => alert("Previous Output")} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Previous"><ChevronLeft size={14} /></button>
                          <button onClick={() => alert("Next Output")} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Next"><ChevronRight size={14} /></button>
                          <button onClick={() => onTogglePresenting?.()} className={`p-1.5 rounded hover:bg-white/5 transition-colors ${isPresenting ? 'text-red-400' : 'text-blue-400'}`} title="Play / Go Live"><Play size={14} /></button>
                          <button onClick={() => onToggleLockOutput?.(activeOutputId)} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Lock Screen"><Lock size={14} /></button>
                        </div>
                     </div>
                  </div>
               )}
               {activeTab === 'help' && (
                  <div>
                     <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">Help & Documentation</h2>
                     <p className="text-neutral-400 leading-relaxed text-sm">Documentation and shortcut keys are coming soon.</p>
                  </div>
               )}
               {activeTab === 'style' && (
                  <StylesManager
                    styles={local.styles}
                    stageLayouts={local.stageLayouts || []}
                    templates={allTemplates}
                    onReloadTemplates={() => getStoredTemplates().then(setAllTemplates)}
                    onAdd={(kind) => {
                      const base: PresentationStyle = {
                        id: `style-${Date.now()}`,
                        name: 'New Style',
                        kind,
                        backgroundColor: '#000000',
                        transition: 'fade',
                        mediaFit: 'contain',
                        aspectRatio: '16:9',
                        activeLayers: { background: true, slide: true, overlays: true },
                      };
                      const newStyle: PresentationStyle = kind === 'stage'
                        ? { ...base, name: 'New Stage Style', transition: 'none', lyricsStageLayoutId: DEFAULT_LYRICS_STAGE_LAYOUT, scriptureStageLayoutId: DEFAULT_SCRIPTURE_STAGE_LAYOUT }
                        : base;
                      commitStyleChange(prev => ({ ...prev, styles: [...prev.styles, newStyle] }));
                      return newStyle.id;
                    }}
                    onUpdate={(updated) => commitStyleChange(prev => ({
                      ...prev,
                      styles: prev.styles.map(s => s.id === updated.id ? updated : s)
                    }))}
                    onDelete={(id) => commitStyleChange(prev => ({
                      ...prev,
                      styles: prev.styles.filter(s => s.id !== id),
                      outputs: prev.outputs.map(o => o.styleId === id ? { ...o, styleId: undefined } : o)
                    }))}
                  />
               )}
               {activeTab !== 'outputs' && activeTab !== 'style' && activeTab !== 'help' && (
                  <div className="py-12 text-center text-neutral-500">
                     <p className="text-base font-semibold text-neutral-400 capitalize">{activeTab} Settings</p>
                     <p className="text-xs text-neutral-500 mt-1">Options and preferences for {activeTab} will appear here.</p>
                  </div>
               )}
             </div>

             {/* BOTTOM OUTPUT TABS (Matches Image c, d, e) */}
             {activeTab === 'outputs' && (
               <div className="border-t border-white/5 bg-[#030303] flex items-center justify-between px-3 h-11 shrink-0 overflow-x-auto custom-scrollbar">
                 <div className="flex items-center gap-1">
                   {local.outputs.map(out => {
                     const isActive = activeOutputId === out.id;
                     const isNdi = out.outputType === 'ndi';
                     return (
                       <button 
                         key={out.id}
                         onClick={() => setActiveOutputId(out.id)}
                         className={`group px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all relative
                           ${isActive 
                             ? 'bg-[#121214] text-white border border-blue-500/50 shadow-sm' 
                             : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5 border border-transparent'
                           }`}
                       >
                         {/* Checkmark icon as shown in Image c & e */}
                         <Check size={12} className={out.enabled ? (isNdi ? 'text-emerald-400' : 'text-blue-400') : 'text-neutral-600'} />
                         <span className="truncate">{out.name}</span>
                         {isStageOutput(out) && <Tv size={10} className="text-amber-400 shrink-0" />}
                         {isNdi && <Wifi size={10} className="text-neutral-500 shrink-0" />}
                         {local.outputs.length > 1 && (
                           <span
                             role="button"
                             onClick={(e) => { e.stopPropagation(); removeOutput(out.id); }}
                             className="ml-1 opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-all shrink-0"
                             title="Remove output"
                           >
                             <X size={12} />
                           </span>
                         )}
                       </button>
                     );
                   })}
                   <button
                     onClick={() => setShowNewOutputModal(true)}
                     className="px-3 py-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-600/10 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ml-1 shrink-0"
                   >
                     <Plus size={14} />
                     New output
                   </button>
                 </div>

                 {/* Output selector button (Right side of bottom bar, from Image e) */}
                 <button
                   onClick={() => detectScreens()}
                   className="text-neutral-400 hover:text-white px-3 py-1 text-xs font-medium flex items-center gap-1.5 rounded hover:bg-white/5 transition-colors shrink-0"
                 >
                   <MonitorPlay size={13} />
                   Output selector
                 </button>
               </div>
             )}

             <div className="p-4 border-t border-white/5 bg-[#030303] flex justify-end gap-3 shrink-0">
                <button onClick={onClose} className="px-5 py-2 hover:bg-white/5 text-neutral-300 transition-colors rounded-lg text-xs font-medium">Cancel</button>
                <button onClick={() => { onSave(local); onClose(); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2 shadow-lg"><Save size={14} /> Save Settings</button>
             </div>
          </div>
       </div>
    </div>

    {/* MODAL: New output — what it's for, then how it connects */}
    {showNewOutputModal && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
        <div className="bg-[#121214] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
          <div className="p-6 flex items-center justify-between border-b border-white/5">
            <h3 className="text-lg font-bold text-white">New output</h3>
            <button onClick={closeNewOutputModal} className="text-neutral-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Who the screen is for */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 block">What is it for?</span>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['normal', 'Normal', 'For the audience: lyrics and scripture in your templates and designs', MonitorPlay],
                  ['stage', 'Stage', 'For the people on stage: current and next slide, section name and time', Tv],
                ] as const).map(([kind, title, text, Icon]) => (
                  <button
                    key={kind}
                    onClick={() => setSelectedNewOutputKind(kind)}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 text-center transition-all ${
                      selectedNewOutputKind === kind
                        ? 'border-blue-500 bg-blue-600/10 text-white'
                        : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <Icon size={28} className={selectedNewOutputKind === kind ? 'text-blue-400' : ''} />
                    <span className="font-bold text-sm">{title}</span>
                    <span className="text-[11px] text-neutral-500 leading-snug">{text}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Local Output */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 block">Local output</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedNewOutputType('hdmi')}
                  className={`p-6 rounded-xl border-2 flex flex-col items-center gap-3 transition-all ${
                    selectedNewOutputType === 'hdmi' 
                      ? 'border-blue-500 bg-blue-600/10 text-white' 
                      : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <MonitorPlay size={36} className={selectedNewOutputType === 'hdmi' ? 'text-blue-400' : ''} />
                  <div className="text-center">
                    <span className="font-bold text-sm block">Window</span>
                    <span className="text-[11px] text-neutral-500">HDMI, DisplayPort</span>
                  </div>
                </button>
                {/* Placeholder for future Blackmagic - not clickable */}
                <div className="p-6 rounded-xl border-2 border-white/5 bg-[#09090B]/50 flex flex-col items-center gap-3 opacity-30 cursor-not-allowed">
                  <Layers size={36} />
                  <div className="text-center">
                    <span className="font-bold text-sm block text-neutral-500">Blackmagic Design</span>
                    <span className="text-[11px] text-neutral-600">Coming Soon</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Network Output */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 block">Network output</span>
              <div className="grid grid-cols-4 gap-2.5">
                <button
                  onClick={() => setSelectedNewOutputType('ndi')}
                  className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                    selectedNewOutputType === 'ndi' 
                      ? 'border-blue-500 bg-blue-600/10 text-white' 
                      : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <Wifi size={24} className={selectedNewOutputType === 'ndi' ? 'text-blue-400' : ''} />
                  <div className="text-center">
                    <span className="font-bold text-xs block">NDI®</span>
                    <span className="text-[9px] text-neutral-500">IP, OBS</span>
                  </div>
                </button>
                <div className="p-4 rounded-xl border-2 border-white/5 bg-[#09090B]/50 flex flex-col items-center gap-2 opacity-30 cursor-not-allowed">
                  <Layers size={24} />
                  <div className="text-center">
                    <span className="font-bold text-xs block text-neutral-500">OMT</span>
                    <span className="text-[9px] text-neutral-600">IP</span>
                  </div>
                </div>
                <div className="p-4 rounded-xl border-2 border-white/5 bg-[#09090B]/50 flex flex-col items-center gap-2 opacity-30 cursor-not-allowed">
                  <Radio size={24} />
                  <div className="text-center">
                    <span className="font-bold text-xs block text-neutral-500">WebRTC</span>
                    <span className="text-[9px] text-neutral-600">WHIP</span>
                  </div>
                </div>
                <div className="p-4 rounded-xl border-2 border-white/5 bg-[#09090B]/50 flex flex-col items-center gap-2 opacity-30 cursor-not-allowed">
                  <Tv size={24} />
                  <div className="text-center">
                    <span className="font-bold text-xs block text-neutral-500">RTMP</span>
                    <span className="text-[9px] text-neutral-600">YouTube, Twitch</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-white/5 bg-[#09090B]">
            <button
              onClick={() => { if (selectedNewOutputType && selectedNewOutputKind) addNewOutput(selectedNewOutputType, selectedNewOutputKind); }}
              disabled={!selectedNewOutputType || !selectedNewOutputKind}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 text-white font-bold text-sm rounded-xl transition-all shadow-lg"
              title={!selectedNewOutputKind ? 'Choose Normal or Stage first' : !selectedNewOutputType ? 'Choose how it connects' : undefined}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    )}

    {selectingTemplateForOutput && (
       <TemplateGalleryModal
         isOpen={true}
         onClose={() => setSelectingTemplateForOutput(null)}
         mode="select-for-output"
         targetOutputName={selectingTemplateForOutput.name}
         targetOutputId={selectingTemplateForOutput.id}
         activeTemplateId={selectingTemplateForOutput.defaultTemplateId}
         onApplyToOutput={(template, outId) => {
           const targetId = outId || selectingTemplateForOutput.id;
           updateOutput(targetId, { defaultTemplateId: template.id });
           setSelectingTemplateForOutput(null);
         }}
       />
    )}
    
    {editingStyleType && activeOutput && (
       <OutputStyleEditor
          type={editingStyleType}
          outputName={activeOutput.name}
          initialStyle={
             (() => {
                const raw = editingStyleType === 'lyrics' ? activeOutput.lyricsStyle : activeOutput.bibleStyle;
                if (!raw) return { global: {} };
                if ('global' in raw || 'layout' in raw) return raw as OutputStyleConfig;
                return { global: raw as React.CSSProperties };
             })()
          }
          onSave={(newStyle: OutputStyleConfig) => {
             if (editingStyleType === 'lyrics') {
                updateOutput(activeOutputId, { lyricsStyle: newStyle as any });
             } else {
                updateOutput(activeOutputId, { bibleStyle: newStyle as any });
             }
             setEditingStyleType(null);
          }}
          onCancel={() => setEditingStyleType(null)}
       />
    )}
    </>
  );
}

/** The look given to a whole song section; slides tagged with the group later pick it up too */
export interface GroupLook {
  templateId?: string;
  outputTemplates?: { [outputId: string]: string };
  designs?: { [outputId: string]: SlideDesign };
}

export interface PresentationItem {
  id: string;
  title: string;
  category?: 'Presentations' | 'Songs';
  createdAt?: string;
  modifiedAt?: string;
  usedAt?: string;
  slides: SlideDefinition[];
  /** Looks assigned to sections of this song, by group name */
  groupLooks?: { [group: string]: GroupLook };
}

const MOCK_SONGS: PresentationItem[] = [
  {
    id: 'show-welcome',
    title: 'Welcome',
    category: 'Presentations',
    createdAt: 'Wednesday 18. November, 2026',
    modifiedAt: 'Wednesday 18. November, 2026',
    usedAt: 'Wednesday 18. November, 2026',
    slides: [
      { id: 'sw-1', text: 'Welcome!', type: 'lyrics' }
    ]
  },
  {
    id: 'song1',
    title: 'Amazing Grace',
    category: 'Songs',
    createdAt: 'Sunday 15. November, 2026',
    modifiedAt: 'Wednesday 18. November, 2026',
    usedAt: 'Wednesday 18. November, 2026',
    slides: [
      { id: 's1-1', text: 'Amazing grace! How sweet the sound\nThat saved a wretch like me', type: 'lyrics' },
      { id: 's1-3', text: 'I once was lost, but now am found\nWas blind, but now I see.', type: 'lyrics' },
    ]
  },
  {
    id: 'song2',
    title: 'How Great Thou Art',
    category: 'Songs',
    createdAt: 'Sunday 8. November, 2026',
    modifiedAt: 'Wednesday 18. November, 2026',
    usedAt: 'Sunday 15. November, 2026',
    slides: [
      { id: 's2-1', text: 'O Lord my God, When I in awesome wonder\nConsider all the worlds Thy Hands have made', type: 'lyrics' },
      { id: 's2-3', text: 'I see the stars, I hear the rolling thunder\nThy power throughout the universe displayed', type: 'lyrics' },
    ]
  }
];

function ControlPanel() {
  const [appMode, setAppMode] = useState<'show' | 'design' | 'stage'>('show');
  const [designOutputId, setDesignOutputId] = useState('main');
  // Slide picked in the Design strip; null = follow the slide that's on air
  const [designSlideId, setDesignSlideId] = useState<string | null>(null);
  // Right-click menu on a group in the Arrangement Groups panel
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number; songId: string; group: string } | null>(null);
  // Stage output shown in the Stage tab (null = the first one)
  const [stageOutputId, setStageOutputId] = useState<string | null>(null);
  // Open Design mode on a slide, or (null) on whatever slide is on air
  const openDesign = (slideId: string | null = null) => {
    setDesignSlideId(slideId);
    setAppMode('design');
  };
  const [activeTab, setActiveTab] = useState<'shows' | 'songs' | 'setlist' | 'bibles' | 'media' | 'audio'>('songs');
  const [bottomTab, setBottomTab] = useState<'shows' | 'media' | 'audio' | 'overlays' | 'templates' | 'scripture' | 'calendar' | 'functions'>('shows');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Presentations' | 'Songs'>('all');
  const [rightInspectorTab, setRightInspectorTab] = useState<'groups' | 'metadata'>('groups');
  const [selectedProjectFolder, setSelectedProjectFolder] = useState<string>('11/18/26');

  // Inline template grid
  const [inlineTemplates, setInlineTemplates] = useState<PresentationTemplate[]>(STARTER_TEMPLATES);
  useEffect(() => { getStoredTemplates().then(setInlineTemplates); }, []);
  // Live template edits (this window or others) re-render previews and outputs immediately
  useEffect(() => subscribeTemplates(() => setInlineTemplates([...getCachedTemplates()])), []);
  const [inlineTemplateCategory, setInlineTemplateCategory] = useState<string>('all');

  // Resizable bottom panel
  const [bottomPanelHeight, setBottomPanelHeight] = useState(280);
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(false);
  const bottomDragRef = useRef<{ startY: number; startH: number } | null>(null);

  // Design mode folds the bottom panel away for the biggest canvas, and restores it on leaving
  const panelStateBeforeDesign = useRef<boolean | null>(null);
  useEffect(() => {
    if (appMode === 'design') {
      if (panelStateBeforeDesign.current === null) {
        panelStateBeforeDesign.current = bottomPanelCollapsed;
        setBottomPanelCollapsed(true);
      }
    } else if (panelStateBeforeDesign.current !== null) {
      setBottomPanelCollapsed(panelStateBeforeDesign.current);
      panelStateBeforeDesign.current = null;
    }
  }, [appMode]);

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomPanelHeight;
    bottomDragRef.current = { startY, startH };
    let dragged = false;

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY; // drag up → bigger
      if (Math.abs(delta) > 3) dragged = true;
      const next = Math.max(120, Math.min(600, startH + delta));
      setBottomPanelHeight(next);
      if (bottomPanelCollapsed && delta > 20) setBottomPanelCollapsed(false);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // If barely moved, treat as a click → toggle collapse
      if (!dragged) setBottomPanelCollapsed(c => !c);
      bottomDragRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [serviceSetlist, setServiceSetlist] = useState<ServiceSetlist>(DEFAULT_SAMPLE_SETLIST);
  const [activeSetlistItemId, setActiveSetlistItemId] = useState<string | null>(null);
  const [setlistViewMode, setSetlistViewMode] = useState<'slides' | 'manager'>('slides');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
  const [songsList, setSongsList] = useState(MOCK_SONGS);
  const [songSearchQuery, setSongSearchQuery] = useState('');
  
  const [previewSlide, setPreviewSlide] = useState<SlideDefinition | null>(null);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  const handleNextSlide = () => {
    const currentSong = songsList[activeItemIndex];
    if (!currentSong || !currentSong.slides || currentSong.slides.length === 0) return;
    const currentSlideId = previewSlide?.id || liveState.slide?.id;
    const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
    if (currentIndex >= 0 && currentIndex < currentSong.slides.length - 1) {
      const nextSlide = currentSong.slides[currentIndex + 1];
      setPreviewSlide(nextSlide);
      goLive(nextSlide);
    } else if (currentIndex === -1 && currentSong.slides.length > 0) {
      setPreviewSlide(currentSong.slides[0]);
      goLive(currentSong.slides[0]);
    }
  };

  const handlePrevSlide = () => {
    const currentSong = songsList[activeItemIndex];
    if (!currentSong || !currentSong.slides || currentSong.slides.length === 0) return;
    const currentSlideId = previewSlide?.id || liveState.slide?.id;
    const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
    if (currentIndex > 0) {
      const prevSlide = currentSong.slides[currentIndex - 1];
      setPreviewSlide(prevSlide);
      goLive(prevSlide);
    }
  };

  useEffect(() => {
    loadCurrentSetlist().then(sl => {
      if (sl && sl.items && sl.items.length > 0) {
        setServiceSetlist(sl);
        const firstPlayable = sl.items.find(i => i.type !== 'header');
        if (firstPlayable) setActiveSetlistItemId(firstPlayable.id);
      }
    });
  }, []);

  const handleUpdateSetlist = (newSetlist: ServiceSetlist) => {
    setServiceSetlist(newSetlist);
    saveCurrentSetlist(newSetlist);
  };

  const handleAddSongToSetlist = (song: typeof songsList[0]) => {
    const newItem: SetlistItem = {
      id: `setlist-song-${Date.now()}`,
      type: 'song',
      title: song.title,
      subtitle: `${song.slides.length} Slides`,
      songId: song.id,
      slides: song.slides
    };
    const updated = {
      ...serviceSetlist,
      items: [...serviceSetlist.items, newItem]
    };
    handleUpdateSetlist(updated);
  };

  // Don't write settings until the saved copy has loaded, or the defaults overwrite it
  // (StrictMode runs effects twice, so a second read can otherwise see the defaults).
  const settingsLoadedRef = useRef(false);

  useEffect(() => {
    get('globalSettings').then((val: any) => {
        settingsLoadedRef.current = true;
        if (val) {
            // Merge default outputs with saved settings
            const mergedOutputs = DEFAULT_SETTINGS.outputs.map(defOut => {
                const savedOut = val.outputs?.find((o: any) => o.id === defOut.id);
                if (savedOut) {
                    return { 
                        ...defOut, 
                        ...savedOut, 
                        outputType: savedOut.outputType || defOut.outputType || 'hdmi',
                        enabled: savedOut.enabled !== undefined ? savedOut.enabled : defOut.enabled,
                        lyricsStyle: { ...(defOut.lyricsStyle as any), ...(savedOut.lyricsStyle as any) },
                        bibleStyle: { ...(defOut.bibleStyle as any), ...(savedOut.bibleStyle as any) }
                    };
                }
                return defOut;
            });
            // Also include any dynamically added outputs (ndi, extra hdmi) not in defaults
            const extraOutputs = (val.outputs || []).filter((o: any) => !DEFAULT_SETTINGS.outputs.find(d => d.id === o.id));
            const allOutputs = [...mergedOutputs, ...extraOutputs.map((o: any) => ({ ...o, outputType: o.outputType || 'hdmi' }))];
            // Merge saved styles with defaults (add any new default styles not already in saved)
            const savedStyles: PresentationStyle[] = val.styles || [];
            const mergedStyles = DEFAULT_STYLES.map(def => savedStyles.find(s => s.id === def.id) || def);
            const extraStyles = savedStyles.filter(s => !DEFAULT_STYLES.find(d => d.id === s.id));
            setGlobalSettings({ ...DEFAULT_SETTINGS, ...val, outputs: allOutputs, styles: [...mergedStyles, ...extraStyles] });
        } else {
            setGlobalSettings(prev => ({ ...prev }));
        }
    });
    get('songsList').then((val) => {
      if (val) {
        skipNextUndoRecordRef.current = true; // loading isn't an edit
        setSongsList(val);
      }
      songsLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (settingsLoadedRef.current) set('globalSettings', globalSettings).catch(()=>{});
    setLiveState(prev => ({ ...prev, settings: globalSettings }));
    ndiService.syncWithOutputs(globalSettings.outputs);
  }, [globalSettings]);

  // Save songs shortly after the last change (edits can come in quick bursts), and flush on close.
  // Nothing is saved until the stored songs have loaded, so the sample songs never overwrite them.
  const songsLoadedRef = useRef(false);
  const latestSongsRef = useRef(songsList);
  latestSongsRef.current = songsList;
  useEffect(() => {
    if (!songsLoadedRef.current) return;
    const t = setTimeout(() => { set('songsList', songsList).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [songsList]);
  useEffect(() => {
    const flush = () => { if (songsLoadedRef.current) set('songsList', latestSongsRef.current).catch(() => {}); };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  // ─── Undo / redo for song and slide changes (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z) ───
  // Every change to the songs keeps the version before it; changes in quick succession count as one step.
  const undoStackRef = useRef<{ past: (typeof songsList)[]; future: (typeof songsList)[] }>({ past: [], future: [] });
  const recordedSongsRef = useRef(songsList);
  const lastSongChangeAtRef = useRef(0);
  const skipNextUndoRecordRef = useRef(false);
  // Short message at the bottom of the screen (undo/redo, or 'info' for other changes Ctrl+Z can undo)
  const [undoToast, setUndoToast] = useState<{ text: string; at: number; kind?: 'info' } | null>(null);

  useEffect(() => {
    const before = recordedSongsRef.current;
    recordedSongsRef.current = songsList;
    if (skipNextUndoRecordRef.current) { skipNextUndoRecordRef.current = false; return; }
    if (!songsLoadedRef.current || before === songsList) return;
    const stack = undoStackRef.current;
    const now = Date.now();
    if (stack.past.length === 0 || now - lastSongChangeAtRef.current > UNDO_MERGE_MS) {
      stack.past.push(before);
      if (stack.past.length > UNDO_LIMIT) stack.past.shift();
    }
    lastSongChangeAtRef.current = now;
    stack.future = [];
  }, [songsList]);

  useEffect(() => {
    if (!undoToast) return;
    const t = setTimeout(() => setUndoToast(null), undoToast.kind === 'info' ? 3200 : 1400);
    return () => clearTimeout(t);
  }, [undoToast]);

  const restoreSongs = (list: typeof songsList) => {
    skipNextUndoRecordRef.current = true;
    lastSongChangeAtRef.current = 0;
    setSongsList(list);
    // The live and preview slides are copies, so bring them back in line too (the screens follow)
    const byId = new Map<string, SlideDefinition>();
    list.forEach(song => song.slides.forEach(s => byId.set(s.id, s)));
    setLiveState(prev => prev.slide && byId.has(prev.slide.id) ? { ...prev, slide: byId.get(prev.slide.id)! } : prev);
    setPreviewSlide(prev => prev && byId.has(prev.id) ? byId.get(prev.id)! : prev);
  };
  const undoSongChange = () => {
    const stack = undoStackRef.current;
    const previous = stack.past.pop();
    if (!previous) { setUndoToast({ text: 'Nothing to undo', at: Date.now() }); return; }
    stack.future.push(latestSongsRef.current);
    restoreSongs(previous);
    setUndoToast({ text: 'Undone', at: Date.now() });
  };
  const redoSongChange = () => {
    const stack = undoStackRef.current;
    const next = stack.future.pop();
    if (!next) { setUndoToast({ text: 'Nothing to redo', at: Date.now() }); return; }
    stack.past.push(latestSongsRef.current);
    restoreSongs(next);
    setUndoToast({ text: 'Redone', at: Date.now() });
  };
  const undoActionsRef = useRef({ undo: undoSongChange, redo: redoSongChange, allowed: () => true });
  // The Stage tab undoes its own layout edits
  undoActionsRef.current = { undo: undoSongChange, redo: redoSongChange, allowed: () => appMode !== 'stage' };

  useEffect(() => {
    const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'reset', 'file']);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
      if (!isUndo && !isRedo) return;
      // While typing in a text box, Ctrl+Z undoes the typing there instead
      const el = e.target as HTMLElement | null;
      const typing = el instanceof HTMLTextAreaElement || !!el?.isContentEditable
        || (el instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(el.type));
      if (typing || !undoActionsRef.current.allowed()) return;
      e.preventDefault();
      if (isUndo) undoActionsRef.current.undo(); else undoActionsRef.current.redo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'song'|'bible'|'slide', id: string | number } | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // --- BIBLE STATE ---
  const [bibleList, setBibleList] = useState<{id: string, name: string}[]>([]);
  const [activeBibleId, setActiveBibleId] = useState<string | null>(null);
  const [activeBibleData, setActiveBibleData] = useState<BibleVersion | null>(null);
  
  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  const [bibleKeywordQuery, setBibleKeywordQuery] = useState('');
  const [bibleKeywordResults, setBibleKeywordResults] = useState<SlideDefinition[]>([]);
  const [bibleHistory, setBibleHistory] = useState<SlideDefinition[]>([]);
  const [showBibleHistory, setShowBibleHistory] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [activeBibleBookIndex, setActiveBibleBookIndex] = useState<number | null>(null);
  const [activeBibleChapterIndex, setActiveBibleChapterIndex] = useState<number | null>(null);
  const [activeBibleVerseIndex, setActiveBibleVerseIndex] = useState<number | null>(null);
  
  const bIndexRef = useRef(activeBibleBookIndex);
  const cIndexRef = useRef(activeBibleChapterIndex);
  const vIndexRef = useRef(activeBibleVerseIndex);
  const verseListRef = useRef<HTMLDivElement>(null);
  const bookListRef = useRef<HTMLDivElement>(null);
  const chapterListRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bIndexRef.current = activeBibleBookIndex; }, [activeBibleBookIndex]);
  useEffect(() => { cIndexRef.current = activeBibleChapterIndex; }, [activeBibleChapterIndex]);
  useEffect(() => { vIndexRef.current = activeBibleVerseIndex; }, [activeBibleVerseIndex]);

  // SMART AUTO-SCROLL HOOKS
  const isShowingThreeColumns = !bibleSearchQuery && !bibleKeywordQuery && !showBibleHistory;

  useEffect(() => {
      if (activeBibleBookIndex !== null && isShowingThreeColumns) {
          setTimeout(() => {
              if (bookListRef.current) {
                  const el = bookListRef.current.children[activeBibleBookIndex] as HTMLElement;
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
          }, 20);
      }
  }, [activeBibleBookIndex, isShowingThreeColumns]);

  useEffect(() => {
      if (activeBibleChapterIndex !== null && isShowingThreeColumns) {
          setTimeout(() => {
              if (chapterListRef.current) {
                  const el = chapterListRef.current.children[activeBibleChapterIndex] as HTMLElement;
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
          }, 20);
      }
  }, [activeBibleChapterIndex, isShowingThreeColumns]);

  useEffect(() => {
      if (activeBibleVerseIndex !== null && isShowingThreeColumns) {
          setTimeout(() => {
              if (verseListRef.current) {
                  const el = verseListRef.current.children[activeBibleVerseIndex] as HTMLElement;
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
          }, 20);
      }
  }, [activeBibleVerseIndex, isShowingThreeColumns]);


  const [isAddSongModalOpen, setIsAddSongModalOpen] = useState(false);
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
  const [draggedSlideIndex, setDraggedSlideIndex] = useState<number | null>(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState<number | null>(null);
  
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null, globalBackground: null, clearText: false, settings: globalSettings, isPresenting: false, clearedOutputs: {}, lockedOutputs: {}, frozenStates: {}
  });

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  const togglePresenting = () => setLiveState(prev => ({ ...prev, isPresenting: !prev.isPresenting }));

  const toggleClearOutput = (outputId: string) => {
    setLiveState(prev => ({
        ...prev,
        clearedOutputs: { ...prev.clearedOutputs, [outputId]: !prev.clearedOutputs?.[outputId] }
    }));
  };

  const toggleLockOutput = (outputId: string) => {
    setLiveState(prev => {
        const isCurrentlyLocked = !!prev.lockedOutputs?.[outputId];
        if (isCurrentlyLocked) {
            const newLocked = { ...prev.lockedOutputs };
            delete newLocked[outputId];
            const newFrozen = { ...prev.frozenStates };
            delete newFrozen[outputId];
            return { ...prev, lockedOutputs: newLocked, frozenStates: newFrozen };
        } else {
            const outputConfig = prev.settings?.outputs.find(o => o.id === outputId);
            let currentActiveBg = outputConfig?.defaultBackground;
            if (outputId === 'main' && prev.globalBackground) {
                currentActiveBg = prev.globalBackground;
            }
            return {
                ...prev,
                lockedOutputs: { ...prev.lockedOutputs, [outputId]: true },
                frozenStates: {
                    ...prev.frozenStates,
                    [outputId]: { slide: prev.slide, bg: currentActiveBg, clearText: prev.clearText }
                }
            };
        }
    });
  };

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => setVideoCurrentTime(video.currentTime);
    const handleDurationChange = () => setVideoDuration(video.duration);
    const handlePlay = () => setIsVideoPlaying(true);
    const handlePause = () => setIsVideoPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [liveState.globalBackground, liveState.settings, activeTab]); 

  // Global Video Controls (Synchronizes Preview and Program monitors)
  const broadcastVideoCommand = (command: string, value?: any) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'VIDEO_CMD', command, value });
    channel.close();
  };

  const togglePlay = () => {
    const nextState = !isVideoPlaying;
    setIsVideoPlaying(nextState);
    
    // Control all local preview videos globally
    document.querySelectorAll<HTMLVideoElement>('.bg-video-player').forEach(v => {
       if (nextState) v.play().catch(()=>{});
       else v.pause();
    });

    broadcastVideoCommand(nextState ? 'play' : 'pause');
  };

  const toggleMute = () => {
    const nextState = !isVideoMuted;
    setIsVideoMuted(nextState);
    broadcastVideoCommand('mute', nextState);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setVideoCurrentTime(time);
    
    document.querySelectorAll<HTMLVideoElement>('.bg-video-player').forEach(v => {
        v.currentTime = time;
    });

    broadcastVideoCommand('seek', time);
  };

  const pushToBibleHistory = (slide: SlideDefinition) => {
     if (slide.type !== 'scripture') return;
     setBibleHistory(prev => {
        const filtered = prev.filter(s => s.id !== slide.id);
        return [slide, ...filtered].slice(0, 50);
     });
  };

  // Keyboard Navigation Support & Live Production Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      // Global Production Hotkeys
      if (e.key === 'F1' || ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        togglePresenting();
        return;
      }
      if (e.key === 'F2' || ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        toggleClearText();
        return;
      }
      if (e.key === 'F3' || ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        setGlobalBackground(null);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearAll();
        return;
      }

      // FORWARD PROGRESSION (Space, PageDown, ArrowDown, ArrowRight)
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
         e.preventDefault();

         if (activeTab === 'setlist') {
            const currentItem = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
            if (currentItem && currentItem.slides && currentItem.slides.length > 0) {
               const currentSlideId = previewSlide?.id || liveState.slide?.id;
               const currentIndex = currentItem.slides.findIndex(s => s.id === currentSlideId);

               if (currentIndex >= 0 && currentIndex < currentItem.slides.length - 1) {
                  const nextSlide = currentItem.slides[currentIndex + 1];
                  setPreviewSlide(nextSlide);
                  goLive(nextSlide);
               } else if (currentIndex === -1) {
                  const firstSlide = currentItem.slides[0];
                  setPreviewSlide(firstSlide);
                  goLive(firstSlide);
               } else {
                  // CONTINUOUS SETLIST PROGRESSION: Move to the next playable item in the service queue!
                  const currentItemIdx = serviceSetlist.items.findIndex(i => i.id === activeSetlistItemId);
                  if (currentItemIdx !== -1) {
                     for (let nextI = currentItemIdx + 1; nextI < serviceSetlist.items.length; nextI++) {
                        const nextItem = serviceSetlist.items[nextI];
                        if (nextItem.type !== 'header' && nextItem.slides && nextItem.slides.length > 0) {
                           setActiveSetlistItemId(nextItem.id);
                           const firstSlide = nextItem.slides[0];
                           setPreviewSlide(firstSlide);
                           goLive(firstSlide);
                           break;
                        }
                     }
                  }
               }
            }
         } else if (activeTab === 'songs') {
            const currentSong = songsList[activeItemIndex];
            if (!currentSong) return;
            const currentSlideId = previewSlide?.id || liveState.slide?.id;
            const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
            if (currentIndex >= 0 && currentIndex < currentSong.slides.length - 1) {
               const nextSlide = currentSong.slides[currentIndex + 1];
               setPreviewSlide(nextSlide);
               goLive(nextSlide);
            } else if (currentIndex === -1 && currentSong.slides.length > 0) {
               setPreviewSlide(currentSong.slides[0]);
               goLive(currentSong.slides[0]);
            }
         } else if (activeTab === 'bibles' && isShowingThreeColumns) {
            if (!activeBibleData || activeBibleBookIndex === null || activeBibleChapterIndex === null) return;
            const verses = activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].verses;
            const currentIdx = activeBibleVerseIndex ?? -1;
            if (currentIdx < verses.length - 1) {
               const nextIdx = currentIdx + 1;
               setActiveBibleVerseIndex(nextIdx);
               const v = verses[nextIdx];
               const b = activeBibleData.books[activeBibleBookIndex];
               const c = b.chapters[activeBibleChapterIndex];
               const slide: SlideDefinition = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' };
               setPreviewSlide(slide);
               pushToBibleHistory(slide);
               if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
            }
         }
      } 
      // BACKWARD PROGRESSION (PageUp, ArrowLeft, ArrowUp)
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
         e.preventDefault();

         if (activeTab === 'setlist') {
            const currentItem = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
            if (currentItem && currentItem.slides && currentItem.slides.length > 0) {
               const currentSlideId = previewSlide?.id || liveState.slide?.id;
               const currentIndex = currentItem.slides.findIndex(s => s.id === currentSlideId);

               if (currentIndex > 0) {
                  const prevSlide = currentItem.slides[currentIndex - 1];
                  setPreviewSlide(prevSlide);
                  goLive(prevSlide);
               } else if (currentIndex === 0) {
                  // CONTINUOUS SETLIST PROGRESSION: Jump to previous playable item in the service queue!
                  const currentItemIdx = serviceSetlist.items.findIndex(i => i.id === activeSetlistItemId);
                  if (currentItemIdx > 0) {
                     for (let prevI = currentItemIdx - 1; prevI >= 0; prevI--) {
                        const prevItem = serviceSetlist.items[prevI];
                        if (prevItem.type !== 'header' && prevItem.slides && prevItem.slides.length > 0) {
                           setActiveSetlistItemId(prevItem.id);
                           const lastSlide = prevItem.slides[prevItem.slides.length - 1];
                           setPreviewSlide(lastSlide);
                           goLive(lastSlide);
                           break;
                        }
                     }
                  }
               }
            }
         } else if (activeTab === 'songs') {
            const currentSong = songsList[activeItemIndex];
            if (!currentSong) return;
            const currentSlideId = previewSlide?.id || liveState.slide?.id;
            const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
            if (currentIndex > 0) {
               const prevSlide = currentSong.slides[currentIndex - 1];
               setPreviewSlide(prevSlide);
               goLive(prevSlide);
            }
         } else if (activeTab === 'bibles' && isShowingThreeColumns) {
            if (!activeBibleData || activeBibleBookIndex === null || activeBibleChapterIndex === null) return;
            const verses = activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].verses;
            const currentIdx = activeBibleVerseIndex ?? 0;
            if (currentIdx > 0) {
               const prevIdx = currentIdx - 1;
               setActiveBibleVerseIndex(prevIdx);
               const v = verses[prevIdx];
               const b = activeBibleData.books[activeBibleBookIndex];
               const c = b.chapters[activeBibleChapterIndex];
               const slide: SlideDefinition = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' };
               setPreviewSlide(slide);
               pushToBibleHistory(slide);
               if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
            }
         }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, activeItemIndex, serviceSetlist, activeSetlistItemId, activeBibleData, activeBibleBookIndex, activeBibleChapterIndex, activeBibleVerseIndex, liveState, previewSlide, songsList, isShowingThreeColumns]);


  useEffect(() => {
    initDatabase().then(() => { getBibleList().then(list => { setBibleList(list); if (list.length > 0) setActiveBibleId(list[0].id); }); })
    .catch(err => { getBibleList().then(list => { setBibleList(list); if (list.length > 0) setActiveBibleId(list[0].id); }); });
  }, []);

  // Sync translation changes without automatically pushing Live
  useEffect(() => {
    if (activeBibleId) { 
        getBible(activeBibleId).then(data => { 
            if (data) { 
                setActiveBibleData(data); 
                
                const bIdx = bIndexRef.current !== null ? Math.min(bIndexRef.current, data.books.length - 1) : 0;
                const cIdx = cIndexRef.current !== null ? Math.min(cIndexRef.current, data.books[bIdx].chapters.length - 1) : 0;
                const vIdx = vIndexRef.current !== null ? Math.min(vIndexRef.current, data.books[bIdx].chapters[cIdx].verses.length - 1) : 0;

                if (bIndexRef.current === null) {
                    setActiveBibleBookIndex(0);
                    setActiveBibleChapterIndex(0);
                    setActiveBibleVerseIndex(0);
                } else {
                    setActiveBibleBookIndex(bIdx);
                    setActiveBibleChapterIndex(cIdx);
                    setActiveBibleVerseIndex(vIdx);

                    const v = data.books[bIdx].chapters[cIdx].verses[vIdx];
                    const slide: SlideDefinition = { id: `b-${data.books[bIdx].name}-${data.books[bIdx].chapters[cIdx].c}-${v.v}`, text: v.lines.join('\n'), source: `${data.books[bIdx].name} ${data.books[bIdx].chapters[cIdx].c}:${v.v}`, type: 'scripture' };
                    
                    setPreviewSlide(slide); 
                }
            }
        }); 
    }
    else { 
        setActiveBibleData(null); 
        setActiveBibleBookIndex(null); 
        setActiveBibleChapterIndex(null); 
        setActiveBibleVerseIndex(null);
    }
  }, [activeBibleId]);

  // What stage screens show besides the live slide: what comes next (as the arrow keys would go) and the song title
  const stageInfo = useMemo<StageInfo>(() => {
    const live = liveState.slide;
    if (!live) return { nextSlide: null };
    const nextIn = (slides: SlideDefinition[], i: number) => slides.slice(i + 1).find(s => !s.disabled) ?? null;
    // The open setlist item first (its order is what's being presented), continuing into the next item
    if (activeTab === 'setlist') {
      const itemIndex = serviceSetlist.items.findIndex(it => it.id === activeSetlistItemId);
      const item = serviceSetlist.items[itemIndex];
      const i = item?.slides?.findIndex(s => s.id === live.id) ?? -1;
      if (item?.slides && i >= 0) {
        const following = serviceSetlist.items.slice(itemIndex + 1).find(it => it.type !== 'header' && it.slides?.length);
        return { nextSlide: nextIn(item.slides, i) ?? following?.slides?.[0] ?? null, songTitle: item.title };
      }
    }
    for (const song of songsList) {
      const i = song.slides.findIndex(s => s.id === live.id);
      if (i >= 0) return { nextSlide: nextIn(song.slides, i), songTitle: song.title };
    }
    // A Bible verse: the verse after it in the open Bible
    const ref = live.type === 'scripture' ? live.source?.match(/^(.+)\s+(\d+):(\d+)$/) : null;
    if (ref && activeBibleData) {
      const book = activeBibleData.books.find(b => b.name === ref[1]);
      const chapter = book?.chapters.find(c => c.c === Number(ref[2]));
      const at = chapter ? chapter.verses.findIndex(x => x.v === Number(ref[3])) : -1;
      const v = at >= 0 ? chapter!.verses[at + 1] : undefined;
      if (book && chapter && v) {
        return { nextSlide: { id: `b-${book.name}-${chapter.c}-${v.v}`, text: v.lines.join('\n'), source: `${book.name} ${chapter.c}:${v.v}`, type: 'scripture' } };
      }
    }
    return { nextSlide: null };
  }, [liveState.slide, songsList, serviceSetlist, activeTab, activeSetlistItemId, activeBibleData]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ ...liveState, stage: stageInfo });
    channel.onmessage = (event) => {
      if (event.data?.type === 'REQUEST_CURRENT_STATE') {
        channel.postMessage({ ...liveState, stage: stageInfo, videoInitState: { time: liveVideoRef.current?.currentTime || 0, muted: isVideoMuted, playing: isVideoPlaying } });
      }
    };
    return () => channel.close();
  }, [liveState, stageInfo, isVideoMuted, isVideoPlaying]);

  const openProjector = async (outputId: string) => {
    const config = liveState.settings?.outputs.find(o => o.id === outputId);
    if (!config?.displayId) {
        alert(`You must select a display screen for ${config?.name || outputId} before it can go LIVE. Please check Settings > Outputs.`);
        return;
    }

    const label = `projector-${outputId}`;
    const url = `/projector/${outputId}`;

    let wFeatures = 'width=1280,height=720,menubar=no,toolbar=no';
    try {
        if ('getScreenDetails' in window) {
             const details = await (window as any).getScreenDetails();
             const screen = details.screens.find((s: any) => s.label === config.displayId);
             if (screen) {
                 wFeatures = `left=${screen.availLeft},top=${screen.availTop},width=${screen.width},height=${screen.height},menubar=no,toolbar=no,fullscreen=yes`;
             }
        }
    } catch(err) {
        console.warn('Could not query window management params', err);
    }

    if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) {
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) { await existing.setFocus(); return; }
        new WebviewWindow(label, { url: url, title: `Live Display - ${outputId.toUpperCase()}`, width: 1280, height: 720, transparent: true });
        return;
      } catch (err) { console.warn('Failed to open Tauri native window', err); }
    }
    
    window.open(url, `FlowShow_${outputId}`, wFeatures);
  };

  const goLive = (slide: SlideDefinition) => {
      // Text boxes added in Design mode wait off the screens until their slide goes live
      const released = releaseWaitingBoxes(slide);
      if (released !== slide) updateSlidesById(new Set([slide.id]), releaseWaitingBoxes);
      setLiveState(prev => ({ ...prev, slide: released, clearText: false, clearedOutputs: {} }));
      setPreviewSlide(released);
  };
  
  const setGlobalBackground = (url: string | null, type: 'image' | 'video' = 'image') => setLiveState(prev => ({ ...prev, globalBackground: url ? { url, type } : null, clearedOutputs: {} }));

  const handleJumpToVerse = (slide: SlideDefinition, isDoubleClick: boolean = false) => {
      if (activeBibleData && slide.source) {
          const match = slide.source.match(/^(.+)\s+(\d+):(\d+)$/);
          if (match) {
              const bName = match[1];
              const cNum = parseInt(match[2], 10);
              const vNum = parseInt(match[3], 10);

              const bIdx = activeBibleData.books.findIndex(b => b.name === bName);
              if (bIdx !== -1) {
                  setActiveBibleBookIndex(bIdx);
                  const cIdx = activeBibleData.books[bIdx].chapters.findIndex(c => c.c === cNum);
                  if (cIdx !== -1) {
                      setActiveBibleChapterIndex(cIdx);
                      const vIdx = activeBibleData.books[bIdx].chapters[cIdx].verses.findIndex(v => v.v === vNum);
                      if (vIdx !== -1) {
                          setActiveBibleVerseIndex(vIdx);
                      }
                  }
              }
          }
      }

      setBibleSearchQuery('');
      setBibleKeywordQuery('');
      setShowBibleHistory(false);
      
      setPreviewSlide(slide);
      pushToBibleHistory(slide);

      if (isDoubleClick) {
         goLive(slide);
      } else if (liveState.slide?.type === 'scripture' && !liveState.clearText) {
         goLive(slide);
      }
  };

  const handleVerseClick = (slide: SlideDefinition, vIdx: number) => {
     setActiveBibleVerseIndex(vIdx);
     setPreviewSlide(slide);
     pushToBibleHistory(slide);
     if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
  };

  const handleVerseDoubleClick = (slide: SlideDefinition, vIdx: number) => {
     setActiveBibleVerseIndex(vIdx);
     pushToBibleHistory(slide);
     goLive(slide);
  };

  const handleKeywordSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setBibleKeywordQuery(val);
      setBibleSearchQuery('');
      setShowBibleHistory(false);
      
      if (!activeBibleData || !val.trim()) {
          setBibleKeywordResults([]);
          return;
      }

      const terms = val.toLowerCase().split(/\s+/).filter(Boolean);
      let results: {slide: SlideDefinition, score: number}[] = [];
      
      for (const b of activeBibleData.books) {
         for (const c of b.chapters) {
            for (const v of c.verses) {
               const text = v.lines.join(' ').toLowerCase();
               let score = 0;
               let allMatch = true;
               for (const t of terms) {
                  if (text.includes(t)) score += 1;
                  else allMatch = false; 
               }
               if (allMatch) {
                  if (text.includes(val.toLowerCase())) score += 10;
                  results.push({
                     slide: { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' },
                     score
                  });
               }
            }
         }
      }
      results.sort((a, b) => b.score - a.score);
      setBibleKeywordResults(results.slice(0, 50).map(r => r.slide));
  };

  const handleBibleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    setBibleKeywordQuery('');
    setShowBibleHistory(false);
    
    if (!activeBibleData) {
        setBibleSearchQuery(val);
        return;
    }

    const match = val.match(/^(\d?\s*[a-zA-Z]+)(?:([\s:]+)(\d+))?(?:([\s:]+)(\d+))?([:\s]*)$/);
    
    if (match) {
        const bStr = match[1];
        const cSep = match[2] || '';
        const cStr = match[3];
        const vSep = match[4] || '';
        const vStr = match[5];
        const trailing = match[6] || '';

        const resolveAlias = (q: string) => {
            const str = q.toLowerCase().replace(/\s/g, '');
            if (str === 'duet' || str === 'deut') return 'deuteronomy';
            if (str === 'ps') return 'psalms';
            if (str === 'song' || str === 'sos') return 'songofsolomon';
            if (str === 'rev') return 'revelation';
            return str;
        };

        const bSearch = resolveAlias(bStr);
        const bIdx = activeBibleData.books.findIndex(b => b.name.toLowerCase().replace(/\s/g, '').startsWith(bSearch));
        
        if (bIdx !== -1) {
            setActiveBibleBookIndex(bIdx);
            const book = activeBibleData.books[bIdx];
            let finalVal = bStr;
            
            if (cStr) {
                let cNum = parseInt(cStr, 10);
                const maxC = book.chapters.length;
                if (cNum > maxC) cNum = maxC; 
                if (cNum < 1) cNum = 1;
                finalVal += cSep + cNum;
                
                const cIdx = cNum - 1;
                if (cIdx >= 0 && cIdx < maxC) {
                    setActiveBibleChapterIndex(cIdx);
                    const chapter = book.chapters[cIdx];
                    
                    if (vStr) {
                        let vNum = parseInt(vStr, 10);
                        const maxV = Math.max(...chapter.verses.map(v => v.v));
                        if (vNum > maxV) vNum = maxV;
                        if (vNum < 1) vNum = 1;
                        finalVal += vSep + vNum;

                        const vIdx = chapter.verses.findIndex(v => v.v === vNum);
                        if (vIdx !== -1) {
                            setActiveBibleVerseIndex(vIdx);
                        }
                    } else {
                        setActiveBibleVerseIndex(null);
                    }
                }
            } else {
                setActiveBibleChapterIndex(null);
                setActiveBibleVerseIndex(null);
            }
            finalVal += trailing;
            val = finalVal;
        }
    }
    setBibleSearchQuery(val);
  };

  const handleBibleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeBibleData) return;
    
    if (e.key === ' ' || e.key === 'ArrowRight') {
        if (activeBibleBookIndex !== null) {
            const book = activeBibleData.books[activeBibleBookIndex];
            
            if (!/\d/.test(bibleSearchQuery) || /^[1-3]\s*[a-zA-Z]+$/.test(bibleSearchQuery)) {
                e.preventDefault();
                setBibleSearchQuery(`${book.name} `);
                return;
            }
            
            const chapMatch = bibleSearchQuery.match(/^(\d?\s*[a-zA-Z]+\s+\d+)$/);
            if (chapMatch) {
                e.preventDefault();
                setBibleSearchQuery(`${chapMatch[1]}:`);
                return;
            }
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleVerseIndex !== null) {
            const b = activeBibleData.books[activeBibleBookIndex];
            const c = b.chapters[activeBibleChapterIndex];
            const v = c.verses[activeBibleVerseIndex];
            const slide = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' as SlideType };
            handleJumpToVerse(slide, true);
        }
    }
  };

  const handleVerseDetected = (reference: any) => {
     const bookSearch = reference.book;
     const chapterSearch = reference.chapters[0];
     const verseSearch = reference.verses?.[0]?.[0] || 1;
     const sourceString = `${bookSearch} ${chapterSearch}:${verseSearch}`;
     let foundText = `Finding: ${sourceString}...`;

     if (activeBibleData) {
       const book = activeBibleData.books.find(b => b.name.toLowerCase().startsWith(bookSearch.toLowerCase()));
       if (book) {
         const chapter = book.chapters.find(c => c.c === chapterSearch);
         if (chapter) {
           const verse = chapter.verses.find(v => v.v === verseSearch);
           if (verse) foundText = verse.text;
           else foundText = `[Verse ${verseSearch} not found]`;
         } else foundText = `[Chapter ${chapterSearch} not found]`;
       } else foundText = `[Book ${bookSearch} not found]`;
     }
     const slide = { id: `auto-${Date.now()}`, type: 'scripture' as SlideType, text: foundText, source: sourceString };
     pushToBibleHistory(slide);
     goLive(slide);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const newBible = await parseBibleXml(file);
      await saveBible(newBible);
      const list = await getBibleList();
      setBibleList(list);
      setActiveBibleId(newBible.id);
    } catch (err) { alert("Failed to parse Bible XML. " + err); } 
    finally { setIsUploading(false); if (e.target) e.target.value = ''; }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'song'|'bible'|'slide', id: string|number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  const deleteSong = (id: string | number) => {
    let indexToRemove = -1;
    setSongsList(prev => { indexToRemove = prev.findIndex(s => s.id === id); return prev.filter(s => s.id !== id); });
    if (indexToRemove !== -1) setActiveItemIndex(prevIndex => (prevIndex >= indexToRemove && prevIndex > 0 ? prevIndex - 1 : prevIndex));
  };

  const handleDeleteBible = async (id: string) => {
    await deleteBible(id);
    const list = await getBibleList();
    setBibleList(list);
    if (activeBibleId === id) setActiveBibleId(list.length > 0 ? list[0].id : null);
  };

  const toggleClearText = () => {
     setLiveState(prev => ({ ...prev, clearText: !prev.clearText }));
     setPreviewSlide(null);
  };
  const clearAll = () => {
     setLiveState(prev => ({ ...prev, slide: undefined, globalBackground: null, clearText: false, clearedOutputs: {} }));
     setPreviewSlide(null);
  };

  const handleSplitSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; const slides = [...song.slides];
      const slideToSplit = slides[index]; const lines = slideToSplit.text.split('\n');
      if (lines.length <= 1) return prev;
      const mid = Math.ceil(lines.length / 2);
      const slide1 = { ...slideToSplit, text: lines.slice(0, mid).join('\n') };
      const slide2 = { ...slideToSplit, text: lines.slice(mid).join('\n'), id: `s-${Date.now()}` };
      slides[index] = slide1; slides.splice(index + 1, 0, slide2);
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
  };

  const handleRemoveTemplate = (scope: 'slide' | 'song', index: number) => {
    setSongsList(prev => prev.map((song, idx) => {
      if (idx !== activeItemIndex) return song;
      const slides = song.slides.map((s, i) => (scope === 'song' || i === index) ? linkSlideToTemplate({ ...s, outputTemplates: undefined }, NO_TEMPLATE_ID) : s);
      return scope === 'song'
        ? { ...song, templateId: undefined, outputTemplates: undefined, slides }
        : { ...song, slides };
    }));
  };

  const handleDuplicateSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; const slides = [...song.slides];
      slides.splice(index + 1, 0, { ...slides[index], id: `s-${Date.now()}` });
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
  };

  const handleDeleteSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; let slides = [...song.slides];
      if (slides.length <= 1) slides[index] = { ...slides[index], text: '' }; else slides.splice(index, 1);
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
  };

  const handleDropSlide = (targetIndex: number) => {
    if (draggedSlideIndex === null || draggedSlideIndex === targetIndex || activeTab !== 'songs' || !songsList[activeItemIndex]) {
      setDraggedSlideIndex(null); setDragOverSlideIndex(null); return;
    }
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; const slides = [...song.slides];
      const [draggedSlide] = slides.splice(draggedSlideIndex, 1); slides.splice(targetIndex, 0, draggedSlide);
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
    setDraggedSlideIndex(null); setDragOverSlideIndex(null);
  };

  // --- RENDER COMPONENTS ---

  const renderSidebarList = () => {
    if (activeTab === 'songs') {
      const filteredSongs = songsList.filter(song => {
         if (!songSearchQuery.trim()) return true;
         const q = songSearchQuery.toLowerCase();
         if (song.title.toLowerCase().includes(q)) return true;
         return song.slides.some(s => s.text.toLowerCase().includes(q));
      }).sort((a, b) => {
         if (!songSearchQuery.trim()) return 0;
         const q = songSearchQuery.toLowerCase();
         const aTitle = a.title.toLowerCase().includes(q);
         const bTitle = b.title.toLowerCase().includes(q);
         if (aTitle && !bTitle) return -1;
         if (!aTitle && bTitle) return 1;
         return 0;
      });

      return (
        <div className="flex flex-col h-full bg-[#121214]">
          <div className="p-4 border-b border-white/5 shrink-0">
             <div className="relative">
               <Search size={14} className="absolute left-3 top-3 text-neutral-500" />
               <input 
                 type="text" 
                 placeholder="Search Songs & Lyrics..." 
                 value={songSearchQuery}
                 onChange={(e) => setSongSearchQuery(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-neutral-200 placeholder:text-neutral-500" 
               />
             </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {filteredSongs.map((song) => {
              const originalIndex = songsList.findIndex(s => s.id === song.id);
              return (
                 <div key={song.id} onContextMenu={(e) => handleContextMenu(e, 'song', song.id)} onClick={() => setActiveItemIndex(originalIndex)} className={`group px-4 py-3 cursor-pointer border-b border-white/5 flex items-center justify-between transition-colors ${activeItemIndex === originalIndex ? 'bg-blue-600/10 border-l-2 border-l-blue-500 text-white' : 'hover:bg-white/5 border-l-2 border-l-transparent text-neutral-400'}`}>
                   <div className="flex items-center gap-3 min-w-0">
                     <FileText size={14} className={activeItemIndex === originalIndex ? "text-blue-500" : "text-neutral-500 transition-colors group-hover:text-neutral-400"} />
                     <span className="text-sm font-medium truncate">{song.title}</span>
                   </div>
                   <button
                     onClick={(e) => {
                       e.stopPropagation();
                       handleAddSongToSetlist(song);
                     }}
                     className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-600/20 text-neutral-400 hover:text-blue-400 rounded transition-all text-xs flex items-center gap-1 shrink-0"
                     title="Add to Service Order"
                   >
                     <ListOrdered size={12} />
                   </button>
                 </div>
              );
            })}
          </div>
          <div className="p-4 border-t border-white/5 shrink-0">
             <button onClick={() => setIsAddSongModalOpen(true)} className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium text-neutral-300 flex justify-center items-center gap-2 transition-all"><Plus size={14} /> New Song</button>
          </div>
        </div>
      );
    }

    if (activeTab === 'setlist') {
      return (
        <div className="flex flex-col h-full bg-[#121214]">
          <div className="p-3 border-b border-white/5 shrink-0 flex items-center justify-between">
             <div className="min-w-0">
               <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 block">Service Order</span>
               <span className="text-xs font-bold text-white truncate block">{serviceSetlist.name}</span>
             </div>
             <button 
               onClick={() => setSetlistViewMode(prev => prev === 'manager' ? 'slides' : 'manager')}
               className={`text-[10px] px-2 py-1 rounded font-bold transition-all ${setlistViewMode === 'manager' ? 'bg-blue-600 text-white' : 'bg-white/5 hover:bg-white/10 text-neutral-300'}`}
               title="Toggle Order of Service Planner"
             >
               {setlistViewMode === 'manager' ? 'Slides' : 'Edit'}
             </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
             {serviceSetlist.items.length === 0 ? (
               <div className="p-6 text-center text-xs text-neutral-500">Service order is empty.</div>
             ) : (
               serviceSetlist.items.map((item, idx) => {
                 if (item.type === 'header') {
                   return (
                     <div key={item.id} className="pt-2 pb-1 px-2.5 flex items-center gap-2 border-b border-white/5">
                       <div className="w-1.5 h-3 rounded-full" style={{ backgroundColor: item.headerColor || '#3b82f6' }} />
                       <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 truncate">{item.title}</span>
                     </div>
                   );
                 }
                 const isItemActive = activeSetlistItemId === item.id;
                 return (
                   <div 
                     key={item.id}
                     onClick={() => {
                       setActiveSetlistItemId(item.id);
                       setSetlistViewMode('slides');
                       if (item.slides && item.slides.length > 0) {
                         setPreviewSlide(item.slides[0]);
                       }
                     }}
                     className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-all ${
                       isItemActive 
                         ? 'bg-blue-600/15 border border-blue-500/40 text-white shadow-sm' 
                         : 'hover:bg-white/5 text-neutral-400 border border-transparent'
                     }`}
                   >
                     <div className="flex items-center gap-2 min-w-0">
                       <span className="text-[10px] font-mono text-neutral-500 w-4">{idx + 1}</span>
                       <div className="shrink-0 text-neutral-400">
                         {item.type === 'song' && <Music size={12} className={isItemActive ? 'text-blue-400' : ''} />}
                         {item.type === 'scripture' && <BookOpen size={12} className={isItemActive ? 'text-emerald-400' : ''} />}
                         {item.type === 'media' && <ImageIcon size={12} className={isItemActive ? 'text-purple-400' : ''} />}
                       </div>
                       <span className="text-xs font-medium truncate">{item.title}</span>
                     </div>
                     <span className="text-[9px] font-mono text-neutral-500 shrink-0">{item.slides?.length || 0}</span>
                   </div>
                 );
               })
             )}
          </div>
          <div className="p-3 border-t border-white/5 shrink-0 flex gap-1.5">
             <button 
               onClick={() => setSetlistViewMode('manager')}
               className="flex-1 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-white border border-blue-500/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
             >
               <ListOrdered size={13} />
               Manage Service
             </button>
          </div>
        </div>
      );
    }
    
    if (activeTab === 'bibles') {
      return (
        <div className="flex flex-col h-full bg-[#121214]">
          <div className="p-4 border-b border-white/5 shrink-0">
             <label className="flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 font-medium text-sm py-2.5 rounded-lg cursor-pointer transition-all">
                {isUploading ? <Activity size={14} className="animate-spin" /> : <Upload size={14} />} {isUploading ? 'Parsing XML...' : 'Import XML Bible'}
                <input type="file" accept=".xml" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
             </label>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {bibleList.length === 0 ? (
               <div className="p-6 text-center text-sm text-neutral-500">No Bibles imported.</div>
            ) : (
               bibleList.map((bible) => (
                <div 
                  key={bible.id} 
                  onContextMenu={(e) => handleContextMenu(e, 'bible', bible.id)} 
                  onClick={() => setActiveBibleId(bible.id)} 
                  onDoubleClick={async () => {
                      const data = await getBible(bible.id);
                      if (data && bIndexRef.current !== null && cIndexRef.current !== null && vIndexRef.current !== null) {
                         const bIdx = Math.min(bIndexRef.current, data.books.length - 1);
                         const cIdx = Math.min(cIndexRef.current, data.books[bIdx].chapters.length - 1);
                         const vIdx = Math.min(vIndexRef.current, data.books[bIdx].chapters[cIdx].verses.length - 1);
                         const b = data.books[bIdx];
                         const c = b.chapters[cIdx];
                         const v = c.verses[vIdx];
                         const slide: SlideDefinition = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' };
                         setPreviewSlide(slide);
                         goLive(slide);
                      }
                  }}
                  className={`group px-4 py-3 cursor-pointer border-b border-white/5 flex items-center transition-colors ${activeBibleId === bible.id ? 'bg-blue-600/10 border-l-2 border-l-blue-500 text-white' : 'hover:bg-white/5 border-l-2 border-l-transparent text-neutral-400'}`}>
                  <div className="flex items-center gap-3 min-w-0"><BookOpen size={14} className={activeBibleId === bible.id ? "text-blue-500" : "text-neutral-500 transition-colors group-hover:text-neutral-400"} /><span className="text-sm font-medium truncate">{bible.name}</span></div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderCenterWorkspace = () => {
    if (activeTab === 'media') return <MediaLibrary onSelectBackground={setGlobalBackground} />;
    if (activeTab === 'audio') return <AudioModule onVerseDetected={handleVerseDetected} />;

    if (activeTab === 'bibles') {
      const isSearchingKeyword = bibleKeywordQuery.trim().length > 0;

      return (
        <div className="flex flex-col h-full bg-[#09090B]">
           <div className="p-4 border-b border-white/5 shrink-0 flex flex-wrap gap-4 items-center bg-[#09090B] shadow-sm z-10 relative">
              <div className="relative flex-1 min-w-[200px]">
                 <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   value={bibleSearchQuery} 
                   onChange={handleBibleSearchChange}
                   onKeyDown={handleBibleSearchKeyDown}
                   placeholder="Ref (Joh 3 16)..." 
                   className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-white placeholder:text-neutral-500"
                 />
              </div>
              <div className="relative flex-1 min-w-[200px]">
                 <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   value={bibleKeywordQuery} 
                   onChange={handleKeywordSearchChange}
                   placeholder="Keyword (God so loved)..." 
                   className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-white placeholder:text-neutral-500"
                 />
              </div>
              <button 
                 onClick={() => {
                     setBibleSearchQuery('');
                     setBibleKeywordQuery('');
                     setShowBibleHistory(!showBibleHistory);
                 }}
                 className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${showBibleHistory ? 'bg-blue-600 text-white shadow-md' : 'bg-white/5 border border-transparent text-neutral-400 hover:text-white hover:bg-white/10'}`}
              >
                 <Clock size={16} /> History
              </button>
              <span className="text-sm font-medium text-neutral-400 ml-auto">{activeBibleData?.name || 'No Bible Selected'}</span>
           </div>

           {showBibleHistory ? (
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#09090B]">
                 <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Clock size={20}/> Session History</h2>
                 {bibleHistory.length === 0 ? (
                    <div className="text-neutral-500 text-sm">No verses viewed in this session yet.</div>
                 ) : (
                    <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                       {bibleHistory.map((slide, idx) => {
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         return (
                           <div 
                              key={`${slide.id}-${idx}`} 
                              onClick={() => handleJumpToVerse(slide, false)}
                              onDoubleClick={() => handleJumpToVerse(slide, true)}
                              className={`p-5 rounded-xl cursor-pointer border transition-all flex gap-5 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white shadow-lg' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300 shadow-sm'}`}
                           >
                              <span className={`text-xs font-bold mt-1.5 shrink-0 w-24 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{slide.source}</span>
                              <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{slide.text}</p>
                           </div>
                         );
                       })}
                    </div>
                 )}
              </div>
           ) : isSearchingKeyword ? (
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#09090B]">
                 {bibleKeywordResults.length === 0 ? (
                    <div className="text-center text-neutral-500 text-sm mt-10">No keyword matches found.</div>
                 ) : (
                    <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                       {bibleKeywordResults.map((slide) => {
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         return (
                           <div 
                              key={slide.id} 
                              onClick={() => handleJumpToVerse(slide, false)}
                              onDoubleClick={() => handleJumpToVerse(slide, true)}
                              className={`p-5 rounded-xl cursor-pointer border transition-all flex gap-5 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white shadow-lg' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300 shadow-sm'}`}
                           >
                              <span className={`text-xs font-bold mt-1.5 shrink-0 w-24 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{slide.source}</span>
                              <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{slide.text}</p>
                           </div>
                         );
                       })}
                    </div>
                 )}
              </div>
           ) : (
              <div className="flex flex-1 min-h-0 overflow-hidden bg-[#09090B]">
                 <div className="w-48 border-r border-white/5 overflow-y-auto custom-scrollbar bg-[#121214] shrink-0" ref={bookListRef}>
                    {activeBibleData?.books.map((book, idx) => (
                       <button key={book.name} onClick={() => { setActiveBibleBookIndex(idx); setActiveBibleChapterIndex(0); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-left px-5 py-3 text-sm border-b border-white/5 transition-colors truncate ${activeBibleBookIndex === idx ? 'bg-blue-600/10 text-blue-400 font-semibold border-l-2 border-l-blue-500' : 'text-neutral-400 hover:bg-white/5 hover:text-white border-l-2 border-l-transparent'}`}>{book.name}</button>
                    ))}
                 </div>
                 <div className="w-20 border-r border-white/5 overflow-y-auto custom-scrollbar bg-[#121214] shrink-0" ref={chapterListRef}>
                    {activeBibleBookIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters.map((chapter, idx) => (
                       <button key={chapter.c} onClick={() => { setActiveBibleChapterIndex(idx); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-center px-2 py-3 text-sm border-b border-white/5 transition-colors ${activeBibleChapterIndex === idx ? 'bg-blue-600/10 text-blue-400 font-semibold shadow-inner' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>{chapter.c}</button>
                    ))}
                 </div>
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#09090B]">
                    <div className="flex flex-col gap-3 max-w-4xl mx-auto" ref={verseListRef}>
                      {activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters[activeBibleChapterIndex]?.verses.map((verse, vIdx) => {
                         const slide: SlideDefinition = { id: `b-${activeBibleData.books[activeBibleBookIndex].name}-${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}-${verse.v}`, text: verse.lines.join('\n'), source: `${activeBibleData.books[activeBibleBookIndex].name} ${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}:${verse.v}`, type: 'scripture' };
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         const isNextLogical = activeBibleVerseIndex !== null && vIdx === activeBibleVerseIndex + 1;
                         
                         return (
                            <div 
                               key={verse.v} 
                               onClick={() => handleVerseClick(slide, vIdx)}
                               onDoubleClick={() => handleVerseDoubleClick(slide, vIdx)}
                               className={`p-5 rounded-xl cursor-pointer border transition-all flex gap-5 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white shadow-lg' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : isNextLogical ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300 shadow-sm'}`}
                            >
                               <span className={`text-xs font-bold mt-1.5 shrink-0 w-8 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{verse.v}</span>
                               <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{verse.lines.join('\n')}</p>
                            </div>
                         );
                      })}
                    </div>
                 </div>
              </div>
           )}
        </div>
      );
    }

    if (activeTab === 'setlist') {
      const activeItem = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
      
      if (setlistViewMode === 'manager' || !activeItem || activeItem.type === 'header' || !activeItem.slides || activeItem.slides.length === 0) {
        return (
          <SetlistManager
            setlist={serviceSetlist}
            onUpdateSetlist={handleUpdateSetlist}
            activeItemId={activeSetlistItemId}
            onSelectItem={(item) => {
              setActiveSetlistItemId(item.id);
              if (item.type !== 'header' && item.slides && item.slides.length > 0) {
                setSetlistViewMode('slides');
                setPreviewSlide(item.slides[0]);
              }
            }}
            availableSongs={songsList}
            onGoLive={goLive}
          />
        );
      }

      // Render Item Slide Grid
      const playableItems = serviceSetlist.items.filter(i => i.type !== 'header' && i.slides && i.slides.length > 0);
      const currPlayableIndex = playableItems.findIndex(i => i.id === activeItem.id);
      const prevPlayableItem = currPlayableIndex > 0 ? playableItems[currPlayableIndex - 1] : null;
      const nextPlayableItem = currPlayableIndex < playableItems.length - 1 ? playableItems[currPlayableIndex + 1] : null;

      return (
        <div className="flex flex-col h-full bg-[#09090B]">
          {/* Item Toolbar */}
          <div className="h-14 bg-[#09090B] border-b border-white/5 flex items-center justify-between px-6 shrink-0 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400">
                {activeItem.type === 'song' ? <Music size={18} /> : <BookOpen size={18} />}
              </div>
              <div>
                <h2 className="text-base font-semibold text-white tracking-wide">{activeItem.title}</h2>
                <span className="text-[11px] text-neutral-400">{activeItem.subtitle || `${activeItem.slides.length} Slides`} • In Service Queue</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsTemplateGalleryOpen(true)}
                className="text-xs bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 border border-blue-500/40 px-3.5 py-2 rounded-lg transition-all text-blue-400 hover:text-white font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Sparkles size={14} className="text-blue-400" />
                Templates & Motion
              </button>
              <button 
                onClick={() => setSetlistViewMode('manager')}
                className="text-xs bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-lg text-neutral-300 font-medium transition-colors"
              >
                Service Overview
              </button>
              <div className="h-4 w-px bg-white/10 mx-1" />
              <button
                disabled={!prevPlayableItem}
                onClick={() => {
                  if (prevPlayableItem) {
                    setActiveSetlistItemId(prevPlayableItem.id);
                    if (prevPlayableItem.slides?.[0]) setPreviewSlide(prevPlayableItem.slides[0]);
                  }
                }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-20 text-neutral-300 hover:text-white transition-all"
                title={prevPlayableItem ? `Previous: ${prevPlayableItem.title}` : 'No previous item'}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={!nextPlayableItem}
                onClick={() => {
                  if (nextPlayableItem) {
                    setActiveSetlistItemId(nextPlayableItem.id);
                    if (nextPlayableItem.slides?.[0]) setPreviewSlide(nextPlayableItem.slides[0]);
                  }
                }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-20 text-neutral-300 hover:text-white transition-all"
                title={nextPlayableItem ? `Next: ${nextPlayableItem.title}` : 'No next item'}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Slide Grid */}
          <div className="flex-1 overflow-y-auto p-4 bg-[#09090B] custom-scrollbar">
            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 content-start">
              {activeItem.slides.map((slide, i) => {
                const isLive = liveState.slide?.id === slide.id;
                const isPreview = previewSlide?.id === slide.id;
                const currentSlideId = previewSlide?.id || liveState.slide?.id;
                const currentIndex = activeItem.slides!.findIndex(s => s.id === currentSlideId);
                const isNextLogical = currentIndex !== -1 && i === currentIndex + 1;

                return (
                  <div
                    key={slide.id}
                    onClick={() => {
                      setPreviewSlide(slide);
                      goLive(slide);
                    }}
                    className={`group aspect-[16/9] rounded-xl cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden
                      ${isLive ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : isPreview ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : isNextLogical ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 shadow-lg'}
                    `}
                  >
                    <FixedStage className="w-full h-full pointer-events-none">
                      <SmartTextLayout text={slide.text} source={slide.source} type={slide.type} styleOverrides={applyGlobalStyles(slide, liveState.settings?.outputs.find(o => o.id === 'main'), liveState.settings)} />
                    </FixedStage>
                    <div className="absolute top-2 left-2 text-[10px] font-bold text-neutral-500 bg-[#09090B]/80 px-2 py-0.5 rounded shadow-sm border border-white/10 backdrop-blur-md z-10">{i + 1}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'songs') {
      const activeSong = songsList[activeItemIndex];
      if (!activeSong) return <div className="flex-1 flex items-center justify-center text-neutral-500">No Song Selected</div>;

      return (
        <div className="flex flex-col h-full bg-[#09090B]">
           {/* Toolbar */}
           <div className="h-14 bg-[#09090B] border-b border-white/5 flex items-center justify-between px-6 shrink-0 shadow-sm">
             <div className="flex items-center gap-3">
                <Music size={18} className="text-blue-500" />
                <h2 className="text-lg font-semibold text-white tracking-wide">{activeSong.title}</h2>
             </div>
             <div className="flex items-center gap-2">
                 <button 
                   onClick={() => setIsTemplateGalleryOpen(true)}
                   className="text-xs bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 border border-blue-500/40 px-3.5 py-2 rounded-lg transition-all text-blue-400 hover:text-white font-bold flex items-center gap-1.5 shadow-sm"
                 >
                    <Sparkles size={14} className="text-blue-400" />
                    Templates & Motion
                 </button>
                 <button
                   onClick={() => openDesign(activeSong.slides[0]?.id ?? null)}
                   className="text-xs bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-lg transition-colors text-neutral-300 font-medium"
                   title="Open this song in Design"
                 >
                   Edit Song
                 </button>
              </div>
           </div>
           
           {/* Slide Grid */}
           <div className="flex-1 overflow-y-auto p-3 bg-[#09090B] custom-scrollbar z-0">
              <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 content-start">
                 {activeSong.slides.map((slide, i) => {
                    const isLive = liveState.slide?.id === slide.id;
                    const isPreview = previewSlide?.id === slide.id;
                    
                    const currentSlideId = previewSlide?.id || liveState.slide?.id;
                    const currentIndex = activeSong.slides.findIndex(s => s.id === currentSlideId);
                    const isNextLogical = currentIndex !== -1 && i === currentIndex + 1;

                    return (
                       <div 
                         key={slide.id} draggable
                         onDragStart={(e) => { setDraggedSlideIndex(i); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => { e.preventDefault(); setDragOverSlideIndex(i); }} onDrop={(e) => { e.preventDefault(); handleDropSlide(i); }}
                         onContextMenu={(e) => handleContextMenu(e, 'slide', i)} onClick={() => { if (!slide.disabled) { setPreviewSlide(slide); goLive(slide); } }}
                         className={`group aspect-[16/9] rounded-xl cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden
                           ${slide.disabled ? 'opacity-30 cursor-not-allowed' : ''} ${isLive ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : isPreview ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : isNextLogical ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 shadow-lg'} ${dragOverSlideIndex === i ? 'border-dashed border-blue-400 opacity-70' : ''}
                         `}
                       >
                         <FixedStage className="w-full h-full pointer-events-none">
                            <SmartTextLayout text={slide.text} source={slide.source} type={slide.type} styleOverrides={applyGlobalStyles(slide, liveState.settings?.outputs.find(o => o.id === 'main'), liveState.settings)} />
                         </FixedStage>
                         
                         {/* Slide Number Badge */}
                         <div className="absolute top-3 left-3 text-[10px] font-bold text-neutral-500 bg-[#09090B]/80 px-2 py-1 rounded shadow-sm border border-white/10 backdrop-blur-md z-10">{i + 1}</div>
                       </div>
                    );
                 })}
              </div>
           </div>
        </div>
      );
    }
  };

  const renderMonitorBridge = () => {
     const mainConfig = liveState.settings?.outputs.find(o => o.id === 'main');
     const otherOutputs = liveState.settings?.outputs.filter(o => o.enabled && o.id !== 'main') || [];
     
     let previewBg = mainConfig?.defaultBackground;
     if (liveState.globalBackground) {
        previewBg = liveState.globalBackground;
     }

     return (
       <div className="bg-[#030303] flex p-2 gap-3 shrink-0 z-20 h-32 lg:h-40 w-full justify-center shadow-md relative border-b border-white/5">
          <div className="flex gap-3 w-full max-w-[2000px]">
              {/* PREVIEW CONTAINER */}
              <div className="flex-1 flex flex-col min-w-0">
                 <div className="flex justify-between items-center px-1 mb-2 shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#4ade80]">Preview (Next)</span>
                 </div>
                 
                 <div className="flex-1 w-full min-h-0 bg-black rounded-xl border border-white/10 overflow-hidden relative shadow-inner flex items-center justify-center">
                     <FixedStage className="w-full h-full pointer-events-none">
                         {previewBg?.type === 'color' && <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: previewBg.color || '#000' }}></div>}
                         {previewBg?.url && previewBg.type === 'video' ? (
                            <video className="bg-video-player absolute inset-0 w-full h-full object-cover opacity-80" src={previewBg.url} autoPlay loop muted playsInline />
                         ) : previewBg?.url ? (
                            <img src={previewBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="bg" />
                         ) : null}
                         
                         {previewSlide && (
                            <div className="absolute inset-0 z-10 flex">
                               <SmartTextLayout text={previewSlide.text} source={previewSlide.source} type={previewSlide.type} animation={previewSlide.animation} styleOverrides={applyGlobalStyles(previewSlide, mainConfig, globalSettings)} />
                            </div>
                         )}

                         {!previewBg && !previewSlide && (
                            <div className="absolute inset-0 flex items-center justify-center bg-transparent"><span className="text-white/10 font-bold tracking-widest uppercase text-2xl">Black</span></div>
                         )}
                     </FixedStage>
                 </div>
              </div>

              {/* PROGRAM CONTAINER */}
              <div className="flex-1 flex flex-col min-w-0">
                 <div className="flex justify-between items-center px-1 mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                       <span className="text-[11px] font-bold uppercase tracking-widest text-red-500">Program (Live)</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                          onClick={() => toggleLockOutput('main')} 
                          className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${liveState.lockedOutputs?.['main'] ? 'text-red-500' : 'text-neutral-500 hover:text-white'}`}
                          title="Lock Screen"
                        >
                          Lock
                        </button>
                        <button onClick={() => toggleClearOutput('main')} className={`p-1 rounded transition-colors text-[10px] flex items-center gap-1 ${liveState.clearedOutputs?.['main'] ? 'bg-red-500/20 text-red-400 font-bold' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`} title="Clear Text from Main"><EyeOff size={10} /> {liveState.clearedOutputs?.['main'] ? 'Cleared' : 'Clear'}</button>
                        <button onClick={() => openProjector('main')} className="text-neutral-500 hover:text-white p-1 rounded hover:bg-white/5 transition-colors" title="Launch Output Screen"><LaunchIcon size={12} /></button>
                    </div>
                 </div>
                 
                 <div className={`flex-1 w-full min-h-0 bg-black rounded-xl border-2 overflow-hidden relative shadow-inner flex items-center justify-center transition-all duration-300 ${liveState.isPresenting && !liveState.lockedOutputs?.['main'] ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-white/5 opacity-80'}`}>
                    <FixedStage className="w-full h-full pointer-events-none bg-black">
                        {(() => {
                            const isLocked = !!liveState.lockedOutputs?.['main'];
                            const frozenState = liveState.frozenStates?.['main'];
                            const isCleared = !!liveState.clearedOutputs?.['main'];
                            
                            const displaySlide = isLocked ? frozenState?.slide : liveState.slide;
                            const rawBg = isLocked ? frozenState?.bg : (liveState.globalBackground || mainConfig?.defaultBackground);
                            const displayBg = resolveOutputBackground(rawBg, mainConfig, globalSettings);
                            const displayClearText = isLocked ? frozenState?.clearText : liveState.clearText;

                            return (
                              <>
                                  {displayBg?.type === 'color' && <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: displayBg.color || '#000' }}></div>}
                                  {displayBg?.url && displayBg.type === 'video' ? (
                                    <video ref={liveVideoRef} src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" autoPlay loop muted={isVideoMuted} playsInline />
                                  ) : displayBg?.url ? (
                                    <img src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="bg" />
                                  ) : null}
                                  
                                  {displayBg?.type === 'ndi' && (
                                    <div className="absolute inset-0 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
                                      <div className="text-center z-10 select-none">
                                        <Radio size={20} className="text-red-400 mx-auto animate-pulse mb-1" />
                                        <span className="text-[10px] font-mono text-white/80 block uppercase tracking-wider">{displayBg.fileName || 'NDI Input'}</span>
                                        <span className="text-[9px] font-mono text-emerald-400">1080p60 • LIVE NDI</span>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {!isCleared && !displayClearText && displaySlide && getStyleForOutput(mainConfig, globalSettings)?.activeLayers.slide !== false && (
                                    <SmartTextLayout
                                      text={displaySlide.text}
                                      source={displaySlide.source}
                                      type={displaySlide.type}
                                      animation={resolveSlideForOutput(displaySlide, mainConfig, undefined, getStyleForOutput(mainConfig, globalSettings)).animation}
                                      styleOverrides={resolveSlideForOutput(displaySlide, mainConfig, undefined, getStyleForOutput(mainConfig, globalSettings)).styleOverrides}
                                      className="relative z-10 w-full h-full"
                                    />
                                  )}
                                  
                                  {isCleared && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/40 backdrop-blur-sm z-20"><span className="text-neutral-500 font-bold tracking-widest uppercase text-base flex items-center gap-2"><EyeOff size={32}/></span></div>
                                  )}
                                  {isLocked && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 backdrop-blur-[2px] z-30"><Lock size={48} className="text-red-500 bg-black/60 p-2.5 rounded-full shadow-[0_0_25px_rgba(239,68,68,0.8)]" /></div>
                                  )}
                                  {liveState.isPresenting && !isCleared && !isLocked && (
                                     <div className="absolute top-3 right-3 bg-red-600 text-white text-[10px] tracking-widest font-bold px-2 py-0.5 rounded shadow-[0_0_15px_rgba(239,68,68,1)] z-40 animate-pulse">LIVE</div>
                                  )}

                                  {!displayBg && (!displaySlide || displayClearText || isCleared) && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-transparent"><span className="text-white/5 font-bold tracking-widest uppercase text-2xl">Black</span></div>
                                  )}
                              </>
                            )
                        })()}
                    </FixedStage>
                 </div>
              </div>

              {/* SIDE SCREENS (Stacked) */}
              <div className="w-48 xl:w-56 2xl:w-64 flex flex-col gap-2 shrink-0 h-full overflow-y-auto custom-scrollbar pr-1">
                 {otherOutputs.map(out => {
                    const isOutLocked = !!liveState.lockedOutputs?.[out.id];
                    const isOutCleared = !!liveState.clearedOutputs?.[out.id];

                    return (
                        <div key={out.id} className="flex flex-col shrink-0 min-h-0 flex-1">
                           <div className="flex justify-between items-center mb-1.5 px-1">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-[#a1a1aa]">{out.name}</span>
                              <div className="flex items-center gap-1">
                                 <button onClick={() => toggleLockOutput(out.id)} className={`text-[10px] uppercase font-bold tracking-widest px-1 ${isOutLocked ? 'text-red-500' : 'text-neutral-600 hover:text-white transition-colors'}`}>Lock</button>
                                 <button onClick={() => toggleClearOutput(out.id)} className={`p-0.5 rounded transition-colors text-neutral-600 hover:text-white hover:bg-white/10 ${isOutCleared ? 'text-red-500' : ''}`}><EyeOff size={10} /></button>
                                 <button onClick={() => openProjector(out.id)} className="text-neutral-600 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors"><LaunchIcon size={10} /></button>
                              </div>
                           </div>
                           <div className={`flex-1 aspect-video bg-black rounded-xl border overflow-hidden relative shadow-inner ${liveState.isPresenting && !isOutLocked && !isOutCleared ? 'border-white/10' : 'border-transparent opacity-50 grayscale-[50%]'}`}>
                               <FixedStage className="w-full h-full pointer-events-none bg-black">
                                  {(() => {
                                     const frozenState = liveState.frozenStates?.[out.id];
                                     const displaySlide = isOutLocked ? frozenState?.slide : liveState.slide;
                                     const rawOutBg = isOutLocked ? frozenState?.bg : (liveState.globalBackground || out.defaultBackground);
                                     const displayBg = resolveOutputBackground(rawOutBg, out, globalSettings);
                                     const displayClearText = isOutLocked ? frozenState?.clearText : liveState.clearText;
                                     const hideBg = isOutCleared;

                                     const isTransparentNdi = out.outputType === 'ndi' && out.ndiTransparent !== false;

                                     return (
                                       <>
                                          {isTransparentNdi && !displayBg && !hideBg && (
                                             <div 
                                               className="absolute inset-0 w-full h-full"
                                               style={{
                                                 backgroundImage: 'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
                                                 backgroundSize: '12px 12px',
                                                 backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                                                 backgroundColor: '#09090b'
                                               }}
                                             />
                                          )}
                                          {!hideBg && displayBg?.type === 'color' && <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: displayBg.color || '#000' }}></div>}
                                          {!hideBg && displayBg?.url && displayBg.type === 'video' ? (
                                             <video className="bg-video-player absolute inset-0 w-full h-full object-cover opacity-80" src={displayBg.url} autoPlay loop muted playsInline />
                                          ) : !hideBg && displayBg?.url ? (
                                             <img src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="bg" />
                                          ) : null}

                                          {!hideBg && displayBg?.type === 'ndi' && (
                                             <div className="absolute inset-0 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
                                               <div className="text-center z-10 select-none">
                                                 <Radio size={16} className="text-red-400 mx-auto animate-pulse mb-1" />
                                                 <span className="text-[9px] font-mono text-white/80 block uppercase tracking-wider">{displayBg.fileName || 'NDI Input'}</span>
                                               </div>
                                             </div>
                                          )}
                                          
                                          {!isOutCleared && !displayClearText && displaySlide && getStyleForOutput(out, globalSettings)?.activeLayers.slide !== false && (
                                             <SmartTextLayout
                                               text={displaySlide.text}
                                               source={displaySlide.source}
                                               type={displaySlide.type}
                                               animation={resolveSlideForOutput(displaySlide, out, undefined, getStyleForOutput(out, globalSettings)).animation} 
                                               styleOverrides={resolveSlideForOutput(displaySlide, out, undefined, getStyleForOutput(out, globalSettings)).styleOverrides} 
                                               className="relative z-10 w-full h-full" 
                                             />
                                          )}

                                          {out.outputType === 'ndi' && (
                                             <div className="absolute bottom-1 left-1 bg-blue-600/70 backdrop-blur-sm text-white text-[8px] font-mono font-bold px-1 rounded z-30">
                                               {out.ndiTransparent !== false ? 'NDI RGBA' : 'NDI OUT'}
                                             </div>
                                          )}

                                          {isOutCleared && (
                                             <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm z-20"><span className="text-neutral-500 flex items-center gap-1"><EyeOff size={24}/></span></div>
                                          )}
                                          {isOutLocked && (
                                             <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 backdrop-blur-[2px] z-30"><Lock size={32} className="text-red-500 bg-black/60 p-2 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)]" /></div>
                                          )}
                                          {liveState.isPresenting && !isOutCleared && !isOutLocked && (
                                              <div className="absolute top-2 right-2 bg-red-600 text-white text-[8px] tracking-widest font-bold px-1.5 py-0.5 rounded shadow-[0_0_10px_rgba(239,68,68,1)] z-40 animate-pulse">LIVE</div>
                                          )}
                                       </>
                                     )
                                  })()}
                               </FixedStage>
                           </div>
                        </div>
                    );
                 })}
              </div>
          </div>
       </div>
     );
  };

  // --- FREESHOW-STYLE OUTPUT PREVIEW THUMBNAILS ---
  // What a stage output shows right now (the projector window draws the same)
  const getStageLiveData = (out: OutputSettings): StageLiveData => {
    const locked = !!liveState.lockedOutputs?.[out.id];
    const frozen = liveState.frozenStates?.[out.id];
    return {
      slide: locked ? frozen?.slide : liveState.slide,
      nextSlide: stageInfo.nextSlide,
      songTitle: stageInfo.songTitle,
      hideText: !!liveState.clearedOutputs?.[out.id] || !!(locked ? frozen?.clearText : liveState.clearText),
    };
  };
  const renderStageScreenFor = (out: OutputSettings) => {
    const live = getStageLiveData(out);
    const style = getStyleForOutput(out, globalSettings);
    return (
      <StageScreen
        layout={stageLayoutFor(style, live.slide, globalSettings.stageLayouts)}
        slide={live.slide}
        nextSlide={live.nextSlide}
        songTitle={live.songTitle}
        background={style?.backgroundColor}
        hideText={live.hideText}
      />
    );
  };

  const renderOutputMonitorCard = (out: OutputSettings) => {
    const isOutLocked = !!liveState.lockedOutputs?.[out.id];
    const isOutCleared = !!liveState.clearedOutputs?.[out.id];
    const frozenState = liveState.frozenStates?.[out.id];
    const displaySlide = isOutLocked ? frozenState?.slide : liveState.slide;
    const rawCardBg = isOutLocked ? frozenState?.bg : (liveState.globalBackground || out.defaultBackground);
    const displayBg = resolveOutputBackground(rawCardBg, out, globalSettings);
    const displayClearText = isOutLocked ? frozenState?.clearText : liveState.clearText;
    const isLive = liveState.isPresenting && !isOutCleared && !isOutLocked;
    const isStage = isStageOutput(out);

    return (
      <div key={out.id} className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-1 mb-1">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : 'bg-neutral-600'}`} />
            <span className="text-[11px] font-bold text-neutral-300 truncate">{out.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isStage && <span className="text-[9px] font-bold px-1 py-0.5 bg-amber-500/15 text-amber-400 rounded">STAGE</span>}
            {out.outputType === 'ndi' && (
              <span className="text-[9px] font-bold px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded">NDI</span>
            )}
          </div>
        </div>
        <div 
          onClick={() => openProjector(out.id)}
          className={`aspect-video w-full rounded-lg border-2 overflow-hidden relative bg-black cursor-pointer shadow-md transition-all ${
            isLive ? 'border-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.35)]' : 'border-white/10 hover:border-pink-500/50'
          }`}
          title={`Click to launch ${out.name} projector window`}
        >
          {/* NDI Transparent Checkerboard */}
          {out.outputType === 'ndi' && out.ndiTransparent && (
            <div className="absolute inset-0 bg-[radial-gradient(#33334d_1px,transparent_1px)] [background-size:8px_8px] bg-[#0c0c14] pointer-events-none" />
          )}

          <FixedStage className="w-full h-full pointer-events-none bg-transparent">
            {isStage ? renderStageScreenFor(out) : (
              <AudienceOutputContent
                output={out}
                settings={globalSettings}
                slide={displaySlide}
                background={displayBg}
                hideBackground={isOutCleared && out.id !== 'main'}
                hideText={isOutCleared || !!displayClearText}
                muted
              />
            )}

            {isOutCleared && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60"><EyeOff size={16} className="text-neutral-500" /></div>
            )}
            {isOutLocked && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-950/40"><Lock size={16} className="text-red-500" /></div>
            )}
            {isLive && (
              <div className="absolute top-1.5 right-1.5 bg-red-600 text-white text-[8px] tracking-widest font-bold px-1 py-0.5 rounded shadow z-30">LIVE</div>
            )}
          </FixedStage>
        </div>
      </div>
    );
  };

  // --- PROJECTS SIDEBAR (TOP-LEFT) ---
  const renderProjectsSidebar = () => {
    return (
      <div className="w-52 lg:w-56 bg-[#101015] border-r border-[#262635] flex flex-col shrink-0 select-none overflow-hidden">
        {/* Header */}
        <div className="h-10 px-3 border-b border-[#262635] flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-white tracking-wide">Projects</span>
          <button className="text-neutral-400 hover:text-white p-1 rounded transition-colors"><MoreHorizontal size={14} /></button>
        </div>

        {/* Tree Section */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          <div className="text-[10px] uppercase font-bold text-neutral-500 px-2 pt-1 pb-0.5">Unlabeled</div>
          
          {/* Active Project Folder */}
          <div 
            onClick={() => setActiveTab('setlist')}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
              activeTab === 'setlist' 
                ? 'bg-pink-500/15 border-l-2 border-pink-500 text-pink-300 font-semibold shadow-sm' 
                : 'hover:bg-white/5 text-neutral-400 border-l-2 border-transparent'
            }`}
          >
            <Folder size={14} className={activeTab === 'setlist' ? 'text-pink-400' : 'text-neutral-500'} />
            <span className="text-xs truncate">{selectedProjectFolder}</span>
          </div>

          {/* Items in Project / Setlist */}
          <div className="pl-4 space-y-0.5 pt-1">
            {serviceSetlist.items.map((item) => {
              if (item.type === 'header') {
                return (
                  <div key={item.id} className="pt-2 pb-0.5 px-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.headerColor || '#ec4899' }} />
                    <span className="truncate">{item.title}</span>
                  </div>
                );
              }
              const isItemActive = activeSetlistItemId === item.id && activeTab === 'setlist';
              return (
                <div 
                  key={item.id}
                  onClick={() => {
                    setActiveTab('setlist');
                    setActiveSetlistItemId(item.id);
                    if (item.slides && item.slides.length > 0) {
                      setPreviewSlide(item.slides[0]);
                      goLive(item.slides[0]);
                    }
                  }}
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                    isItemActive ? 'bg-pink-500/20 text-white font-medium' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <FileText size={12} className={isItemActive ? 'text-pink-400' : 'text-neutral-500'} />
                  <span className="truncate">{item.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons Stack */}
        <div className="p-3 border-t border-[#262635] space-y-1.5 relative shrink-0">
          <button 
            onClick={() => setActiveTab('setlist')}
            className="w-full py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-2 border border-white/5 transition-colors font-medium"
          >
            <FileText size={13} className="text-pink-400" />
            Project
          </button>
          <button 
            onClick={() => {
              const name = prompt('New Folder Name:');
              if (name && name.trim()) setSelectedProjectFolder(name.trim());
            }}
            className="w-full py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-2 border border-white/5 transition-colors font-medium"
          >
            <Folder size={13} className="text-neutral-400" />
            Folder
          </button>
          <button 
            onClick={() => setIsTemplateGalleryOpen(true)}
            className="w-full py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-2 border border-white/5 transition-colors font-medium"
          >
            <LayoutTemplate size={13} className="text-neutral-400" />
            Project template
          </button>
          <button 
            onClick={() => {
              const fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.accept = '.json,.xml,.txt';
              fileInput.onchange = (e: any) => {
                const file = e.target?.files?.[0];
                if (file) alert(`Selected file: ${file.name}`);
              };
              fileInput.click();
            }}
            className="w-full py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-2 border border-white/5 transition-colors font-medium"
          >
            <Upload size={13} className="text-neutral-400" />
            Import
          </button>

          {/* Round Pink Plus Button */}
          <button 
            onClick={() => setIsAddSongModalOpen(true)}
            className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-pink-600 hover:bg-pink-500 text-white flex items-center justify-center shadow-lg shadow-pink-600/30 transition-all hover:scale-105"
            title="Create New Item"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    );
  };

  // The slides the Show grid lists: the open setlist item's, otherwise the open song's
  const getShownSlides = (): { title: string; slides: SlideDefinition[] } => {
    if (activeTab === 'setlist') {
      const item = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
      if (item?.slides) return { title: item.title, slides: item.slides };
    }
    const song = songsList[activeItemIndex];
    return { title: song?.title || 'Welcome', slides: song?.slides || [] };
  };

  // --- CENTER SLIDE GRID / WORKSPACE (TOP-CENTER) ---
  const renderCenterSlideArea = () => {
    if (appMode === 'design') return renderDesignWorkspace();

    // Stage tab: what the stage screens show, and the layouts their Stage styles use
    if (appMode === 'stage') {
      const stageOutputs = globalSettings.outputs.filter(isStageOutput);
      return (
        <StageWorkspace
          outputs={stageOutputs}
          selectedOutputId={stageOutputId}
          onSelectOutput={setStageOutputId}
          styles={globalSettings.styles.filter(s => styleKind(s) === 'stage')}
          customLayouts={globalSettings.stageLayouts || []}
          onSetOutputStyle={(outputId, styleId) => setGlobalSettings(prev => ({ ...prev, outputs: prev.outputs.map(o => o.id === outputId ? { ...o, styleId } : o) }))}
          onChangeLayouts={(layouts, style) => setGlobalSettings(prev => ({
            ...prev,
            stageLayouts: layouts,
            styles: style ? prev.styles.map(s => s.id === style.id ? style : s) : prev.styles,
          }))}
          getLive={getStageLiveData}
          onAddStageOutput={() => {
            const out = createOutput('hdmi', 'stage', globalSettings.outputs, globalSettings.styles);
            setGlobalSettings(prev => ({ ...prev, outputs: [...prev.outputs, out] }));
            setStageOutputId(out.id);
          }}
        />
      );
    }

    const { title: activeTitle, slides: currentSlides } = getShownSlides();
    // Room for group names under the slides, only when the song has groups
    const hasGroups = currentSlides.some(s => s.group);

    return (
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d0d12] relative overflow-hidden select-none">
        {/* Slide Area Header */}
        <div className="h-10 px-4 border-b border-[#262635] flex items-center justify-between shrink-0 bg-[#101015]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white tracking-wide">{activeTitle}</h2>
            <button className="text-neutral-500 hover:text-white p-1 rounded transition-colors"><MoreHorizontal size={14} /></button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Design this song: the slide on air when it's one of these, otherwise the first slide
                const onAir = currentSlides.some(s => s.id === liveState.slide?.id);
                openDesign(onAir ? null : currentSlides[0]?.id ?? null);
              }}
              className="text-xs text-neutral-300 hover:text-white px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/5 transition-colors font-medium flex items-center gap-1"
              title="Open this song in Design"
            >
              <Edit2 size={12} />
              Edit
            </button>
          </div>
        </div>

        {/* Slide Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {currentSlides.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-sm gap-2">
              <FileText size={32} className="opacity-30" />
              <span>No slides available in {activeTitle}</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 content-start">
              {currentSlides.map((slide, i) => {
                const isLive = liveState.slide?.id === slide.id;
                const isPreview = previewSlide?.id === slide.id;
                const currentSlideId = previewSlide?.id || liveState.slide?.id;
                const currentIndex = currentSlides.findIndex(s => s.id === currentSlideId);
                const isNextLogical = currentIndex !== -1 && i === currentIndex + 1;

                // The group's name goes under the first slide of each run (Verse 1, Chorus, Verse 2, Chorus…)
                const startsGroup = !!slide.group && currentSlides[i - 1]?.group !== slide.group;

                return (
                  <div key={slide.id} className="flex flex-col gap-1 min-w-0">
                  <div
                    draggable
                    onDragStart={(e) => { setDraggedSlideIndex(i); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverSlideIndex(i); }}
                    onDrop={(e) => { e.preventDefault(); handleDropSlide(i); }}
                    onContextMenu={(e) => handleContextMenu(e, 'slide', i)}
                    onClick={() => {
                      if (!slide.disabled) {
                        setPreviewSlide(slide);
                        goLive(slide);
                      }
                    }}
                    className={`group aspect-video rounded-xl cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden bg-black shadow-lg ${
                      slide.disabled ? 'opacity-30 cursor-not-allowed' : ''
                    } ${
                      isLive 
                        ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.35)] ring-1 ring-pink-500' 
                        : isPreview 
                        ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.25)]' 
                        : isNextLogical 
                        ? 'border-dashed border-white/30 bg-[#0a0a0f]' 
                        : 'border-white/5 hover:border-pink-500/40'
                    }`}
                  >
                    <FixedStage className="w-full h-full pointer-events-none">
                      <SmartTextLayout 
                        text={slide.text} 
                        source={slide.source} 
                        type={slide.type} 
                        styleOverrides={applyGlobalStyles(slide, liveState.settings?.outputs.find(o => o.id === 'main'), liveState.settings)} 
                      />
                    </FixedStage>

                    {/* Slide Number Badge */}
                    <div className="absolute top-2 left-2 z-10">
                      <span className="text-[10px] font-bold text-neutral-400 bg-black/80 px-1.5 py-0.5 rounded border border-white/10 backdrop-blur-sm">
                        {i + 1}
                      </span>
                    </div>
                  </div>
                  {hasGroups && (
                    <div className="h-4 px-0.5 flex items-center min-w-0">
                      {startsGroup && (
                        <span className={`flex items-center gap-1.5 min-w-0 text-[10px] font-bold uppercase tracking-wide ${groupColors(slide.group!).text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${groupColors(slide.group!).dot}`} />
                          <span className="truncate">{slide.group}</span>
                        </span>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- DESIGN MODE ---
  // The slide whose look an output is showing: frozen slide if locked, else what's live, else the preview/active song.
  const getOnAirSlide = (outputId: string): SlideDefinition | null => {
    if (liveState.lockedOutputs?.[outputId]) return liveState.frozenStates?.[outputId]?.slide ?? null;
    return liveState.slide || previewSlide || songsList[activeItemIndex]?.slides?.[0] || null;
  };
  const getSongForSlide = (slide: SlideDefinition | null) =>
    (slide && songsList.find(song => song.slides.some(s => s.id === slide.id))) || songsList[activeItemIndex];
  const findSlideById = (id: string | null | undefined): SlideDefinition | null => {
    if (!id) return null;
    for (const song of songsList) {
      const s = song.slides.find(x => x.id === id);
      if (s) return s;
    }
    return liveState.slide?.id === id ? liveState.slide : null;
  };
  // Design mode works on the slide picked in its strip, otherwise it follows what's on air
  const getDesignSlide = (outputId: string): SlideDefinition | null => {
    const picked = findSlideById(designSlideId);
    if (picked) return picked;
    const onAir = getOnAirSlide(outputId);
    return findSlideById(onAir?.id) || onAir;
  };

  const getOutputTemplateInfo = (outputId: string, slide: SlideDefinition | null): OutputTemplateInfo => {
    const out = globalSettings.outputs.find(o => o.id === outputId);
    const style = getStyleForOutput(out, globalSettings);
    const { templateId, source } = resolveTemplateSource(slide, out, undefined, style);
    return { templateId, source, styleName: style?.name };
  };

  // Rewrite every slide of a song (and the copies held as live/preview slides) with fn
  const updateSongSlides = (songId: string, fn: (s: SlideDefinition) => SlideDefinition, songPatch: Partial<(typeof songsList)[number]> = {}) => {
    const song = songsList.find(s => s.id === songId);
    if (!song) return;
    const inSong = (s: SlideDefinition | null) => !!s && song.slides.some(x => x.id === s.id);
    setSongsList(prev => prev.map(s => s.id === songId ? { ...s, ...songPatch, slides: s.slides.map(fn) } : s));
    setLiveState(prev => inSong(prev.slide) ? { ...prev, slide: fn(prev.slide!) } : prev);
    setPreviewSlide(prev => inSong(prev) ? fn(prev!) : prev);
  };

  const handleAssignLiveTemplate = (outputId: string, templateId: string, slide: SlideDefinition | null) => {
    const info = getOutputTemplateInfo(outputId, slide);
    const out = globalSettings.outputs.find(o => o.id === outputId);

    if (info.source === 'style' && out?.styleId) {
      const key = slide?.type === 'scripture' ? 'scriptureTemplateId' : 'lyricsTemplateId';
      setGlobalSettings(prev => ({ ...prev, styles: prev.styles.map(st => st.id === out.styleId ? { ...st, [key]: templateId } : st) }));
      return;
    }
    const song = getSongForSlide(slide);
    if (song) {
      updateSongSlides(song.id, s => {
        const linked = linkSlideToTemplate(s, templateId);
        if (!linked.outputTemplates?.[outputId]) return linked;
        const { [outputId]: _, ...rest } = linked.outputTemplates;
        return { ...linked, outputTemplates: rest };
      }, { templateId });
      return;
    }
    setGlobalSettings(prev => ({ ...prev, outputs: prev.outputs.map(o => o.id === outputId ? { ...o, defaultTemplateId: templateId } : o) }));
  };

  // Change slides everywhere they are held: their song, the live copy and the preview copy
  const updateSlidesById = (ids: Set<string>, fn: (s: SlideDefinition) => SlideDefinition) => {
    if (ids.size === 0) return;
    const apply = (s: SlideDefinition) => ids.has(s.id) ? fn(s) : s;
    setSongsList(prev => prev.map(song => song.slides.some(s => ids.has(s.id)) ? { ...song, slides: song.slides.map(apply) } : song));
    setLiveState(prev => prev.slide && ids.has(prev.slide.id) ? { ...prev, slide: fn(prev.slide) } : prev);
    setPreviewSlide(prev => prev && ids.has(prev.id) ? fn(prev) : prev);
  };

  const handleEditSlideText = (slideId: string, text: string) => updateSlidesById(new Set([slideId]), s => ({ ...s, text }));

  // Set (or clear) one slide's design for one output; an empty design is removed so the slide falls back to its template
  const withDesign = (s: SlideDefinition, outputId: string, design: SlideDesign | undefined): SlideDefinition => {
    const { [outputId]: _previous, ...others } = s.designs || {};
    const designs = hasDesignContent(design) ? { ...others, [outputId]: design } : others;
    return { ...s, designs: Object.keys(designs).length ? designs : undefined };
  };

  // Show one output's text boxes (and hidden lyrics) for this slide on every other enabled output
  const sendTextBoxesToAllScreens = (slideId: string, fromOutputId: string) => {
    const targets = globalSettings.outputs.filter(o => o.enabled && !isStageOutput(o) && o.id !== fromOutputId).map(o => o.id);
    updateSlidesById(new Set([slideId]), s => {
      const source = s.designs?.[fromOutputId];
      return targets.reduce((acc, id) => withDesign(acc, id, {
        ...(acc.designs?.[id] || {}),
        customBoxes: source?.customBoxes,
        hideLyrics: source?.hideLyrics,
      }), s);
    });
    return targets.length;
  };

  // Split a slide's lines into two slides (the second half follows it); both halves keep the slide's designs
  const handleSplitSlideById = (slideId: string) => {
    const lines = findSlideById(slideId)?.text.split('\n') || [];
    if (lines.length <= 1) return;
    const mid = Math.ceil(lines.length / 2);
    const firstText = lines.slice(0, mid).join('\n');
    const secondText = lines.slice(mid).join('\n');
    const newId = `s-${Date.now()}`;
    setSongsList(prev => prev.map(song => {
      const idx = song.slides.findIndex(s => s.id === slideId);
      if (idx < 0) return song;
      const slide = song.slides[idx];
      const slides = [...song.slides];
      slides.splice(idx, 1, { ...slide, text: firstText }, { ...slide, text: secondText, id: newId });
      return { ...song, slides };
    }));
    setLiveState(prev => prev.slide?.id === slideId ? { ...prev, slide: { ...prev.slide, text: firstText } } : prev);
    setPreviewSlide(prev => prev?.id === slideId ? { ...prev, text: firstText } : prev);
  };

  // Insert a new slide into a song at a position (0 = first). It uses the same template as the slide
  // beside it, but not that slide's own design. Returns the new slide's id.
  const handleInsertSlide = (songId: string, index: number): string => {
    const id = `s-${Date.now()}`;
    setSongsList(prev => prev.map(song => {
      if (song.id !== songId) return song;
      const neighbour = song.slides[index - 1] || song.slides[index];
      const slide: SlideDefinition = {
        id,
        text: 'New slide',
        type: neighbour?.type === 'scripture' ? 'scripture' : 'lyrics',
        templateId: neighbour?.templateId,
        outputTemplates: neighbour?.outputTemplates,
      };
      const slides = [...song.slides];
      slides.splice(Math.max(0, Math.min(index, slides.length)), 0, slide);
      return { ...song, slides };
    }));
    return id;
  };

  // Move slides (kept in their current order) so they sit just before position `beforeIndex` of the song.
  const handleMoveSlides = (songId: string, slideIds: string[], beforeIndex: number) => {
    const song = songsList.find(s => s.id === songId);
    if (!song) return;
    const moving = new Set(slideIds);
    const moved = song.slides.filter(s => moving.has(s.id));
    const rest = song.slides.filter(s => !moving.has(s.id));
    const at = song.slides.slice(0, beforeIndex).filter(s => !moving.has(s.id)).length;
    rest.splice(at, 0, ...moved);
    if (rest.every((s, i) => s.id === song.slides[i].id)) return; // same order: nothing to do (and nothing to undo)
    setSongsList(prev => prev.map(s => s.id === songId ? { ...s, slides: rest } : s));
  };

  // ─── Slide groups (Verse 1, Chorus, Bridge…) ───
  // Replace a song, keeping the live and preview slide copies in step (the screens follow)
  const updateSong = (songId: string, fn: (song: PresentationItem) => PresentationItem) => {
    const song = songsList.find(s => s.id === songId);
    if (!song) return;
    const next = fn(song);
    setSongsList(prev => prev.map(s => s.id === songId ? next : s));
    const byId = new Map(next.slides.map(s => [s.id, s] as const));
    setLiveState(prev => prev.slide && byId.has(prev.slide.id) ? { ...prev, slide: byId.get(prev.slide.id)! } : prev);
    setPreviewSlide(prev => prev && byId.has(prev.id) ? byId.get(prev.id)! : prev);
  };

  // Give a slide its group's saved look, if the group has one. The group's look replaces the slide's own
  // font, size, colours, position and motion on every screen; its word styles and text boxes stay.
  const applyGroupLook = (slide: SlideDefinition, look: GroupLook | undefined): SlideDefinition => {
    if (!look) return slide;
    let next: SlideDefinition = { ...(look.templateId ? linkSlideToTemplate(slide, look.templateId) : slide), outputTemplates: look.outputTemplates };
    for (const [outputId, design] of Object.entries(next.designs || {})) next = withDesign(next, outputId, withoutOwnLook(design));
    for (const [outputId, design] of Object.entries(look.designs || {})) next = withDesign(next, outputId, design);
    return next;
  };

  // Slides that join a group take on its look; slides already in it keep theirs
  const handleSetSlideGroup = (songId: string, slideIds: string[], group: string | undefined) => {
    const ids = new Set(slideIds);
    updateSong(songId, song => ({
      ...song,
      slides: song.slides.map(s => !ids.has(s.id) || s.group === group ? s
        : applyGroupLook({ ...s, group }, group ? song.groupLooks?.[group] : undefined)),
    }));
  };

  // Give every slide of a group (and slides tagged with it later) one slide's whole look:
  // its template and its design on every screen
  const handleUseLookForGroup = (songId: string, group: string, fromSlideId: string) => {
    updateSong(songId, song => {
      const source = song.slides.find(s => s.id === fromSlideId);
      if (!source) return song;
      const copyLook = (s: SlideDefinition): SlideDefinition => ({
        ...(source.templateId ? linkSlideToTemplate(s, source.templateId) : s),
        outputTemplates: source.outputTemplates,
        designs: source.designs,
      });
      return {
        ...song,
        groupLooks: { ...(song.groupLooks || {}), [group]: { templateId: source.templateId, outputTemplates: source.outputTemplates, designs: source.designs } },
        slides: song.slides.map(s => s.group === group && s.id !== source.id ? copyLook(s) : s),
      };
    });
  };

  // The group's slides take the template on every screen: their own font, size, colours, position and
  // motion edits and any per-screen template go (a display style's template still wins on its screen)
  const handleSetGroupTemplate = (songId: string, group: string, templateId: string) => {
    updateSong(songId, song => {
      const keptDesigns = Object.entries(song.groupLooks?.[group]?.designs || {})
        .map(([outputId, d]) => [outputId, withoutOwnLook(d)] as const)
        .filter(([, d]) => hasDesignContent(d));
      return {
        ...song,
        groupLooks: { ...(song.groupLooks || {}), [group]: { templateId, designs: keptDesigns.length ? Object.fromEntries(keptDesigns) : undefined } },
        // Each slide keeps its own word styles and text boxes
        slides: song.slides.map(s => s.group === group ? applyGroupLook(s, { templateId }) : s),
      };
    });
  };

  // Re-detecting only gives a group's look to slides whose group changed
  const handleAutoGroup = (songId: string) => {
    updateSong(songId, song => {
      const groups = detectGroups(song.slides.map(s => s.text));
      return {
        ...song,
        slides: song.slides.map((s, i) => groups[i] === s.group ? s
          : applyGroupLook({ ...s, group: groups[i] }, groups[i] ? song.groupLooks?.[groups[i]!] : undefined)),
      };
    });
  };

  // Remove a slide from its song. If it is on screen it stays there until the next slide goes live.
  const handleDeleteSlideById = (slideId: string) => {
    setSongsList(prev => prev.map(song => song.slides.some(s => s.id === slideId)
      ? { ...song, slides: song.slides.filter(s => s.id !== slideId) }
      : song));
    if (designSlideId === slideId) setDesignSlideId(null);
  };

  // --- DESIGN MODE: large live canvas of one screen ---
  const renderDesignWorkspace = () => {
    // Design is for audience screens; stage screens get their look from Stage styles
    const outputs = globalSettings.outputs.filter(o => o.enabled && !isStageOutput(o));
    if (outputs.length === 0) {
      return <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">Enable a normal (audience) output in Settings to design it.</div>;
    }
    const out = outputs.find(o => o.id === designOutputId) || outputs[0];
    const locked = !!liveState.lockedOutputs?.[out.id];
    const slide = getDesignSlide(out.id);
    const onAirId = locked ? liveState.frozenStates?.[out.id]?.slide?.id : liveState.slide?.id;
    const style = getStyleForOutput(out, globalSettings);
    const resolved = resolveSlideForOutput(slide, out, undefined, style);
    const rawBg = locked ? liveState.frozenStates?.[out.id]?.bg : (liveState.globalBackground || out.defaultBackground);
    const background = resolveOutputBackground(rawBg, out, globalSettings);
    const song = getSongForSlide(slide);
    const setDesignOn = (ids: string[], design: SlideDesign | undefined) =>
      updateSlidesById(new Set(ids), s => withDesign(s, out.id, design));

    return (
      <LiveDesignWorkspace
        outputs={outputs}
        selectedOutputId={out.id}
        onSelectOutput={setDesignOutputId}
        templates={inlineTemplates}
        templateInfo={getOutputTemplateInfo(out.id, slide)}
        onAssignTemplate={(templateId) => handleAssignLiveTemplate(out.id, templateId, slide)}
        look={{
          global: { ...(resolved.styleOverrides?.global || {}) },
          layout: { x: 0.05, y: 0.05, width: 0.9, height: 0.9, ...(resolved.styleOverrides?.layout || {}) },
          animation: resolved.animation,
          words: resolved.styleOverrides?.words,
          lines: resolved.styleOverrides?.lines,
        }}
        design={slide?.designs?.[out.id]}
        onChangeDesign={(fn) => { if (slide) updateSlidesById(new Set([slide.id]), s => withDesign(s, out.id, fn(s.designs?.[out.id] || {}))); }}
        onCopyDesign={(toIds) => { if (slide) setDesignOn(toIds, slide.designs?.[out.id]); }}
        onResetDesign={(ids) => setDesignOn(ids, undefined)}
        textHidden={style?.activeLayers.slide === false}
        status={{
          presenting: !!liveState.isPresenting,
          textCleared: !!(liveState.clearedOutputs?.[out.id] || liveState.clearText),
          locked,
        }}
        slideIsOnAir={!!slide && slide.id === onAirId}
        followingLive={!findSlideById(designSlideId)}
        renderOutput={(scrollPreviewPos, draftDesign, highlightWordIndex) => (
          // A draft (an edit still being dragged) shows here only; the screens keep the saved design
          <AudienceOutputContent
            output={out}
            settings={globalSettings}
            slide={slide && draftDesign !== undefined ? withDesign(slide, out.id, draftDesign) : slide}
            background={background}
            muted
            scrollPreviewPos={scrollPreviewPos}
            highlightWordIndex={highlightWordIndex}
            designPreview
          />
        )}
        slideText={slide ? slide.text : null}
        onEditSlideText={(text) => { if (slide) handleEditSlideText(slide.id, text); }}
        onSendTextBoxesToAllScreens={() => slide ? sendTextBoxesToAllScreens(slide.id, out.id) : 0}
        canSplit={!!slide && slide.text.split('\n').length > 1}
        onSplitSlide={() => { if (slide) handleSplitSlideById(slide.id); }}
        onInsertSlide={song ? (index) => { const id = handleInsertSlide(song.id, index); setDesignSlideId(id); return id; } : undefined}
        onDeleteSlide={handleDeleteSlideById}
        onMoveSlides={song ? (ids, beforeIndex) => handleMoveSlides(song.id, ids, beforeIndex) : undefined}
        onSetSlideGroup={song ? (ids, group) => handleSetSlideGroup(song.id, ids, group) : undefined}
        onUseLookForGroup={song ? (group, fromSlideId) => handleUseLookForGroup(song.id, group, fromSlideId) : undefined}
        songTitle={song?.title}
        slides={song?.slides || []}
        liveSlideId={liveState.slide?.id}
        canvasSlideId={slide?.id}
        canvasSlide={slide}
        onPickSlide={(s) => setDesignSlideId(s.id)}
        onGoLive={(s) => { goLive(s); setDesignSlideId(null); }}
        onFollowLive={() => setDesignSlideId(null)}
      />
    );
  };

  // --- ARRANGEMENT GROUPS (right panel): the song's sections instead of every slide ---
  // The song and "current slide" follow Design mode's canvas there, otherwise the open song and the slide on air
  const getGroupsContext = () => {
    if (appMode === 'design') {
      const out = globalSettings.outputs.find(o => o.enabled && o.id === designOutputId) || globalSettings.outputs.find(o => o.enabled);
      const slide = out ? getDesignSlide(out.id) : null;
      return { song: getSongForSlide(slide), current: slide };
    }
    const song = songsList[activeItemIndex];
    const inSong = (s: SlideDefinition | null) => !!s && !!song?.slides.some(x => x.id === s.id);
    return { song, current: inSong(liveState.slide) ? liveState.slide : inSong(previewSlide) ? previewSlide : null };
  };

  const renderGroupsPanel = () => {
    const { song, current } = getGroupsContext();
    if (!song) return <div className="text-xs text-neutral-500 px-1">No song open</div>;
    const groups: { name: string; slides: SlideDefinition[] }[] = [];
    song.slides.forEach(s => {
      if (!s.group) return;
      const existing = groups.find(g => g.name === s.group);
      if (existing) existing.slides.push(s);
      else groups.push({ name: s.group, slides: [s] });
    });
    const ungrouped = song.slides.filter(s => !s.group).length;
    // Click a group: design its first slide in Design mode, otherwise put it live
    const openGroup = (first: SlideDefinition) => {
      if (appMode === 'design') setDesignSlideId(first.id);
      else if (!first.disabled) goLive(first);
    };

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] uppercase font-bold text-neutral-500">Arrangement Groups</span>
          <button
            onClick={() => { handleAutoGroup(song.id); setUndoToast({ text: 'Slides grouped', at: Date.now(), kind: 'info' }); }}
            className="flex items-center gap-1 text-[10px] font-semibold text-neutral-400 hover:text-white transition-colors"
            title="Group the slides from section labels in the lyrics (like [Chorus] or Verse 2:), or else from repeated lyrics. Replaces the current groups; Ctrl+Z undoes it."
          >
            <Wand2 size={11} /> Auto-detect
          </button>
        </div>
        {groups.length === 0 && (
          <p className="text-[11px] text-neutral-500 px-1 leading-relaxed">
            No groups yet. Click Auto-detect, or in Design mode right-click slides → Set group.
          </p>
        )}
        {groups.map(g => {
          const c = groupColors(g.name);
          const isCurrent = !!current && g.slides.some(s => s.id === current.id);
          const templateId = song.groupLooks?.[g.name]?.templateId;
          const templateName = templateId ? getTemplateById(templateId)?.name : undefined;
          return (
            <div
              key={g.name}
              onClick={() => openGroup(g.slides[0])}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setGroupMenu({ x: e.clientX, y: e.clientY, songId: song.id, group: g.name }); }}
              className={`px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${isCurrent ? 'bg-white/15 ring-1 ring-white/20' : 'bg-white/5 hover:bg-white/10'}`}
              title={`Click to ${appMode === 'design' ? 'design' : 'show'} its first slide · right-click for the group's look`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                  <span className={`truncate font-semibold ${c.text}`}>{g.name}</span>
                </div>
                <span className="text-[10px] text-neutral-500 shrink-0">{g.slides.length} slide{g.slides.length === 1 ? '' : 's'}</span>
              </div>
              {templateName && <div className="pl-4 mt-0.5 text-[10px] text-neutral-500 truncate">Template: {templateName}</div>}
            </div>
          );
        })}
        {groups.length > 0 && ungrouped > 0 && (
          <div className="px-1 text-[10px] text-neutral-500">{ungrouped} slide{ungrouped === 1 ? '' : 's'} not in a group</div>
        )}
      </div>
    );
  };

  const renderGroupMenu = () => {
    if (!groupMenu) return null;
    const song = songsList.find(s => s.id === groupMenu.songId);
    if (!song) return null;
    const { current } = getGroupsContext();
    const currentIndex = current ? song.slides.findIndex(s => s.id === current.id) : -1;
    const close = () => setGroupMenu(null);
    return (
      <GroupMenu
        x={groupMenu.x}
        y={groupMenu.y}
        group={groupMenu.group}
        slideCount={song.slides.filter(s => s.group === groupMenu.group).length}
        templates={inlineTemplates}
        templateId={song.groupLooks?.[groupMenu.group]?.templateId}
        currentSlideLabel={currentIndex >= 0 ? `slide ${currentIndex + 1}` : undefined}
        onSetTemplate={(templateId) => {
          handleSetGroupTemplate(song.id, groupMenu.group, templateId);
          // A screen whose style sets a template keeps showing that one
          const key = song.slides.find(s => s.group === groupMenu.group)?.type === 'scripture' ? 'scriptureTemplateId' : 'lyricsTemplateId';
          const screens = globalSettings.outputs.filter(o => o.enabled && !isStageOutput(o));
          const styled = screens.filter(o => getStyleForOutput(o, globalSettings)?.[key]);
          const note = styled.length === 0 ? ''
            : styled.length === screens.length ? " · every screen keeps its style's template"
            : ` · ${styled.map(o => o.name).join(', ')} ${styled.length === 1 ? "keeps its style's template" : "keep their styles' templates"}`;
          setUndoToast({ text: `${groupMenu.group} now uses "${getTemplateById(templateId)?.name || 'that template'}"${note}`, at: Date.now(), kind: 'info' });
        }}
        onUseCurrentLook={() => {
          if (!current || currentIndex < 0) return;
          handleUseLookForGroup(song.id, groupMenu.group, current.id);
          setUndoToast({ text: `Every ${groupMenu.group} slide now looks like slide ${currentIndex + 1}`, at: Date.now(), kind: 'info' });
        }}
        onClose={close}
      />
    );
  };

  // --- OUTPUT PREVIEWS & CONTROLS (TOP-RIGHT) ---
  const renderRightOutputsPanel = () => {
    const enabledOutputs = globalSettings.outputs.filter(o => o.enabled);
    const activeSong = songsList[activeItemIndex];
    const totalSlides = activeSong?.slides?.length || 1;
    const currentSlideId = previewSlide?.id || liveState.slide?.id;
    const currentIdx = activeSong?.slides?.findIndex(s => s.id === currentSlideId);
    const currentSlideNum = currentIdx !== undefined && currentIdx >= 0 ? currentIdx + 1 : 1;

    return (
      <div className="w-64 lg:w-72 bg-[#101015] border-l border-[#262635] flex flex-col shrink-0 select-none overflow-hidden">
        {/* Top: Output Preview Monitors (Side by Side or Stacked) */}
        <div className="p-2.5 border-b border-[#262635] flex gap-2 overflow-x-auto shrink-0 bg-[#0d0d12]">
          {enabledOutputs.length === 0 ? (
            <div className="w-full text-center py-4 text-xs text-neutral-500">No enabled outputs</div>
          ) : (
            enabledOutputs.map(out => renderOutputMonitorCard(out))
          )}
        </div>

        {/* Transport Row (< > ⟳ 🔒 👁) */}
        <div className="px-3 py-2 border-b border-[#262635] flex items-center justify-around text-neutral-400 shrink-0 bg-[#121218]">
          <button onClick={handlePrevSlide} className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors" title="Previous Slide (ArrowLeft)"><ChevronLeft size={16} /></button>
          <button onClick={handleNextSlide} className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors" title="Next Slide (ArrowRight)"><ChevronRight size={16} /></button>
          <button onClick={() => { if (previewSlide) goLive(previewSlide); }} className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors" title="Replay Current Slide"><RotateCcw size={14} /></button>
          <button onClick={() => toggleLockOutput('main')} className={`p-1 rounded transition-colors ${liveState.lockedOutputs?.['main'] ? 'text-red-500 bg-red-500/10' : 'hover:text-white hover:bg-white/10'}`} title="Freeze Output"><Lock size={14} /></button>
          <button onClick={togglePresenting} className={`p-1 rounded transition-colors ${liveState.isPresenting ? 'text-pink-500 bg-pink-500/10' : 'hover:text-white hover:bg-white/10'}`} title="Master Live Toggle"><Eye size={15} /></button>
        </div>

        {/* Full-width Clear All Button */}
        <div className="px-3 py-2 border-b border-[#262635] shrink-0">
          <button 
            onClick={clearAll}
            className="w-full py-1.5 bg-[#25121b] hover:bg-[#341724] text-pink-500 hover:text-pink-400 border border-pink-500/40 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
          >
            <X size={14} />
            Clear all
          </button>
        </div>

        {/* Layer Clear Icons Row */}
        <div className="px-4 py-2 border-b border-[#262635] flex items-center justify-between text-neutral-400 shrink-0 bg-[#0d0d12]">
          <button onClick={() => setGlobalBackground(null)} title="Clear Background" className={`p-1.5 rounded transition-colors ${!liveState.globalBackground ? 'text-neutral-600' : 'text-neutral-300 hover:text-pink-400 hover:bg-white/5'}`}><ImageIcon size={15} /></button>
          <button onClick={toggleClearText} title="Clear Slide Text" className={`p-1.5 rounded transition-colors ${liveState.clearText ? 'text-pink-500 bg-pink-500/20 font-bold' : 'text-neutral-300 hover:text-pink-400 hover:bg-white/5'}`}><FileText size={15} /></button>
          <button title="Clear Overlays" className="p-1.5 rounded text-neutral-400 hover:text-pink-400 hover:bg-white/5 transition-colors"><Layers size={15} /></button>
          <button onClick={toggleMute} title="Mute Audio" className={`p-1.5 rounded transition-colors ${isVideoMuted ? 'text-neutral-600' : 'text-neutral-300 hover:text-pink-400 hover:bg-white/5'}`}><Music size={15} /></button>
          <button title="Timer" className="p-1.5 rounded text-neutral-400 hover:text-pink-400 hover:bg-white/5 transition-colors"><Clock size={15} /></button>
        </div>

        {/* Current Item Status Indicator */}
        <div className="px-3 py-1.5 border-b border-[#262635] flex items-center justify-between text-xs text-neutral-400 shrink-0 bg-[#121218]">
          <span className="font-semibold text-white truncate max-w-[140px]">{activeSong?.title || 'Welcome'}</span>
          <span className="font-mono text-neutral-500 text-[11px]">{currentSlideNum}/{totalSlides}</span>
        </div>

        {/* Inspector Tabs (Groups | Metadata) */}
        <div className="h-9 px-3 border-b border-[#262635] flex items-center gap-4 shrink-0 bg-[#101015]">
          <button
            onClick={() => setRightInspectorTab('groups')}
            className={`h-full text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 ${
              rightInspectorTab === 'groups' ? 'text-pink-400 border-pink-500' : 'text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            <List size={13} />
            Groups
          </button>
          <button 
            onClick={() => setRightInspectorTab('metadata')}
            className={`h-full text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 ${
              rightInspectorTab === 'metadata' ? 'text-pink-400 border-pink-500' : 'text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            <Info size={13} />
            Metadata
          </button>
        </div>

        {/* Inspector Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
          {rightInspectorTab === 'groups' ? renderGroupsPanel() : (
            <div className="space-y-3 text-xs">
              <div className="text-[10px] uppercase font-bold text-neutral-500">Show Properties</div>
              <div>
                <span className="text-neutral-500 block text-[10px]">Title</span>
                <span className="text-white font-medium">{activeSong?.title || 'Welcome'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">Category</span>
                <span className="text-neutral-300">{activeSong?.category || 'Presentations'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">Total Slides</span>
                <span className="text-neutral-300">{activeSong?.slides.length || 1}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">Default Template</span>
                <span className="text-neutral-300">Cinematic Ambient</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- BOTTOM HORIZONTAL LIBRARY & BROWSER ---
  const renderBottomBrowser = () => {
    const filteredSongs = songsList.filter(song => {
      if (selectedCategory === 'Presentations' && song.category !== 'Presentations') return false;
      if (selectedCategory === 'Songs' && song.category !== 'Songs') return false;
      if (!songSearchQuery.trim()) return true;
      const q = songSearchQuery.toLowerCase();
      return song.title.toLowerCase().includes(q) || song.slides.some(s => s.text.toLowerCase().includes(q));
    });

    const activeSong = songsList[activeItemIndex] || songsList[0];
    const presCount = songsList.filter(s => s.category === 'Presentations').length;
    const songsCount = songsList.filter(s => s.category === 'Songs').length;

    return (
      <div className="h-full bg-[#0c0c11] flex flex-col overflow-hidden select-none">
        {/* Horizontal Tab Strip across Top of Bottom Panel */}
        <div className="h-9 bg-[#101015] border-b border-[#262635] flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center space-x-1 lg:space-x-3 overflow-x-auto">
            {[
              { id: 'shows', label: 'Shows', icon: FileText },
              { id: 'media', label: 'Media', icon: ImageIcon },
              { id: 'templates', label: 'Templates', icon: Sparkles },
              { id: 'scripture', label: 'Scripture', icon: BookOpen },
              // hidden until needed: audio, overlays, calendar, functions
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = bottomTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setBottomTab(tab.id as any);
                    if (tab.id === 'media') setActiveTab('media');
                    else if (tab.id === 'audio') setActiveTab('audio');
                    else if (tab.id === 'scripture') setActiveTab('bibles');
                    else if (tab.id === 'shows') setActiveTab('songs');
                  }}
                  className={`h-full flex items-center gap-1.5 px-2.5 text-xs font-semibold transition-all border-b-2 ${
                    isActive 
                      ? 'text-pink-400 border-pink-500 font-bold' 
                      : 'text-neutral-400 border-transparent hover:text-white'
                  }`}
                >
                  <Icon size={13} className={isActive ? 'text-pink-400' : 'text-neutral-500'} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Box on Far Right */}
          <div className="relative w-44 lg:w-56 shrink-0">
            <Search size={13} className="absolute left-2.5 top-2 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Search" 
              value={songSearchQuery}
              onChange={(e) => setSongSearchQuery(e.target.value)}
              className="w-full bg-[#181822] border border-[#262635] rounded-md text-xs pl-8 pr-2 py-1 text-white placeholder:text-neutral-500 outline-none focus:border-pink-500 transition-colors"
            />
          </div>
        </div>

        {/* Content Body */}
        {bottomTab === 'shows' ? (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Sub-column 1: Categories */}
            <div className="w-48 bg-[#101015] border-r border-[#262635] p-3 flex flex-col shrink-0">
              <button 
                onClick={() => setSelectedCategory('all')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold mb-2 transition-colors ${
                  selectedCategory === 'all' ? 'bg-pink-500/15 text-pink-300' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>All</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">{songsList.length}</span>
              </button>

              <div className="text-[10px] uppercase font-bold text-neutral-500 px-1 mb-1">Categories</div>
              
              <button 
                onClick={() => setSelectedCategory('Presentations')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === 'Presentations' ? 'bg-pink-500/15 text-pink-300 font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText size={13} />
                  <span>Presentations</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">{presCount}</span>
              </button>

              <button 
                onClick={() => setSelectedCategory('Songs')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === 'Songs' ? 'bg-pink-500/15 text-pink-300 font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Music size={13} />
                  <span>Songs</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">{songsCount}</span>
              </button>

              <button 
                onClick={() => {
                  const cat = prompt('New Category Name:');
                  if (cat) alert(`Category created: ${cat}`);
                }}
                className="mt-3 text-xs text-pink-400 hover:text-pink-300 flex items-center gap-1 px-1 font-semibold transition-colors"
              >
                <Plus size={13} />
                New category
              </button>
            </div>

            {/* Sub-column 2: Items Table */}
            <div className="flex-1 bg-[#0d0d12] border-r border-[#262635] flex flex-col min-w-0 overflow-hidden">
              {/* Table Header */}
              <div className="h-8 px-4 border-b border-[#262635] flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-neutral-500 shrink-0 bg-[#09090d]">
                <span>Name</span>
                <span>Modified</span>
              </div>

              {/* Rows */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {filteredSongs.map((song) => {
                  const origIdx = songsList.findIndex(s => s.id === song.id);
                  const isSelected = activeItemIndex === origIdx;

                  return (
                    <div
                      key={song.id}
                      onContextMenu={(e) => handleContextMenu(e, 'song', song.id)}
                      onClick={() => {
                        setActiveItemIndex(origIdx);
                        setActiveTab('songs');
                        if (song.slides.length > 0) {
                          setPreviewSlide(song.slides[0]);
                        }
                      }}
                      onDoubleClick={() => {
                        setActiveItemIndex(origIdx);
                        setActiveTab('songs');
                        if (song.slides.length > 0) {
                          setPreviewSlide(song.slides[0]);
                          goLive(song.slides[0]);
                        }
                      }}
                      className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-all ${
                        isSelected 
                          ? 'border border-pink-500 bg-pink-500/10 text-white shadow-sm' 
                          : 'hover:bg-white/5 border border-transparent text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText size={14} className={isSelected ? 'text-pink-400' : 'text-neutral-500'} />
                        <span className="text-xs font-medium truncate">{song.title}</span>
                      </div>
                      <span className="text-[11px] text-neutral-500 shrink-0 font-mono">
                        {song.modifiedAt || 'Wednesday 18. November, 2026'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions Bar */}
              <div className="h-10 px-4 border-t border-[#262635] flex items-center justify-between shrink-0 bg-[#101015]">
                <button 
                  onClick={() => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = '.json,.xml,.txt';
                    fileInput.onchange = (e: any) => {
                      const file = e.target?.files?.[0];
                      if (file) alert(`Importing: ${file.name}`);
                    };
                    fileInput.click();
                  }}
                  className="py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-1.5 border border-white/5 transition-colors font-medium"
                >
                  <Upload size={13} className="text-neutral-400" />
                  Import
                </button>

                <button 
                  onClick={() => setIsAddSongModalOpen(true)}
                  className="py-1.5 px-4 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded-full flex items-center gap-1.5 shadow-lg shadow-pink-600/30 transition-all hover:scale-105"
                >
                  <Plus size={14} />
                  New show
                </button>
              </div>
            </div>

            {/* Sub-column 3: Item Inspector */}
            <div className="w-64 bg-[#101015] p-4 flex flex-col shrink-0 overflow-y-auto custom-scrollbar select-none">
              <h3 className="text-base font-bold text-white mb-3 truncate">{activeSong?.title || 'Welcome'}</h3>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Created</span>
                  <span className="text-neutral-300 font-mono text-[11px]">{activeSong?.createdAt || 'Wednesday 18. November, 2026'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Modified</span>
                  <span className="text-neutral-300 font-mono text-[11px]">{activeSong?.modifiedAt || 'Wednesday 18. November, 2026'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Used</span>
                  <span className="text-neutral-300 font-mono text-[11px]">{activeSong?.usedAt || 'Wednesday 18. November, 2026'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Category</span>
                  <span className="text-neutral-300 italic">{activeSong?.category || 'Presentations'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Slides</span>
                  <span className="text-neutral-300 font-mono">{activeSong?.slides?.length || 1}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Words</span>
                  <span className="text-neutral-300 font-mono">
                    {activeSong?.slides?.reduce((acc, s) => acc + (s.text.trim() ? s.text.trim().split(/\s+/).length : 0), 0) || 1}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Template</span>
                  <span className="text-neutral-400">Default</span>
                </div>
              </div>

              <div className="mt-auto pt-4 flex justify-end">
                <button 
                  onClick={() => setIsTemplateGalleryOpen(true)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-white/5 transition-colors"
                  title="Configure Template & Styles"
                >
                  <Sliders size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : bottomTab === 'media' ? (
          <div className="flex-1 min-h-0 bg-[#0d0d12]">
            <MediaLibrary onSelectBackground={setGlobalBackground} />
          </div>
        ) : bottomTab === 'audio' ? (
          <div className="flex-1 min-h-0 bg-[#0d0d12]">
            <AudioModule onVerseDetected={handleVerseDetected} />
          </div>
        ) : bottomTab === 'scripture' ? (
          <div className="flex-1 min-h-0 bg-[#0d0d12]">
            {renderCenterWorkspace()}
          </div>
        ) : bottomTab === 'templates' ? (
          <InlineTemplateGrid
            templates={inlineTemplates}
            category={inlineTemplateCategory}
            onCategoryChange={setInlineTemplateCategory}
            onLoadTemplates={() => getStoredTemplates().then(setInlineTemplates)}
            onEdit={(t) => { setIsTemplateGalleryOpen(true); }}
            onApplyToSong={templateGalleryHandlers.onApplyToSong}
            activeSongId={songsList[activeItemIndex]?.id}
          />
        ) : (
          <div className="flex-1 min-h-0 flex items-center justify-center text-neutral-500 text-xs">
            {bottomTab.toUpperCase()} Module
          </div>
        )}
      </div>
    );
  };

  const templateGalleryHandlers = {
    mode: "manage" as const,
    availableSongs: songsList,
    availableOutputs: globalSettings.outputs.filter(o => o.enabled && !isStageOutput(o)),
    onApplyToSong: (template, songId, outputId) => {
      const targetSongId = songId || songsList[activeItemIndex]?.id;
      if (!targetSongId) return;
      setSongsList(prev => prev.map(song => {
        if (song.id !== targetSongId) return song;
        if (outputId) {
          return {
            ...song,
            outputTemplates: { ...(song.outputTemplates || {}), [outputId]: template.id },
            slides: song.slides.map(s => ({
              ...s,
              outputTemplates: { ...(s.outputTemplates || {}), [outputId]: template.id }
            }))
          };
        }
        return {
          ...song,
          templateId: template.id,
          slides: song.slides.map(s => linkSlideToTemplate(s, template.id))
        };
      }));
    },
    onApplyToSlide: (template, outputId) => {
      const currentSong = songsList[activeItemIndex];
      if (!currentSong) return;
      const targetSlideId = previewSlide?.id || liveState.slide?.id || currentSong.slides[0]?.id;
      const updatedSlides = currentSong.slides.map(s => {
        if (s.id === targetSlideId) {
          if (outputId) {
            return {
              ...s,
              outputTemplates: { ...(s.outputTemplates || {}), [outputId]: template.id }
            };
          }
          return linkSlideToTemplate(s, template.id);
        }
        return s;
      });
      setSongsList(prev => prev.map((s, idx) => idx === activeItemIndex ? { ...s, slides: updatedSlides } : s));
      if (previewSlide) {
        const matched = updatedSlides.find(s => s.id === previewSlide.id);
        if (matched) setPreviewSlide(matched);
      }
      if (liveState.slide) {
        const matched = updatedSlides.find(s => s.id === liveState.slide.id);
        if (matched) setLiveState(prev => ({ ...prev, slide: matched }));
      }
    },
    onApplyToOutput: (template, outputId) => {
      const targetId = outputId || 'main';
      setGlobalSettings(prev => ({
        ...prev,
        outputs: prev.outputs.map(o => o.id === targetId ? { ...o, defaultTemplateId: template.id } : o)
      }));
    },
  } satisfies Partial<TemplateGalleryModalProps>;

  return (
    <div className="flex flex-col h-screen bg-black text-neutral-200 overflow-hidden font-sans select-none">
      {renderGroupMenu()}
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-full bg-neutral-900/95 border border-white/10 shadow-2xl pointer-events-none flex items-center gap-2 text-sm text-white">
          {undoToast.kind === 'info'
            ? <Check size={14} className="text-emerald-400" />
            : <RotateCcw size={14} className={undoToast.text === 'Redone' ? '-scale-x-100' : ''} />}
          {undoToast.text}
          <span className="text-[11px] text-neutral-500">Ctrl+Z undo · Ctrl+Y redo</span>
        </div>
      )}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)} 
        settings={globalSettings} 
        onSave={setGlobalSettings}
        isPresenting={liveState.isPresenting}
        onTogglePresenting={togglePresenting}
        onToggleLockOutput={toggleLockOutput}
      />

      {/* TOP HEADER BAR (FreeShow Style) */}
      <header className="h-10 bg-[#09090b] border-b border-[#262635] flex items-center justify-between px-3 shrink-0 z-30 select-none">
        {/* Left: Menu & Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="hover:text-white cursor-pointer px-1">File</span>
            <span className="hover:text-white cursor-pointer px-1">Edit</span>
            <span className="hover:text-white cursor-pointer px-1">View</span>
            <span className="hover:text-white cursor-pointer px-1">Help</span>
          </div>
          <span className="font-black text-pink-500 tracking-wider text-base ml-2">FlowShow</span>
        </div>

        {/* Center: Mode Tabs (Show | Design | Stage) */}
        <div className="flex items-center gap-1 bg-[#121218] p-0.5 rounded-lg border border-[#262635]">
          <button
            onClick={() => setAppMode('show')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              appMode === 'show' ? 'text-pink-400 bg-pink-500/15 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Play size={12} className="fill-current" />
            Show
          </button>
          <button
            onClick={() => { if (appMode !== 'design') openDesign(); }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              appMode === 'design' ? 'text-pink-400 bg-pink-500/15 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
            title="Design the look of a screen live, on a large canvas"
          >
            <Sparkles size={12} />
            Design
          </button>
          <button
            onClick={() => setAppMode('stage')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              appMode === 'stage' ? 'text-pink-400 bg-pink-500/15 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Tv size={12} />
            Stage
          </button>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-2">
          {/* Remote / Squiggle icon */}
          <button 
            onClick={() => alert('FlowShow Remote is connected and listening.')}
            className="p-1 text-pink-400 hover:text-pink-300 transition-colors" 
            title="Remote Connection"
          >
            <Wifi size={16} />
          </button>

          {/* Settings Modal Button */}
          <button 
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-1 text-neutral-400 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings size={16} />
          </button>

          {/* Master Present / Window Toggle */}
          <button
            onClick={togglePresenting}
            className={`p-1 rounded transition-colors ${
              liveState.isPresenting ? 'text-red-500 animate-pulse' : 'text-neutral-400 hover:text-white'
            }`}
            title={liveState.isPresenting ? 'Output LIVE (Presenting)' : 'Output Offline'}
          >
            <MonitorPlay size={16} />
          </button>

          <div className="w-px h-3.5 bg-white/10 mx-1" />

          {/* Window Buttons */}
          <div className="flex items-center text-neutral-500">
            <button className="p-1 hover:text-white transition-colors"><Minus size={13} /></button>
            <button className="p-1 hover:text-white transition-colors"><Square size={11} /></button>
            <button className="p-1 hover:text-red-400 transition-colors"><X size={13} /></button>
          </div>
        </div>
      </header>

      {/* TOP SECTION: 3-COLUMN WORKSPACE (Projects | Slide Grid | Output Monitors) */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {renderProjectsSidebar()}
        {renderCenterSlideArea()}
        {renderRightOutputsPanel()}
      </div>

      {/* DRAG HANDLE DIVIDER */}
      <div
        onMouseDown={handleDividerMouseDown}
        className="group relative h-[5px] shrink-0 bg-[#1a1a24] hover:bg-pink-500/40 transition-colors duration-150 cursor-row-resize select-none z-10"
        title={bottomPanelCollapsed ? 'Click to expand panel' : 'Drag to resize · Click to collapse'}
      >
        {/* centre grip dots */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="w-1 h-1 rounded-full bg-pink-400" />
          <span className="w-1 h-1 rounded-full bg-pink-400" />
          <span className="w-1 h-1 rounded-full bg-pink-400" />
          <span className="w-1 h-1 rounded-full bg-pink-400" />
          <span className="w-1 h-1 rounded-full bg-pink-400" />
        </div>
      </div>

      {/* BOTTOM SECTION: HORIZONTAL LIBRARY & BROWSER */}
      <div
        style={{ height: bottomPanelCollapsed ? 0 : bottomPanelHeight }}
        className="shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out"
      >
        {renderBottomBrowser()}
      </div>

      {/* CONTEXT MENUS */}
      {contextMenu && (
        <div className="fixed z-50 bg-[#18181B] border border-white/10 rounded-lg shadow-2xl overflow-hidden py-1.5 w-48 backdrop-blur-xl" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === 'slide' ? (
             <>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { openDesign(getShownSlides().slides[contextMenu.id as number]?.id ?? null); setContextMenu(null); }}><Edit2 size={14}/> Edit</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleDuplicateSlide(contextMenu.id as number); setContextMenu(null); }}><Copy size={14}/> Duplicate</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleSplitSlide(contextMenu.id as number); setContextMenu(null); }}><Split size={14}/> Split</button>
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleRemoveTemplate('slide', contextMenu.id as number); setContextMenu(null); }}><X size={14}/> Remove template (this slide)</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleRemoveTemplate('song', contextMenu.id as number); setContextMenu(null); }}><X size={14}/> Remove template (whole song)</button>
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 text-sm transition-colors flex items-center gap-2" onClick={() => { handleDeleteSlide(contextMenu.id as number); setContextMenu(null); }}><Trash size={14}/> Delete</button>
             </>
          ) : (
            <>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => {
                   if (contextMenu.type === 'song') {
                      const song = songsList.find(s => s.id === contextMenu.id);
                      if (song) { const newName = prompt("Rename Song:", song.title); if (newName && newName.trim()) setSongsList(prev => prev.map(s => s.id === contextMenu.id ? { ...s, title: newName.trim() } : s)); }
                   } else if (contextMenu.type === 'bible') {
                      const b = bibleList.find(b => b.id === contextMenu.id);
                      if (b) { const newName = prompt("Rename Bible:", b.name); if (newName && newName.trim()) { getBible(contextMenu.id as string).then(bibleData => { if (bibleData) { bibleData.name = newName.trim(); saveBible(bibleData).then(() => { getBibleList().then(list => setBibleList(list)); if (activeBibleId === contextMenu.id) setActiveBibleData(bibleData); }); }}); }}
                   }
                   setContextMenu(null);
                 }}><Edit2 size={14}/> Rename {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 text-sm transition-colors flex items-center gap-2" onClick={() => {
                   if (contextMenu.type === 'song') deleteSong(contextMenu.id); else if (contextMenu.type === 'bible') handleDeleteBible(contextMenu.id as string);
                   setContextMenu(null);
                 }}><Trash size={14}/> Delete {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
            </>
          )}
        </div>
      )}

      <AddSongModal isOpen={isAddSongModalOpen} onClose={() => setIsAddSongModalOpen(false)} onAddSong={(newSong) => { setSongsList(prev => [...prev, newSong]); setActiveTab('songs'); setActiveItemIndex(songsList.length); }} />

      <TemplateGalleryModal
        isOpen={isTemplateGalleryOpen}
        onClose={() => setIsTemplateGalleryOpen(false)}
        {...templateGalleryHandlers}
      />
    </div>
  );
}

/**
 * What an audience output draws inside its FixedStage. The projector window and the Design canvas
 * both render through this, so the canvas is always exactly what the screen shows.
 */
function AudienceOutputContent({ output, settings, slide, background, hideBackground = false, hideText = false, videoRef, muted = false, scrollPreviewPos, highlightWordIndex, designPreview = false }: {
  output: OutputSettings | undefined;
  settings: GlobalSettings | undefined;
  slide: SlideDefinition | null | undefined;
  background: ReturnType<typeof resolveOutputBackground>;
  hideBackground?: boolean;
  hideText?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  muted?: boolean;
  scrollPreviewPos?: number;
  /** Design canvas only: outline the word being styled */
  highlightWordIndex?: number;
  /** Design canvas only: also draw text boxes that are hidden (faded) or waiting for Go live */
  designPreview?: boolean;
}) {
  const style = getStyleForOutput(output, settings);
  const bg = hideBackground ? null : background;
  const resolved = slide ? resolveSlideForOutput(slide, output, undefined, style) : null;
  const design = slide?.designs?.[output?.id || 'main'];
  const showText = !hideText && !!slide && style?.activeLayers.slide !== false;

  return (
    <>
      {bg?.type === 'color' && <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ backgroundColor: bg.color || '#000' }} />}

      {bg?.type === 'ndi' && (
        <div className="absolute inset-0 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden pointer-events-none">
          <div className="text-center z-10 select-none">
            <Radio size={32} className="text-red-500 mx-auto animate-pulse mb-2" />
            <span className="text-xs font-mono text-white/90 block uppercase tracking-wider">{bg.fileName || 'NDI Live Camera Feed'}</span>
            <span className="text-[10px] font-mono text-emerald-400">1080p60 • LIVE NDI IN</span>
          </div>
        </div>
      )}

      {bg?.url && bg.type === 'video' ? (
        <video ref={videoRef} src={bg.url} className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none" autoPlay loop muted={muted} playsInline />
      ) : bg?.url ? (
        <img src={bg.url} className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none" alt="bg" />
      ) : null}

      {/* data-text-layer lets the Design canvas tell which words belong to the lyrics */}
      {showText && slide && resolved && !design?.hideLyrics && (
        <div data-text-layer="lyrics" style={{ display: 'contents' }}>
          <SmartTextLayout
            text={slide.text}
            source={slide.source}
            type={slide.type}
            animation={resolved.animation}
            styleOverrides={resolved.styleOverrides}
            scrollPreviewPos={scrollPreviewPos}
            highlightWordIndex={highlightWordIndex}
            className="relative z-10 w-full h-full"
          />
        </div>
      )}

      {showText && design?.customBoxes?.filter(box => designPreview || isBoxOnScreen(box)).map(box => (
        <div key={box.id} data-text-layer={box.id} style={{ display: 'contents' }}>
          <SmartTextLayout
            text={box.text}
            type="lyrics"
            animation={resolveCustomBoxAnimation(box)}
            styleOverrides={{ global: box.style, layout: box.layout }}
            className={`relative z-10 w-full h-full ${box.hidden ? 'opacity-30' : ''}`}
          />
        </div>
      ))}
    </>
  );
}

function ProjectorView() {
  const { outputId = 'main' } = useParams();
  
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null, globalBackground: null, clearText: false, isPresenting: false, clearedOutputs: {}, lockedOutputs: {}, frozenStates: {}
  });
  
  const projectorVideoRef = useRef<HTMLVideoElement>(null);
  const lockedRef = useRef(false);

  useEffect(() => {
    lockedRef.current = !!liveState.lockedOutputs?.[outputId];
  }, [liveState.lockedOutputs, outputId]);

  // Projector windows are separate pages: populate the template cache so style/custom templates resolve here.
  const [, setTemplatesVersion] = useState(0);
  useEffect(() => {
    getStoredTemplates().then(() => setTemplatesVersion(v => v + 1));
  }, [liveState.settings, liveState.slide]);
  useEffect(() => subscribeTemplates(() => setTemplatesVersion(v => v + 1)), []);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'REQUEST_CURRENT_STATE' });
    
    channel.onmessage = (event) => {
      if (event.data?.type === 'VIDEO_CMD') {
        if (lockedRef.current) return; 
        
        const { command, value } = event.data;
        if (projectorVideoRef.current) {
           if (command === 'play') projectorVideoRef.current.play().catch(console.error);
           else if (command === 'pause') projectorVideoRef.current.pause();
           else if (command === 'mute') projectorVideoRef.current.muted = value;
           else if (command === 'seek') projectorVideoRef.current.currentTime = value;
        }
      } else if (event.data && !event.data.type?.startsWith('REQUEST_')) {
         
         setLiveState(prev => {
             const incoming = event.data;
             const isNowLocked = incoming.lockedOutputs?.[outputId];

             if (isNowLocked) {
                 return {
                     ...incoming,
                     slide: prev.slide,
                     stage: prev.stage,
                     globalBackground: prev.globalBackground,
                     clearText: prev.clearText,
                     clearedOutputs: {
                         ...incoming.clearedOutputs,
                         [outputId]: prev.clearedOutputs?.[outputId] 
                     }
                 };
             }
             return incoming;
         });

         if (!lockedRef.current && event.data.videoInitState && projectorVideoRef.current) {
             projectorVideoRef.current.currentTime = event.data.videoInitState.time;
             projectorVideoRef.current.muted = event.data.videoInitState.muted;
             if (event.data.videoInitState.playing) projectorVideoRef.current.play().catch(console.error);
             else projectorVideoRef.current.pause();
         }
      }
    };
    return () => channel.close();
  }, [outputId]);

  const outputConfig = liveState.settings?.outputs.find(o => o.id === outputId);
  const isCleared = !!liveState.clearedOutputs?.[outputId];
  const isLocked = !!liveState.lockedOutputs?.[outputId];
  const frozenState = liveState.frozenStates?.[outputId];
  
  const rawActiveBg = (liveState.globalBackground || outputConfig?.defaultBackground) ?? null;

  const displaySlide = isLocked ? frozenState?.slide : liveState.slide;
  const displayBg = resolveOutputBackground(isLocked ? frozenState?.bg : rawActiveBg, outputConfig, liveState.settings);
  const displayClearText = isLocked ? frozenState?.clearText : liveState.clearText;

  const hideBg = isCleared && outputId !== 'main';
  const hideText = isCleared;
  const stageStyle = getStyleForOutput(outputConfig, liveState.settings);

  return (
    <div className="w-screen h-screen bg-transparent flex flex-col items-center justify-center overflow-hidden relative cursor-none select-none">
      <div className={`w-full h-full transition-opacity duration-700 ease-in-out ${liveState.isPresenting ? 'opacity-100' : 'opacity-0'}`}>
        <FixedStage className="w-full h-full relative">
          {isStageOutput(outputConfig) ? (
            <StageScreen
              layout={stageLayoutFor(stageStyle, displaySlide, liveState.settings?.stageLayouts)}
              slide={displaySlide}
              nextSlide={liveState.stage?.nextSlide}
              songTitle={liveState.stage?.songTitle}
              background={stageStyle?.backgroundColor}
              hideText={hideText || !!displayClearText}
            />
          ) : (
            <AudienceOutputContent
              output={outputConfig}
              settings={liveState.settings}
              slide={displaySlide}
              background={displayBg}
              hideBackground={hideBg}
              hideText={hideText || !!displayClearText}
              videoRef={projectorVideoRef}
            />
          )}
        </FixedStage>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ControlPanel />} />
        <Route path="/projector/:outputId" element={<ProjectorView />} />
        <Route path="/projector" element={<ProjectorView />} /> 
      </Routes>
    </BrowserRouter>
  );
}