import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { DesignMediaLayer, type DesignMedia } from './lib/designMedia';
import { OverlayLayer, newOverlay, overlaysFor, type Overlay } from './lib/overlays';
import { OverlaysPanel } from './components/OverlaysPanel';
import { MixWorkspace } from './components/MixWorkspace';
import { LiveInputView, LiveInputSelect, inputKey, type LiveInput } from './lib/liveInputs';
import { PlaybackBar, PLAYBACK_TOGGLE_EVENT, isPlayback, usePlaybackFollower } from './lib/playback';
import { isTyping } from './lib/deleteKey';
import {
  MixStack, DEFAULT_SHOW_END_FADE, EMPTY_MIX, mainScreenId, mixLayersAt, mixLayersForScreen, mixUrlNow, findMixUrl, mixForSlides, mixToSave,
  ScreenBorderView, type ScreenBorder, type LiveMix, type LiveMixLayer, type ShowMix, type SavedMix,
} from './lib/mix';
import { OverlayDesignWorkspace } from './components/OverlayDesignWorkspace';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { askConfirm, askText, showMessage, AppDialogHost } from './lib/appDialogs';
import { DEFAULT_TIMER_PRESETS, LiveTimer, TimerPreset, setSharedTimer, timeLeft, timerBusy } from './lib/timers';
import { TimersPanel } from './components/TimersPanel';
import { 
  Settings, MonitorPlay, Mic, BookOpen, Music, Image as ImageIcon, Video, 
  Plus, Search, List, Grid, X, LayoutTemplate, Layers, Play,
  SquareSquare, MonitorOff, MonitorUp, EyeOff, FileText,
  Activity, Upload, ExternalLink, Edit2, Copy, Trash, GripVertical, Split,
  Pause, Volume2, VolumeX, Save, ChevronDown, ExternalLink as LaunchIcon, Clock, Lock, Unlock, PanelLeft, PanelLeftClose,
  Radio, Tv, Wifi, ListOrdered, Check, Sparkles, ChevronRight, ChevronLeft, Film,
  Folder, FolderPlus, RotateCcw, Eye, MoreHorizontal, MoreVertical, Calendar, Puzzle, Sliders, Info, Minus, Maximize2, Square, Wand2,
  Palette, Keyboard, Rocket, Timer as TimerIcon
} from 'lucide-react';
import { APP_THEMES, AppThemeId, DEFAULT_APP_THEME, applyAppTheme, themeSwatch } from './lib/themes';
import { ndiService, NdiSource, NdiOutputChannel } from './lib/ndi';
import { motion, AnimatePresence } from 'motion/react';
import { SetlistManager } from './components/SetlistManager';
import { ServiceSetlist, SetlistItem, DEFAULT_SAMPLE_SETLIST, ProjectsState, loadProjects, saveProjects } from './lib/setlist';
import { ProjectsPanel, DRAG_SONG, DRAG_MEDIA, DRAG_SCRIPTURE } from './components/ProjectsPanel';

function formatTime(seconds: number) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

import { MediaLibrary, resolveMediaRef } from './components/MediaLibrary';
import { AudioModule } from './components/AudioModule';
import { AddSongModal } from './components/AddSongModal';
import { ImportShowsModal } from './components/ImportShowsModal';
import { loadInstalledFonts } from './lib/fontStore';
import { ProfileRecord, loadProfiles, saveProfiles, buildProfileFile, readProfileFile, PROFILE_EXTENSION } from './lib/profiles';
import { ProfilesPanel, ProfilesApi } from './components/ProfilesPanel';
import { ProfileMenu } from './components/ProfileMenu';
import { TopMenu, ExportDialog, ExportChoice, ShortcutsDialog, QuickStartDialog, AboutDialog, DocumentationDialog, ShortcutsContent, QuickStartContent, AboutContent } from './components/AppMenus';
import { ExportTemplatesDialog, ImportTemplatesDialog } from './components/TemplatePackageDialogs';
import { BACKUP_EXTENSION, buildBackup, restoreBackup, downloadBlob } from './lib/backup';
import { IMPORT_ACCEPT, ImportedShow, isSongXml, showFromText } from './lib/importers';
import { ImportChooser, ImportKind } from './components/ImportChooser';
import { getMonitors, isTauri, openOutputOnMonitor } from './lib/tauriScreen';
import { setNdiProblems, syncNdiOutputs } from './lib/nativeOutputs';
import { FILE_SAVED_EVENT, SavedFile, revealFile, pickMediaFile, mediaUrl, isVideoPath, fileNameOf } from './lib/nativeFiles';
import { NdiBadge, NdiDot, NdiStatusCard } from './components/NdiStatus';
import { get, set } from 'idb-keyval';
import { SmartTextLayout } from './components/SmartTextLayout';
import { FixedStage } from './components/FixedStage';
import { BibleVersion, getBibleList, getBible, saveBible, deleteBible, initDatabase } from './lib/bibleDb';
import { parseBibleXml, BibleFileError, countVerses } from './lib/xmlParser';
import { AnimationConfig, PresentationTemplate, STARTER_TEMPLATES, getStoredTemplates, subscribeTemplates, getCachedTemplates, FALLBACK_ANIMATION, TextPosition } from './lib/templates';
import { LiveDesignWorkspace, OutputTemplateInfo } from './components/LiveDesignWorkspace';
import { ScriptureDesignWorkspace } from './components/ScriptureDesignWorkspace';
import type { DesignFor } from './components/DesignControls';
import { detectGroups, groupColors } from './lib/slideGroups';
import { GroupMenu } from './components/GroupMenu';
import { TemplateGalleryModal, TemplateGalleryModalProps, InlineTemplateGrid } from './components/TemplateGalleryModal';
import { StageScreen } from './components/StageScreen';
import { StageWorkspace, StageLiveData } from './components/StageWorkspace';
import { DEFAULT_LYRICS_STAGE_LAYOUT, DEFAULT_SCRIPTURE_STAGE_LAYOUT, StageLayout, stageLayoutFor } from './lib/stageLayouts';

export type SlideType = 'lyrics' | 'scripture' | 'blank' | 'media';

/** A picture or video a slide starts using as the background */
export interface SlideBackground {
  url: string;
  type: 'image' | 'video';
  name?: string;
  /** Where it is in an added media folder, so it is found again after a restart */
  ref?: { folder: string; path: string[] };
}

/**
 * Each slide's background media. Only the slide it was dropped on has it: selecting that slide puts it on,
 * and it then stays on (for the slides after it, earlier slides and other songs) until another background replaces it.
 */
export const slideBackgrounds = (slides: SlideDefinition[]): ({ bg: SlideBackground; own: boolean } | null)[] =>
  slides.map(s => s.background ? { bg: s.background, own: true } : null);

/** Whether a slide has media: background media, or pictures/videos added in Design mode (on any screen) */
export const slideHasMedia = (s: SlideDefinition | undefined | null) =>
  !!s && (!!s.background || Object.values(s.designs || {}).some(d => (d.media?.length ?? 0) > 0));

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
  /** A slide of a Declaration show (not a song): screens use their style's Declarations template for it */
  declaration?: boolean;
  /** Background media from this slide on (until a later slide has its own): dropped from the Media tab */
  background?: SlideBackground;
  animation?: AnimationConfig;
  styleOverrides?: {
    global?: React.CSSProperties & { '--font-scale'?: number };
    words?: { [wordIndex: number]: React.CSSProperties };
    lines?: { [lineIndex: number]: React.CSSProperties };
    layout?: { x: number; y: number; width: number; height: number };
    sourceGlobal?: React.CSSProperties & { '--font-scale'?: number };
    sourceLayout?: { x: number; y: number; width: number; height: number };
    /** Where the text sits in its box when it doesn't fill it (from the template) */
    verticalAlign?: TextPosition;
    sourceVerticalAlign?: TextPosition;
    /** Pictures and videos from the template */
    media?: DesignMedia[];
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
  /** Stage styles: the stage layout for the slides of Declaration shows (missing = the lyrics layout) */
  declarationStageLayoutId?: string;
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
  /** Template id used for the slides of Declaration shows (missing = the lyrics template) */
  declarationTemplateId?: string;
  /** Optional text-style overrides for lyrics */
  lyricsStyleOverride?: { global?: React.CSSProperties & { '--font-scale'?: number }; layout?: { x: number; y: number; width: number; height: number } };
  /** A border on every screen with this style (whatever shows: songs, scripture, declarations), over everything */
  border?: ScreenBorder;
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
  /** The template scripture uses on this screen (a style's scripture template wins over it). Missing = the default scripture template. */
  scriptureTemplateId?: string;
  /** The template Declaration shows use on this screen (a style's template wins over it). Missing = the default template. */
  declarationTemplateId?: string;
  defaultBackground: { 
    url?: string; 
    color?: string; 
    type: 'image' | 'video' | 'color' | 'ndi' | 'input' | 'none'; 
    fileName?: string;
    ndiSourceId?: string;
    /** A camera, screen or NDI source (type 'input') */
    input?: LiveInput;
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
  /** How strongly the background picture, video or colour shows (0–100, over black). Lower = darker, easier to read */
  backgroundOpacity?: number;
  ndiAlphaChannel?: boolean;
}

export interface GlobalSettings {
  outputs: OutputSettings[];
  styles: PresentationStyle[];
  /** Stage layouts made in the Stage tab (the ready-made ones aren't stored) */
  stageLayouts?: StageLayout[];
  /** The app's colour theme (a ready-made palette) */
  appTheme?: AppThemeId;
  /** Countdown timers to start from the Timers tab */
  timerPresets?: TimerPreset[];
  /** TIME UP keeps flashing on the stage screen until Stop (default on) */
  timeUpFlicker?: boolean;
  /** Overlays made in the Overlays tab */
  overlays?: Overlay[];
  /** Overlay group names (kept even when empty) */
  overlayGroups?: string[];
  /** Mixes saved to reuse in other shows (Mix mode → Mix → Save as a reusable mix) */
  savedMixes?: SavedMix[];
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
  globalBackground: { url: string; type: 'image' | 'video' | 'input', fileName?: string; input?: LiveInput; /** A playback video: plays once, with sound (from this computer only) */ playback?: boolean } | null;
  clearText: boolean;
  clearedOutputs?: Record<string, boolean>; 
  /** true = paused; 'held' = unpaused but still showing its paused picture until the next slide, background or clear is sent */
  lockedOutputs?: Record<string, boolean | 'held'>; 
  frozenStates?: Record<string, { slide: SlideDefinition | null; bg: any; clearText: boolean; overlays?: Overlay[]; mix?: LiveMix | null }>;
  /** What the Media Mixer is playing (the layers of the live show's mix for the live slide) */
  mix?: LiveMix | null;
  /** Overlays switched on (several at once); only F3 / Clear overlays takes them off */
  overlays?: string[];
  /** The countdown in use (Timers tab), shown by stage layouts' Timer items */
  timer?: LiveTimer | null;
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

import { getTemplateById, DEFAULT_SCRIPTURE_TEMPLATE_ID, DEFAULT_DECLARATION_TEMPLATE_ID } from './lib/templates';

type SongTemplateRefs = { id?: string; templateId?: string; outputTemplates?: { [outputId: string]: string } };
export type TemplateSource = 'style' | 'slide-output' | 'slide' | 'song-output' | 'song' | 'output-default' | 'screen-scripture' | 'screen-declaration' | 'none';

/** The scripture template a screen uses of its own (when its style doesn't set one) */
export const screenScriptureTemplateId = (outputConfig?: OutputSettings) =>
  outputConfig?.scriptureTemplateId || DEFAULT_SCRIPTURE_TEMPLATE_ID;

/**
 * Which template an output uses for a slide, and where that choice came from.
 * Priority: Style template -> Slide output override -> Slide general -> Song output override -> Song general -> Output default.
 * Scripture ends with the screen's scripture template instead of its default (lyrics) template.
 */
export const resolveTemplateSource = (
  slide: Pick<SlideDefinition, 'type' | 'templateId' | 'outputTemplates' | 'declaration'> | null | undefined,
  outputConfig?: OutputSettings,
  song?: SongTemplateRefs,
  presentationStyle?: PresentationStyle
): { templateId?: string; source: TemplateSource } => {
  const outputId = outputConfig?.id || 'main';
  const scripture = slide?.type === 'scripture';
  const styleTemplateId = presentationStyle
    ? (scripture ? presentationStyle.scriptureTemplateId
      : slide?.declaration ? presentationStyle.declarationTemplateId
      : presentationStyle.lyricsTemplateId)
    : undefined;

  const chain: [string | undefined, TemplateSource][] = [
    [styleTemplateId, 'style'],
    [slide?.outputTemplates?.[outputId], 'slide-output'],
    [slide?.templateId, 'slide'],
    [song?.outputTemplates?.[outputId], 'song-output'],
    [song?.templateId, 'song'],
    scripture ? [screenScriptureTemplateId(outputConfig), 'screen-scripture']
      : slide?.declaration ? [outputConfig?.declarationTemplateId || DEFAULT_DECLARATION_TEMPLATE_ID, 'screen-declaration']
      : [outputConfig?.defaultTemplateId, 'output-default'],
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
  /** Where its words sit in the box (default: middle) */
  verticalAlign?: TextPosition;
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
  /** Where the lyrics sit in their box when they don't fill it */
  verticalAlign?: TextPosition;
  /** Pictures and videos on this slide for this output (under the words) */
  media?: DesignMedia[];
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
      verticalAlign: design.verticalAlign || base.styleOverrides?.verticalAlign,
    },
    animation: design.animation
      ? { ...(base.animation || FALLBACK_ANIMATION), ...design.animation } as AnimationConfig
      : base.animation,
  };
};

/**
 * The look of a slide on one output: its template, then the slide's own design for that output on top.
 * templateOverride: draw it in this template instead (Design mode's canvas, while a template is being changed).
 */
export const resolveSlideForOutput = (
  slide: SlideDefinition | null,
  outputConfig?: OutputSettings,
  song?: SongTemplateRefs,
  presentationStyle?: PresentationStyle,
  templateOverride?: PresentationTemplate
): ResolvedLook => {
  const base = resolveBaseLook(slide, outputConfig, song, presentationStyle, templateOverride);
  return slide ? applySlideDesign(base, slide.designs?.[outputConfig?.id || 'main']) : base;
};

const resolveBaseLook = (
  slide: SlideDefinition | null,
  outputConfig?: OutputSettings,
  song?: SongTemplateRefs,
  presentationStyle?: PresentationStyle,
  templateOverride?: PresentationTemplate
): ResolvedLook => {
  if (!slide) return { styleOverrides: undefined, animation: undefined };

  const { templateId, source } = resolveTemplateSource(slide, outputConfig, song, presentationStyle);
  const styleTemplateId = source === 'style' ? templateId : undefined;
  const template = templateOverride ?? (templateId ? getTemplateById(templateId) : undefined);

  // Display style template is authoritative: ignore song/slide look (which is baked into
  // slide.styleOverrides/animation when a template is applied to a song). Word-level emphasis is kept.
  if ((styleTemplateId || templateOverride) && template) {
    return {
      styleOverrides: {
        global: { ...(template.styles.global || {}) },
        lines: { ...(template.styles.lines || {}) },
        words: slide.styleOverrides?.words,
        layout: template.styles.layout,
        sourceGlobal: { ...(template.styles.sourceGlobal || {}) },
        sourceLayout: template.styles.sourceLayout,
        verticalAlign: template.styles.verticalAlign,
        sourceVerticalAlign: template.styles.sourceVerticalAlign,
        media: template.styles.media,
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
    sourceLayout: slide.styleOverrides?.sourceLayout || template?.styles.sourceLayout,
    verticalAlign: slide.styleOverrides?.verticalAlign || template?.styles.verticalAlign,
    sourceVerticalAlign: slide.styleOverrides?.sourceVerticalAlign || template?.styles.sourceVerticalAlign,
    media: slide.styleOverrides?.media || template?.styles.media,
  };

  // (The old per-output "Override Lyrics / Bible Style" switches are gone: templates, styles and Design mode do this now)
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
  !!d.layout || !!d.hideLyrics || !!d.verticalAlign || (d.customBoxes?.length ?? 0) > 0 || (d.media?.length ?? 0) > 0 ||
  Object.keys(d.global || {}).length > 0 || Object.keys(d.animation || {}).length > 0 ||
  Object.keys(d.words || {}).length > 0
);

/** A slide design without the parts a template sets (font, size, colours, position, motion); word styles and text boxes stay */
const withoutOwnLook = (d: SlideDesign): SlideDesign => ({ ...d, global: undefined, layout: undefined, animation: undefined, verticalAlign: undefined });

/** The slide with its waiting text boxes put on the screens (the same slide object when none are waiting) */
const releaseWaitingBoxes = (slide: SlideDefinition): SlideDefinition => {
  const designs = slide.designs;
  const isWaiting = (d: SlideDesign) => !!d.customBoxes?.some(b => b.waiting) || !!d.media?.some(m => m.waiting);
  if (!designs || !Object.values(designs).some(isWaiting)) return slide;
  const released: { [outputId: string]: SlideDesign } = {};
  for (const [outputId, d] of Object.entries(designs)) {
    released[outputId] = isWaiting(d)
      ? {
        ...d,
        customBoxes: d.customBoxes?.map(b => b.waiting ? { ...b, waiting: undefined } : b),
        media: d.media?.map(m => m.waiting ? { ...m, waiting: undefined } : m),
      }
      : d;
  }
  return { ...slide, designs: released };
};

/** Look up the PresentationStyle assigned to an output, given the full settings. */
export const getStyleForOutput = (outputConfig: OutputSettings | undefined, settings: GlobalSettings | undefined): PresentationStyle | undefined => {
  if (!outputConfig?.styleId || !settings?.styles) return undefined;
  return settings.styles.find(s => s.id === outputConfig.styleId);
};

/** A screen's border: its style's, or (a normal screen with no style picked) the Default style's */
export const screenBorderFor = (outputConfig: OutputSettings | undefined, settings: GlobalSettings | undefined): ScreenBorder | undefined => {
  if (!outputConfig || !settings?.styles) return undefined;
  const id = outputConfig.styleId || (isStageOutput(outputConfig) ? undefined : 'default');
  return id ? settings.styles.find(s => s.id === id)?.border : undefined;
};

type RawBackground = { url?: string; color?: string; type: 'image' | 'video' | 'color' | 'ndi' | 'input' | 'none'; fileName?: string; input?: LiveInput; playback?: boolean } | null | undefined;

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

/** Saved settings with FlowShow's defaults filled in (new default outputs and styles added) */
const normaliseSettings = (val: any): GlobalSettings => {

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
  return { ...DEFAULT_SETTINGS, ...val, outputs: allOutputs, styles: [...mergedStyles, ...extraStyles] };
};

// We import the new component for settings
import { OutputStyleEditor, OutputStyleConfig } from './components/OutputStyleEditor';
import { StylesManager } from './components/StylesManager';

/** A name shown as text; click it to rename it in place */
function InlineName({ value, onRename, className = '', inputClassName = '', title = 'Click to rename' }: {
  value: string; onRename: (name: string) => void; className?: string; inputClassName?: string; title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const done = (keep: boolean) => {
    setEditing(false);
    const name = text.trim();
    if (keep && name && name !== value) onRename(name);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }}
        onBlur={() => done(true)}
        onClick={(e) => e.stopPropagation()}
        className={`bg-black/40 border border-pink-500 rounded px-1.5 outline-none text-white ${inputClassName}`}
        data-inline-name-input
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      title={title}
      onClick={(e) => { e.stopPropagation(); setText(value); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setText(value); setEditing(true); } }}
      className={`cursor-text rounded hover:bg-white/10 px-1 -mx-1 ${className}`}
      data-inline-name
    >
      {value}
    </span>
  );
}

function SettingsModal({ isOpen, onClose, settings, onSave, isPresenting, onTogglePresenting, onToggleLockOutput, profilesApi, profileId, openTab }: any) {
  const [activeTab, setActiveTab] = useState('outputs');
  useEffect(() => { if (isOpen && openTab) setActiveTab(openTab); }, [isOpen, openTab]);
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
  const openedWith = useRef<GlobalSettings | null>(null);
  const shownProfileRef = useRef(profileId);
  useEffect(() => {
    // Another profile: everything changes
    if (shownProfileRef.current !== profileId) {
      shownProfileRef.current = profileId;
      setLocal(settings);
    } else if (isOpen && wasOpenRef.current) {
      setLocal(prev => ({ ...prev, styles: settings.styles }));
    } else {
      setLocal(settings);
      if (isOpen) openedWith.current = settings;
    }
    wasOpenRef.current = isOpen;
  }, [settings, isOpen, profileId]);

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

  const applyOutputLive = (id: string, fields: Partial<OutputSettings>) => {
    updateOutput(id, fields);
    onSave((prev: GlobalSettings) => ({ ...prev, outputs: prev.outputs.map(o => o.id === id ? { ...o, ...fields } : o) }));
  };
  const cancelSettings = () => {
    const was = openedWith.current;
    if (was) {
      onSave((prev: GlobalSettings) => ({
        ...prev,
        outputs: prev.outputs.map(o => {
          const before = was.outputs.find(x => x.id === o.id);
          return before && before.backgroundOpacity !== o.backgroundOpacity ? { ...o, backgroundOpacity: before.backgroundOpacity } : o;
        }),
      }));
    }
    onClose();
  };
  const updateOutput = (id: string, updatedFields: Partial<OutputSettings>) => {
    setLocal(prev => ({ ...prev, outputs: prev.outputs.map(o => o.id === id ? { ...o, ...updatedFields } : o) }));
  };

  const activeOutput = local.outputs.find(o => o.id === activeOutputId);

  // Desktop app: the picture or video stays where it is on the computer; only its place is kept
  const chooseBackgroundFile = async () => {
    try {
      const path = await pickMediaFile('media');
      if (!path) return;
      updateOutput(activeOutputId, { defaultBackground: { type: isVideoPath(path) ? 'video' : 'image', url: mediaUrl(path), fileName: fileNameOf(path) } });
    } catch (err) {
      void showMessage(`Couldn't choose the file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
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
        if (isTauri()) {
            const monitors = await getMonitors();
            setDetectedScreens(monitors.map((m, i) => ({ label: m.name || `Display ${i + 1}`, width: m.size.width, height: m.size.height })));
            if (!monitors.length) void showMessage('No screens were found.');
            return;
        }
        if ('getScreenDetails' in window) {
            const details = await (window as any).getScreenDetails();
            setDetectedScreens(details.screens);
        } else {
            void showMessage('Screens can only be detected in the FlowShow desktop app.');
        }
    } catch (err: any) {
        console.warn(err);
        void showMessage('Could not detect screens. ' + err.message);
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
             <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-pink-500 rounded cursor-pointer" />
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
        {/* The output's name: click it to rename */}
        <div className="flex items-baseline gap-2" data-output-name-heading>
          <InlineName value={activeOutput.name} onRename={(name) => updateOutput(activeOutputId, { name })} className="text-lg font-bold text-white" inputClassName="text-lg font-bold py-0.5 w-72" title="Click to rename this output" />
          <span className="text-[11px] text-neutral-500">Click the name to rename it</span>
        </div>

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
              <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
            </label>
          </div>
        </div>

        {/* What the screen is for (chosen when it was made) */}
        <div className="bg-[#121214] border border-white/5 rounded-xl px-5 py-3 flex items-center gap-3">
          {isStage ? <Tv size={16} className="text-amber-400 shrink-0" /> : <MonitorPlay size={16} className="text-pink-400 shrink-0" />}
          <div className="text-xs">
            <span className="font-semibold text-white">{isStage ? 'Stage output' : 'Normal output'}</span>
            <span className="text-neutral-500"> · {isStage ? 'for the people on stage: current and next slide, section name and time' : 'for the audience: lyrics and scripture in your templates and designs'}</span>
          </div>
        </div>

        {/* Style selector — pick which PresentationStyle this output uses (only styles of the same kind) */}
        <div className="bg-[#121214] border border-white/5 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400">{isStage ? 'Stage style' : 'Style'}</span>
            <select
              value={activeOutput.styleId || ''}
              onChange={(e) => updateOutput(activeOutputId, { styleId: e.target.value || undefined })}
              className="bg-[#1e1e28] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-pink-500 cursor-pointer min-w-[160px]"
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

            <NdiStatusCard output={activeOutput as any} />

            <div className="bg-[#121214] border border-white/5 rounded-xl overflow-hidden">
              {/* Size & Frame Rate Row */}
              <div className="grid grid-cols-2 divide-x divide-white/5">
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400 block mb-1.5">Size</span>
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
                  <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400 block mb-1.5">Frame rate</span>
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
                  <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400 block mb-1.5">Name</span>
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
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400">Target Display</span>
                <button onClick={detectScreens} className="text-xs bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white px-3 py-1.5 rounded-lg transition-all border border-white/10 font-medium">
                  Detect Screens
                </button>
              </div>
              <select 
                value={activeOutput.displayId || ''} 
                onChange={(e) => updateOutput(activeOutputId, { displayId: e.target.value })}
                className="bg-[#09090B] border border-white/10 rounded-lg text-sm px-3 py-2.5 text-white outline-none focus:border-pink-500 w-full"
              >
                <option value="">-- No Display Selected --</option>
                {activeOutput.displayId && !detectedScreens.some(s => s.label === activeOutput.displayId) && <option value={activeOutput.displayId}>{activeOutput.displayId}</option>}
                {detectedScreens.map((s, i) => (
                  <option key={s.label || i} value={s.label}>{s.label || `Display ${i + 1}`}{s.width ? ` (${s.width}×${s.height})` : ''}</option>
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
              className="bg-[#09090B] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500 font-medium min-w-[180px]" 
              value={activeOutput.defaultBackground
                ? (activeOutput.defaultBackground.type === 'ndi' ? 'input' : activeOutput.defaultBackground.type === 'video' ? 'image' : activeOutput.defaultBackground.type)
                : 'none'}
              onChange={(e) => { 
                const val = e.target.value; 
                if (val === 'none') updateOutput(activeOutputId, { defaultBackground: null }); 
                else if (val === 'color') updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: '#0a0a0a' } }); 
                else if (val === 'image') updateOutput(activeOutputId, { defaultBackground: { type: 'image', url: '' } }); 
                else if (val === 'input') updateOutput(activeOutputId, { defaultBackground: { type: 'input' } });
              }}
            >
              <option value="none">None</option>
              <option value="color">Solid Color</option>
              <option value="image">Media (Image / Video)</option>
              <option value="input">Live input (camera, screen or NDI)</option>
            </select>
            {activeOutput.defaultBackground?.type === 'color' && (
              <input type="color" value={activeOutput.defaultBackground.color || '#0a0a0a'} onChange={e => updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: e.target.value }})} className="h-9 w-14 cursor-pointer border-none bg-transparent" />
            )}
            {(activeOutput.defaultBackground?.type === 'input' || activeOutput.defaultBackground?.type === 'ndi') && (
              <div className="flex items-center gap-2 bg-[#09090B] px-3 py-2 rounded-lg border border-white/5 flex-1 min-w-[260px]" data-default-input>
                <Radio size={14} className="text-red-400 shrink-0" />
                <LiveInputSelect
                  value={activeOutput.defaultBackground.input}
                  onChange={(input) => updateOutput(activeOutputId, { defaultBackground: { type: 'input', input, fileName: input.label } })}
                  className="bg-transparent text-xs text-white font-medium outline-none flex-1 min-w-0 cursor-pointer [&>*]:bg-[#121214]"
                />
              </div>
            )}
            {(activeOutput.defaultBackground?.type === 'image' || activeOutput.defaultBackground?.type === 'video') && (
              <div className="flex items-center gap-3 bg-[#09090B] px-3 py-2 rounded-lg border border-white/5 flex-1">
                {isTauri() ? (
                  <button type="button" onClick={() => void chooseBackgroundFile()} className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors shrink-0" title="Choose a picture or video on this computer. It stays where it is; FlowShow only remembers where." data-choose-background>Browse...</button>
                ) : (
                  <label className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors shrink-0">Browse... <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" /></label>
                )}
                {activeOutput.defaultBackground.url ? (
                  <span className="text-xs text-neutral-300 truncate flex-1 font-mono">{activeOutput.defaultBackground.fileName || 'Local Media File'}</span>
                ) : ( <span className="text-xs text-red-400 italic">No media selected yet</span> )}
              </div>
            )}
            {activeOutput.defaultBackground && (
              <button
                type="button"
                onClick={() => updateOutput(activeOutputId, { defaultBackground: null })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors shrink-0"
                title="Remove this screen's default background (it shows nothing behind the words until you send one)"
                data-remove-default-background
              >
                <X size={13} /> Remove
              </button>
            )}
          </div>
          {/* How strongly the background shows (over black): lower makes the words easier to read */}
          <div className="mt-4 flex items-center gap-3" data-bg-opacity-setting>
            <span className="text-xs font-medium text-white w-36 shrink-0">Background opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={activeOutput.backgroundOpacity ?? 80}
              onChange={(e) => applyOutputLive(activeOutputId, { backgroundOpacity: Number(e.target.value) })}
              className="flex-1 accent-pink-500 cursor-pointer"
            />
            <span className="text-xs font-mono text-neutral-300 w-10 text-right">{activeOutput.backgroundOpacity ?? 80}%</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1.5">Lower it to darken the background picture or video behind the words. The screens follow the slider as you drag (Cancel puts it back). It applies to every background shown on this output, including media you send from the Media tab.</p>
        </div>

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
    { id: 'profiles', name: 'Profiles', icon: Layers },
    { id: 'theme', name: 'Themes', icon: Palette },
    { id: 'smart', name: 'Smart', icon: Activity, hidden: true },
    { id: 'help', name: 'Help', icon: BookOpen },
    { id: 'about', name: 'About', icon: Info },
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
                       ? 'bg-pink-600/20 text-pink-400 shadow-sm' 
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
                            <button onClick={() => void showMessage('Outputs are the screens FlowShow sends to: projectors and TVs (HDMI, DisplayPort or any screen), NDI video over the network (with transparency for overlays), and stage screens.')} className="p-1 hover:text-white transition-colors" title="Output Information">
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
                                    ? 'border-pink-500 bg-pink-600/10' 
                                    : 'border-white/10 bg-[#030303] hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5 px-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {isNdi ? <NdiDot output={out as any} /> : <div className={`w-2 h-2 rounded-full ${out.enabled ? 'bg-pink-400' : 'bg-neutral-600'}`} />}
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
                          <button onClick={() => { const ids = local.outputs.map(o => o.id); setActiveOutputId(ids[(ids.indexOf(activeOutputId) - 1 + ids.length) % ids.length]); }} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Previous"><ChevronLeft size={14} /></button>
                          <button onClick={() => { const ids = local.outputs.map(o => o.id); setActiveOutputId(ids[(ids.indexOf(activeOutputId) + 1) % ids.length]); }} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Next"><ChevronRight size={14} /></button>
                          <button onClick={() => onTogglePresenting?.()} className={`p-1.5 rounded hover:bg-white/5 transition-colors ${isPresenting ? 'text-red-400' : 'text-pink-400'}`} title="Play / Go Live"><Play size={14} /></button>
                          <button onClick={() => onToggleLockOutput?.(activeOutputId)} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Lock Screen"><Lock size={14} /></button>
                        </div>
                     </div>
                  </div>
               )}
               {activeTab === 'profiles' && profilesApi && (
                  <ProfilesPanel
                    {...(profilesApi as ProfilesApi)}
                    // The setup being edited here (with unsaved changes) is what the current profile keeps
                    onSwitch={(id: string) => profilesApi.onSwitch(id, local)}
                    onCreate={(name: string, copy: boolean) => profilesApi.onCreate(name, copy, local)}
                    onExport={(id: string) => profilesApi.onExport(id, local)}
                    onDuplicate={(id: string) => profilesApi.onDuplicate(id, local)}
                  />
               )}
               {activeTab === 'help' && (
                  <div className="space-y-8" data-settings-help>
                     <div>
                        <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">Help</h2>
                        <p className="text-neutral-400 text-sm">Getting started, and the keys that run a service. The online documentation is coming soon.</p>
                     </div>
                     <section>
                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Rocket size={15} className="text-pink-400" /> Quick start</h3>
                        <QuickStartContent />
                     </section>
                     <section>
                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Keyboard size={15} className="text-pink-400" /> Keyboard shortcuts</h3>
                        <ShortcutsContent />
                     </section>
                  </div>
               )}
               {activeTab === 'about' && (
                  <div className="max-w-lg" data-settings-about>
                     <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">About</h2>
                     <AboutContent />
                  </div>
               )}
               {activeTab === 'theme' && (
                  <div data-settings-themes>
                     <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">Themes</h2>
                     <p className="text-neutral-400 text-sm mb-5">The colour of FlowShow's buttons and highlights. It changes at once; the screens your audience sees are not affected.</p>
                     <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {APP_THEMES.map(theme => {
                           const chosen = (local.appTheme || DEFAULT_APP_THEME) === theme.id;
                           const sw = themeSwatch(theme);
                           return (
                              <button
                                 key={theme.id}
                                 type="button"
                                 onClick={() => {
                                    // Saved straight away (like styles), so the whole app shows it at once
                                    commitStyleChange(prev => ({ ...prev, appTheme: theme.id }));
                                 }}
                                 className={`text-left rounded-xl border p-3 transition-colors ${chosen ? 'border-white/60 bg-white/[0.06]' : 'border-white/10 hover:border-white/30 bg-white/[0.02]'}`}
                                 data-theme-choice={theme.id}
                                 data-chosen={chosen ? 'yes' : 'no'}
                              >
                                 <div className="h-14 rounded-lg mb-2.5 flex overflow-hidden border border-white/5" style={{ background: '#09090b' }}>
                                    <div className="flex-1 flex items-center justify-center gap-1.5">
                                       <span className="px-2 py-1 rounded-md text-[11px] font-bold" style={{ background: theme.second.bg, color: theme.second.text }} title="Second colour: the screen you are designing">Output 1</span>
                                       <span className="px-2 py-1 rounded-md text-[11px] font-bold text-white" style={{ background: sw[6] }}>Go live</span>
                                    </div>
                                    <div className="w-1/3 flex flex-col">
                                       {[3, 4, 5, 6, 7].map(i => <div key={i} className="flex-1" style={{ background: sw[i] }} />)}
                                    </div>
                                 </div>
                                 <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-white">{theme.name}</span>
                                    {chosen && <Check size={15} className="text-white" />}
                                 </div>
                                 <span className="text-[11px] text-neutral-500">{theme.description}</span>
                              </button>
                           );
                        })}
                     </div>
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
               {!['outputs', 'style', 'help', 'about', 'theme', 'profiles'].includes(activeTab) && (
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
                             ? 'bg-[#121214] text-white border border-pink-500/50 shadow-sm' 
                             : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5 border border-transparent'
                           }`}
                       >
                         {/* Checkmark icon as shown in Image c & e */}
                         <Check size={12} className={out.enabled ? (isNdi ? 'text-emerald-400' : 'text-pink-400') : 'text-neutral-600'} />
                         {isActive
                           ? <InlineName value={out.name} onRename={(name) => updateOutput(out.id, { name })} className="truncate" inputClassName="w-28 text-xs py-0.5" title="Click to rename this output" />
                           : <span className="truncate">{out.name}</span>}
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
                     className="px-3 py-1.5 text-pink-400 hover:text-pink-300 hover:bg-pink-600/10 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ml-1 shrink-0"
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
                <button onClick={cancelSettings} className="px-5 py-2 hover:bg-white/5 text-neutral-300 transition-colors rounded-lg text-xs font-medium">Cancel</button>
                <button onClick={() => { onSave(local); onClose(); }} className="px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2 shadow-lg"><Save size={14} /> Save Settings</button>
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
                        ? 'border-pink-500 bg-pink-600/10 text-white'
                        : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <Icon size={28} className={selectedNewOutputKind === kind ? 'text-pink-400' : ''} />
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
                      ? 'border-pink-500 bg-pink-600/10 text-white' 
                      : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <MonitorPlay size={36} className={selectedNewOutputType === 'hdmi' ? 'text-pink-400' : ''} />
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
                      ? 'border-pink-500 bg-pink-600/10 text-white' 
                      : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <Wifi size={24} className={selectedNewOutputType === 'ndi' ? 'text-pink-400' : ''} />
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
              className="w-full py-3 bg-pink-600 hover:bg-pink-500 disabled:opacity-30 disabled:hover:bg-pink-600 text-white font-bold text-sm rounded-xl transition-all shadow-lg"
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
  /** A show is a Song or a Declaration (older saved Presentations are turned into Songs when loaded) */
  category?: 'Presentations' | 'Songs' | 'Declarations';
  createdAt?: string;
  modifiedAt?: string;
  usedAt?: string;
  slides: SlideDefinition[];
  /** Looks assigned to sections of this song, by group name */
  groupLooks?: { [group: string]: GroupLook };
  /** The show's Media Mixer layers (they travel with the show to every setlist) */
  mix?: ShowMix;
}

const MOCK_SONGS: PresentationItem[] = [
  {
    id: 'show-welcome',
    title: 'Welcome',
    category: 'Songs',
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
  const [appMode, setAppMode] = useState<'show' | 'design' | 'mix' | 'stage'>('show');
  // Mix mode: changes go to the screens as soon as they are let go (off = they wait for Update screens / the next slide)
  const [mixAutoSend, setMixAutoSend] = useState(false);
  // Mix mode opened from Design mode on a slide picture (which slide and picture to show)
  const [mixFocus, setMixFocus] = useState<{ slideId: string; mediaId?: string; at: number } | null>(null);
  const [designOutputId, setDesignOutputId] = useState('main');
  // Slide picked in the Design strip; null = follow the slide that's on air
  const [designSlideId, setDesignSlideId] = useState<string | null>(null);
  // Right-click menu on a group in the Arrangement Groups panel
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number; songId: string; group: string } | null>(null);
  // Stage output shown in the Stage tab (null = the first one)
  const [stageOutputId, setStageOutputId] = useState<string | null>(null);
  // ─── Profiles: one screen setup per venue ───
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [activeProfileId, setActiveProfileId] = useState('main');
  const profilesLoadedRef = useRef(false);
  useEffect(() => { loadProfiles().then(({ profiles, activeId }) => { setProfiles(profiles); setActiveProfileId(activeId); profilesLoadedRef.current = true; }); }, []);
  useEffect(() => { if (profilesLoadedRef.current) void saveProfiles(profiles, activeProfileId); }, [profiles, activeProfileId]);
  const downloadFile = (blob: Blob, name: string) => {
    downloadBlob(blob, name).catch(err => setUndoToast({ text: `Couldn't save "${name}": ${err instanceof Error ? err.message : String(err)}`, at: Date.now(), kind: 'error', noUndo: true }));
  };
  const now = () => new Date().toISOString();
  // `current`: the setup as it is now (with unsaved Settings changes); the active profile keeps it
  const switchProfile = (id: string, current: GlobalSettings) => {
    const target = profiles.find(p => p.id === id);
    if (!target || id === activeProfileId) return;
    setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, settings: current, updatedAt: now() } : p));
    setActiveProfileId(id);
    setGlobalSettings(normaliseSettings(target.settings || DEFAULT_SETTINGS));
    setUndoToast({ text: `Profile "${target.name}" in use`, at: Date.now(), kind: 'info', noUndo: true });
  };
  const profilesApi = {
    profiles,
    activeId: activeProfileId,
    onSwitch: switchProfile,
    onCreate: (name: string, copyCurrent: boolean, current: GlobalSettings) => {
      const id = `profile-${Date.now().toString(36)}`;
      const record: ProfileRecord = { id, name, settings: copyCurrent ? current : DEFAULT_SETTINGS, createdAt: now(), updatedAt: now() };
      setProfiles(prev => [...prev.map(p => p.id === activeProfileId ? { ...p, settings: current, updatedAt: now() } : p), record]);
      setActiveProfileId(id);
      setGlobalSettings(normaliseSettings(record.settings));
    },
    onRename: (id: string, name: string) => setProfiles(prev => prev.map(p => p.id === id ? { ...p, name, updatedAt: now() } : p)),
    onDuplicate: (id: string, current: GlobalSettings) => {
      const source = profiles.find(p => p.id === id);
      if (!source) return;
      setProfiles(prev => [...prev, { id: `profile-${Date.now().toString(36)}`, name: `${source.name} (copy)`, settings: id === activeProfileId ? current : source.settings, createdAt: now(), updatedAt: now() }]);
    },
    onDelete: (id: string) => { if (id !== activeProfileId) setProfiles(prev => prev.filter(p => p.id !== id)); },
    onExport: (id: string, current: GlobalSettings) => {
      const p = profiles.find(x => x.id === id);
      if (!p) return;
      downloadFile(buildProfileFile(p.name, id === activeProfileId ? current : (p.settings || DEFAULT_SETTINGS)), `${p.name}${PROFILE_EXTENSION}`);
    },
    onImport: async (file: File) => {
      try {
        const { name, settings, templatesAdded } = await readProfileFile(file);
        const unique = profiles.some(p => p.name === name) ? `${name} (imported)` : name;
        setProfiles(prev => [...prev, { id: `profile-${Date.now().toString(36)}`, name: unique, settings, createdAt: now(), updatedAt: now() }]);
        return `Imported "${unique}"${templatesAdded ? ` with ${templatesAdded} template${templatesAdded === 1 ? '' : 's'}` : ''}. Click "Switch to" to use it.`;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
  };

  // Settings opened on a particular tab (null = where it was)
  const [settingsOpenTab, setSettingsOpenTab] = useState<string | null>(null);

  // The + menu in the Projects panel (new show, project, folder, project template, import)
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuAt, setCreateMenuAt] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!createMenuOpen) return;
    const onPointer = (e: PointerEvent) => { if (!(e.target instanceof Element && e.target.closest('[data-create-menu]'))) setCreateMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCreateMenuOpen(false); } };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('pointerdown', onPointer, true); window.removeEventListener('keydown', onKey, true); };
  }, [createMenuOpen]);

  // The song importer (+ → Import)
  const [isImportOpen, setIsImportOpen] = useState(false);
  // Song files chosen with File → Import, waiting for Songs / Declarations to be picked
  const [pendingShowFiles, setPendingShowFiles] = useState<File[] | undefined>(undefined);
  // File → Import: the list of what can be imported
  const [importChooserOpen, setImportChooserOpen] = useState(false);

  // ─── Top menus: File, View, Help ───
  const [appDialog, setAppDialog] = useState<'export' | 'shortcuts' | 'quickstart' | 'about' | 'docs' | null>(null);
  const [templateExport, setTemplateExport] = useState<'one' | 'all' | null>(null);
  const [templateImportFile, setTemplateImportFile] = useState<File | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);
  // Focus mode: only the slides, big (no side panels, no lower section)
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setFocusMode(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if ('__TAURI_INTERNALS__' in window) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const w = getCurrentWindow();
        await w.setFullscreen(!(await w.isFullscreen()));
      } else if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (err) {
      setUndoToast({ text: `Full screen isn't available here: ${err instanceof Error ? err.message : String(err)}`, at: Date.now(), kind: 'error' });
    }
  };
  const toast = (text: string, error = false) => setUndoToast({ text, at: Date.now(), kind: error ? 'error' : 'info', noUndo: true });
  // An export was saved (Documents\FlowShow\…): show where, with a button to open the folder
  const [savedFile, setSavedFile] = useState<SavedFile | null>(null);
  useEffect(() => {
    const onSaved = (e: Event) => { setUndoToast(null); setSavedFile((e as CustomEvent<SavedFile>).detail); };
    window.addEventListener(FILE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(FILE_SAVED_EVENT, onSaved);
  }, []);
  useEffect(() => {
    if (!savedFile) return;
    const t = setTimeout(() => setSavedFile(null), 20000);
    return () => clearTimeout(t);
  }, [savedFile]);


  // FlowShow's own song files (one song or all of them, with their designs and groups)
  const SONGS_EXTENSION = '.flowshow-songs';
  const exportSongs = (songs: PresentationItem[], name: string) => {
    downloadFile(new Blob([JSON.stringify({ format: 'flowshow-songs', formatVersion: 1, exportedAt: new Date().toISOString(), songs }, null, 1)], { type: 'application/json' }), `${name}${SONGS_EXTENSION}`);
  };
  const importSongsFile = async (file: File) => {
    let data: any;
    try { data = JSON.parse(await file.text()); } catch { data = null; }
    if (data?.format !== 'flowshow-songs' || !Array.isArray(data.songs)) { toast(`“${file.name}” isn't a FlowShow songs file`, true); return; }
    const incoming = (data.songs as PresentationItem[]).filter(sg => sg?.id && Array.isArray(sg.slides));
    // A song already here (same id) is updated; others are added
    const updated = incoming.filter(sg => songsList.some(x => x.id === sg.id)).length;
    setSongsList(prev => [...prev.map(x => incoming.find(sg => sg.id === x.id) || x), ...incoming.filter(sg => !prev.some(x => x.id === sg.id))]);
    toast(`Songs imported: ${incoming.length - updated} new, ${updated} updated`);
  };

  const runExport = async (choice: ExportChoice) => {
    const song = songsList[activeItemIndex];
    if (choice === 'song' && song) exportSongs([song], song.title);
    else if (choice === 'songs') exportSongs(songsList, 'FlowShow songs');
    else if (choice === 'template') setTemplateExport('one');
    else if (choice === 'templates') setTemplateExport('all');
    else if (choice === 'profile') profilesApi.onExport(activeProfileId, globalSettings);
    else if (choice === 'database') {
      toast('Preparing the backup…');
      try {
        downloadFile(await buildBackup(), `FlowShow backup ${new Date().toISOString().slice(0, 10)}${BACKUP_EXTENSION}`);
      } catch (err) {
        toast(`Couldn't make the backup: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  };

  // File → Import: works out what each file is
  const importAnyFiles = async (files: File[]) => {
    const showFiles: File[] = [];
    for (const file of files) {
      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
      if (ext === '.fstemplates') setTemplateImportFile(file);
      else if (ext === '.flowshow-profile') toast((await profilesApi.onImport(file)).replace('Click "Switch to" to use it.', 'Choose it in the Profile menu to use it.'));
      else if (ext === BACKUP_EXTENSION) {
        if (!(await askConfirm(`Restore the backup "${file.name}"? Everything in FlowShow now (songs, projects, settings, profiles, templates, Bibles) is replaced by the backup. Export a backup first if you might need what's here.`, { okLabel: 'Restore', danger: true }))) continue;
        try { await restoreBackup(file); window.location.reload(); } catch (err) { toast(err instanceof Error ? err.message : String(err), true); }
      }
      else if (ext === SONGS_EXTENSION) await importSongsFile(file);
      else if (ext === '.xml') {
        // A song in OpenLyrics / OpenSong XML, or a Bible
        if (isSongXml(await file.slice(0, 4000).text())) showFiles.push(file);
        else await importBibleFile(file);
      }
      else showFiles.push(file);
    }
    if (showFiles.length) { setPendingShowFiles(showFiles); setIsImportOpen(true); }
  };
  // A choice in the Import window: song files ask Songs or Declarations; FlowShow files and Bibles go straight in
  const importChosenFiles = async (kind: ImportKind, files: File[]) => {
    if (kind === 'flowshow') await importAnyFiles(files);
    else if (kind === 'bible') { for (const file of files) await importBibleFile(file); }
    else { setPendingShowFiles(files); setIsImportOpen(true); }
  };
  // Imported shows join the library as Songs or Declarations
  const addImportedShows = (shows: ImportedShow[], category: 'Songs' | 'Declarations') => {
    const now = Date.now();
    const declaration = category === 'Declarations';
    const items = shows.map((sh, i) => ({
      id: `song-${now}-${i}`,
      title: sh.title,
      category,
      createdAt: new Date().toISOString(),
      slides: sh.slides.map((slide, k) => ({
        id: `s-${now}-${i}-${k}`,
        text: slide.text,
        type: 'lyrics' as SlideType,
        ...(slide.group ? { group: slide.group } : {}),
        ...(declaration ? { declaration: true } : {}),
      })),
    }));
    setSongsList(prev => [...prev, ...items]);
    setUndoToast({ text: `Imported ${items.length} ${items.length === 1 ? 'show' : 'shows'}`, at: Date.now(), kind: 'info' });
  };
  // Design mode designs the song slides, or how scripture looks on the screen
  const [designFor, setDesignFor] = useState<DesignFor>('lyrics');
  // The overlay open in Design mode (For overlays)
  const [designOverlayId, setDesignOverlayId] = useState<string | null>(null);
  // Open Design mode on a slide, or (null) on whatever is on air: a Bible verse on air opens the scripture design
  const openDesign = (slideId: string | null = null) => {
    setDesignSlideId(slideId);
    const live = liveState.slide;
    const picked = slideId ? findSlideById(slideId) : null;
    setDesignFor(picked ? (picked.declaration ? 'declaration' : 'lyrics')
      : live?.type === 'scripture' && !songsList.some(song => song.slides.some(s => s.id === live.id)) ? 'scripture'
      : live?.declaration ? 'declaration' : 'lyrics');
    setAppMode('design');
  };
  const [activeTab, setActiveTab] = useState<'shows' | 'songs' | 'setlist' | 'bibles' | 'media' | 'audio'>('songs');
  // The slide list the arrow keys move through when the Media or Audio tab is open (the show last open there)
  const lastSlideTabRef = useRef<'songs' | 'setlist'>('songs');
  useEffect(() => { if (activeTab === 'songs' || activeTab === 'setlist') lastSlideTabRef.current = activeTab; }, [activeTab]);
  const [bottomTab, setBottomTab] = useState<'shows' | 'media' | 'audio' | 'overlays' | 'templates' | 'scripture' | 'timers' | 'calendar' | 'functions'>('shows');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Songs' | 'Declarations'>('all');
  const [rightInspectorTab, setRightInspectorTab] = useState<'groups' | 'metadata'>('groups');
  const [selectedProjectFolder, setSelectedProjectFolder] = useState<string>('11/18/26');

  // Inline template grid
  const [inlineTemplates, setInlineTemplates] = useState<PresentationTemplate[]>(STARTER_TEMPLATES);
  useEffect(() => { getStoredTemplates().then(setInlineTemplates); void loadInstalledFonts(); }, []);
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

  useEffect(() => { if (appMode === 'mix') setBottomTab('media'); }, [appMode]);

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
  // ─── Projects: one setlist per service, grouped in folders; serviceSetlist is the open one ───
  const [projectsState, setProjectsState] = useState<ProjectsState>({ projects: [DEFAULT_SAMPLE_SETLIST], activeId: DEFAULT_SAMPLE_SETLIST.id, folders: [] });
  const serviceSetlist: ServiceSetlist = projectsState.projects.find(p => p.id === projectsState.activeId) || projectsState.projects[0];
  const projectsLoadedRef = useRef(false);
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
    loadProjects().then(state => {
      projectsLoadedRef.current = true;
      setProjectsState(state);
      const open = state.projects.find(p => p.id === state.activeId);
      const firstPlayable = open?.items.find(i => i.type !== 'header');
      if (firstPlayable) setActiveSetlistItemId(firstPlayable.id);
    });
  }, []);
  useEffect(() => { if (projectsLoadedRef.current) void saveProjects(projectsState); }, [projectsState]);

  const handleUpdateSetlist = (newSetlist: ServiceSetlist) =>
    setProjectsState(prev => ({ ...prev, projects: prev.projects.map(p => p.id === newSetlist.id ? newSetlist : p) }));

  // A setlist's songs follow the library: edits to a song show in every project that has it
  useEffect(() => {
    setProjectsState(prev => {
      let changed = false;
      const projects = prev.projects.map(p => {
        let itemsChanged = false;
        const items = p.items.map(item => {
          const song = item.songId ? songsList.find(sg => sg.id === item.songId) : undefined;
          if (!song || item.slides === song.slides) return item;
          itemsChanged = true;
          return { ...item, title: song.title, slides: song.slides };
        });
        if (!itemsChanged) return p;
        changed = true;
        return { ...p, items };
      });
      return changed ? { ...prev, projects } : prev;
    });
  }, [songsList]);

  const openProject = (id: string) => {
    setProjectsState(prev => ({ ...prev, activeId: id }));
    const project = projectsState.projects.find(p => p.id === id);
    setActiveSetlistItemId(project?.items.find(i => i.type !== 'header')?.id ?? null);
    setSetlistViewMode('manager');
    setActiveTab('setlist');
  };
  // Clicking a setlist item: its slides (the first goes live), or its media as the background
  /** A setlist item: one click opens it in Preview; a double-click (`live`) sends it to the screens */
  const openSetlistItem = (projectId: string, item: SetlistItem, live = false) => {
    setProjectsState(prev => prev.activeId === projectId ? prev : { ...prev, activeId: projectId });
    setActiveTab('setlist');
    setActiveSetlistItemId(item.id);
    // Media goes on the screens only with a double-click
    if (item.type === 'media' && !live) return;
    if (item.type === 'media' && item.mediaRef) {
      // A file from an added folder: find it there again (its earlier link only lasted that session)
      const ref = item.mediaRef;
      resolveMediaRef(ref).then(url => {
        if (url) showVideoOrPicture(url, item.mediaType || 'image', { name: item.title, path: item.mediaPath, ref });
        else setUndoToast({ text: `Couldn't open "${item.title}": the folder "${ref.folder}" isn't added, or the file was moved`, at: Date.now(), kind: 'error' });
      });
      return;
    }
    if (item.type === 'media' && item.backgroundUrl) {
      showVideoOrPicture(item.backgroundUrl, item.mediaType || 'image', { name: item.title, path: item.mediaPath });
      return;
    }
    if (item.slides && item.slides.length > 0) {
      setSetlistViewMode('slides');
      setPreviewSlide(item.slides[0]);
      if (live) goLive(item.slides[0]);
    }
  };
  const newProject = async (folder?: string) => {
    const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const name = await askText('Name for the new project (one service)', `Service ${date}`, { okLabel: 'Create' });
    if (!name) return;
    const project: ServiceSetlist = { id: `project-${Date.now().toString(36)}`, name, date, items: [], folder };
    setProjectsState(prev => ({ ...prev, projects: [...prev.projects, project], activeId: project.id }));
    setActiveSetlistItemId(null);
    setSetlistViewMode('manager');
    setActiveTab('setlist');
  };
  const newFolder = async () => {
    const name = await askText('Name for the new folder (for example Sunday Services, Youth)', '', { okLabel: 'Create' });
    if (name) setProjectsState(prev => prev.folders.includes(name) ? prev : { ...prev, folders: [...prev.folders, name] });
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
            setGlobalSettings(normaliseSettings(val));
        } else {
            setGlobalSettings(prev => ({ ...prev }));
        }
    });
    get('songsList').then((val) => {
      if (val) {
        skipNextUndoRecordRef.current = true; // loading isn't an edit
        // There are only Songs and Declarations now: older Presentations (or shows with no category) become Songs
        setSongsList((val as PresentationItem[]).map(s => s.category === 'Declarations' || s.category === 'Songs' ? s : { ...s, category: 'Songs' as const }));
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
  // Short message at the bottom of the screen: undo/redo, 'info' for other changes (Ctrl+Z can undo them unless
  // noUndo), or 'error' when something couldn't be done
  const [undoToast, setUndoToast] = useState<{ text: string; at: number; kind?: 'info' | 'error'; noUndo?: boolean } | null>(null);

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
    const t = setTimeout(() => setUndoToast(null), undoToast.kind === 'error' ? 9000 : undoToast.kind === 'info' ? 3200 : 1400);
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
  // The Stage designer and the scripture design undo their own changes
  undoActionsRef.current = { undo: undoSongChange, redo: redoSongChange, allowed: () => appMode !== 'stage' && !(appMode === 'design' && designFor !== 'lyrics') };

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
  // Slides marked on the main grid (Ctrl+click / Shift+click) for right-click actions; a plain click still goes live
  const [gridChosen, setGridChosen] = useState<Set<string>>(() => new Set());
  // What the Delete key acts on in Show mode: the part of the window clicked last
  const deleteAreaRef = useRef<'slides' | 'setlist' | 'shows' | null>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      deleteAreaRef.current = el?.closest?.('[data-delete-area="slides"]') ? 'slides'
        : el?.closest?.('[data-setlist-row]') ? 'setlist'
        : el?.closest?.('[data-show-row]') ? 'shows'
        : null;
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);
  const gridAnchor = useRef<number | null>(null);
  useEffect(() => { setGridChosen(prev => prev.size ? new Set() : prev); gridAnchor.current = null; }, [activeItemIndex, activeSetlistItemId, activeTab]);

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
  // Bumped to load the open Bible again (after importing a new copy of it)
  const [bibleReload, setBibleReload] = useState(0);
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
  
  useEffect(() => {
    applyAppTheme(globalSettings.appTheme);
    try { localStorage.setItem('flowshow_app_theme', globalSettings.appTheme || DEFAULT_APP_THEME); } catch { /* fine */ }
  }, [globalSettings.appTheme]);
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null, globalBackground: null, clearText: false, settings: globalSettings, isPresenting: false, clearedOutputs: {}, lockedOutputs: {}, frozenStates: {}
  });

  // Desktop app: while presenting, every enabled NDI output is a real NDI source (they stop when presenting stops);
  // changes to their settings restart them
  const ndiKey = JSON.stringify([liveState.isPresenting, ...globalSettings.outputs.filter((o: any) => o.outputType === 'ndi').map((o: any) => [o.id, o.name, o.enabled, o.ndiStreamName, o.ndiGroup, o.ndiResolution, o.ndiFrameRate, o.ndiTransparent])]);
  const ndiProblemsShown = useRef('');
  useEffect(() => {
    if (!isTauri()) return;
    const t = setTimeout(() => {
      syncNdiOutputs((globalSettings.outputs as any[]).map(o => ({ ...o, enabled: o.enabled && !!liveState.isPresenting }))).then(problems => {
        setNdiProblems(problems);
        const text = Object.entries(problems).map(([id, p]) => `${globalSettings.outputs.find((o: any) => o.id === id)?.name || id}: ${p}`).join(' · ');
        if (text && text !== ndiProblemsShown.current) setUndoToast({ text: `NDI: ${text}`, at: Date.now(), kind: 'error', noUndo: true });
        ndiProblemsShown.current = text;
      });
    }, 500);
    return () => clearTimeout(t);
  }, [ndiKey]);

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  const togglePresenting = () => {
    const starting = !liveState.isPresenting;
    setLiveState(prev => ({ ...prev, isPresenting: !prev.isPresenting }));
    // Starting opens each enabled screen output on its screen; stopping closes them (NDI sources stop too)
    if (starting) void openScreenOutputs();
    else void closeScreenOutputs();
  };
  /** Close every screen output window (projectors, TVs, stage screens) */
  const closeScreenOutputs = async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    for (const o of globalSettings.outputs as OutputSettings[]) {
      if (o.outputType === 'ndi') continue;
      try { await invoke('close_output_window', { label: `projector-${o.id}` }); } catch { /* not open */ }
    }
  };
  /** Open every enabled screen (HDMI…) output that has a screen chosen, except one on FlowShow's own screen */
  const openScreenOutputs = async () => {
    if (!isTauri()) return;
    const outs = (globalSettings.outputs as OutputSettings[]).filter(o => o.enabled && o.outputType !== 'ndi' && o.displayId);
    if (!outs.length) return;
    const skipped: string[] = [];
    for (const o of outs) {
      try {
        const r = await openOutputOnMonitor(`projector-${o.id}`, `/projector/${o.id}`, o.name, o.displayId!, () => false);
        if (r === 'cancelled') skipped.push(o.name);
      } catch (err) {
        setUndoToast({ text: `Couldn't open ${o.name}: ${err instanceof Error ? err.message : String(err)}`, at: Date.now(), kind: 'error', noUndo: true });
      }
    }
    if (skipped.length) setUndoToast({ text: `${skipped.join(', ')} ${skipped.length === 1 ? 'is' : 'are'} set to the screen FlowShow is on, so ${skipped.length === 1 ? 'it was' : 'they were'} not opened. Use its monitor (or plug in the projector) to show it.`, at: Date.now(), kind: 'info', noUndo: true });
  };

  const toggleClearOutput = (outputId: string) => {
    setLiveState(prev => ({
        ...prev,
        clearedOutputs: { ...prev.clearedOutputs, [outputId]: !prev.clearedOutputs?.[outputId] }
    }));
  };

  const toggleLockOutput = (outputId: string) => {
    setLiveState(prev => {
        const state = prev.lockedOutputs?.[outputId];
        // Unpausing: keep the paused picture on this screen; it changes with the next thing you send
        if (state === true) return { ...prev, lockedOutputs: { ...prev.lockedOutputs, [outputId]: 'held' } };
        // Pausing again while held: the same picture stays
        if (state === 'held') return { ...prev, lockedOutputs: { ...prev.lockedOutputs, [outputId]: true } };
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
                [outputId]: { slide: prev.slide, bg: currentActiveBg, clearText: prev.clearText, overlays: overlaysFor(prev.settings?.overlays, prev.overlays, outputId), mix: prev.mix }
            }
        };
    });
  };

  // ─── Overlays: several can be on at once; they stay through slide, background and Clear all; F3 takes them off ───
  const toggleOverlay = (id: string) => setLiveState(prev => {
    const on = prev.overlays || [];
    return { ...prev, ...releaseHeld(prev), overlays: on.includes(id) ? on.filter(x => x !== id) : [...on, id] };
  });
  const clearOverlays = () => setLiveState(prev => prev.overlays?.length ? { ...prev, ...releaseHeld(prev), overlays: [] } : prev);
  const setOverlays = (overlays: Overlay[]) => setGlobalSettings(prev => ({ ...prev, overlays }));
  const saveOverlay = (o: Overlay) => setGlobalSettings(prev => ({ ...prev, overlays: (prev.overlays || []).map(x => x.id === o.id ? o : x) }));
  const editOverlay = (id: string) => { setDesignOverlayId(id); setDesignFor('overlay'); setAppMode('design'); };
  const createOverlay = async () => {
    const name = await askText('Name for the new overlay (for example Logo, Lower third, Live bug)', '', { okLabel: 'Create' });
    if (!name?.trim()) return;
    const o = newOverlay(name.trim());
    setGlobalSettings(prev => ({ ...prev, overlays: [...(prev.overlays || []), o] }));
    setDesignOverlayId(o.id);
  };

  // ─── Timers: one at a time; to start another, stop the one in use or let it end ───
  const startTimer = (p: TimerPreset) => setLiveState(prev => timerBusy(prev.timer) ? prev
    : { ...prev, timer: { presetId: p.id, name: p.name, durationMs: p.seconds * 1000, startedAt: Date.now(), remainingMs: p.seconds * 1000, flicker: globalSettings.timeUpFlicker !== false } });
  // The flicker choice is kept, and also applies at once to the timer in use
  const setTimeUpFlicker = (on: boolean) => {
    setGlobalSettings(prev => ({ ...prev, timeUpFlicker: on }));
    setLiveState(prev => prev.timer ? { ...prev, timer: { ...prev.timer, flicker: on } } : prev);
  };
  const pauseResumeTimer = () => setLiveState(prev => {
    const t = prev.timer;
    if (!t) return prev;
    return t.startedAt === null
      ? { ...prev, timer: { ...t, startedAt: Date.now() } }
      : { ...prev, timer: { ...t, startedAt: null, remainingMs: timeLeft(t) } };
  });
  const stopTimer = () => setLiveState(prev => ({ ...prev, timer: null }));
  const adjustTimer = (deltaMs: number) => setLiveState(prev => {
    const t = prev.timer;
    if (!t) return prev;
    const left = Math.max(0, timeLeft(t) + deltaMs);
    return { ...prev, timer: { ...t, remainingMs: left, startedAt: t.startedAt === null ? null : Date.now(), durationMs: Math.max(t.durationMs, left) } };
  });
  // Stage screens drawn in this window read the timer from here
  useEffect(() => { setSharedTimer(liveState.timer); }, [liveState.timer]);

  /** Sending something new (a slide, a background, a clear) releases the screens that were held after unpausing */
  const releaseHeld = (prev: PresentState): Partial<PresentState> => {
    const held = Object.entries(prev.lockedOutputs || {}).filter(([, v]) => v === 'held').map(([k]) => k);
    if (!held.length) return {};
    const lockedOutputs = { ...prev.lockedOutputs };
    const frozenStates = { ...prev.frozenStates };
    held.forEach(id => { delete lockedOutputs[id]; delete frozenStates[id]; });
    return { lockedOutputs, frozenStates };
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

  // App shortcuts: Ctrl+I import, Ctrl+E export, F11 full screen; 1 / 2 / 3 / ` the modes; Shift+1…6 the lower tabs;
  // in Scripture: Ctrl+H history, Ctrl+F reference search, Ctrl+B search the Bible
  const appKeysRef = useRef<() => void>(() => {});
  const openBottomTab = (tab: 'shows' | 'media' | 'overlays' | 'templates' | 'scripture' | 'timers') => {
    setBottomTab(tab);
    if (tab === 'media') setActiveTab('media');
    else if (tab === 'scripture') setActiveTab('bibles');
    else if (tab === 'shows') setActiveTab('songs');
    setBottomPanelCollapsed(false);
    setFocusMode(false);
  };
  const appKeys = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const el = e.target as HTMLElement | null;
    const typing = isTyping(e.target);
    if (e.key === 'F11' && !ctrl && !e.altKey && !e.shiftKey) { e.preventDefault(); void toggleFullscreen(); return; }
    if (ctrl && !e.altKey && !e.shiftKey) {
      if (e.code === 'KeyI' && !el?.isContentEditable) { e.preventDefault(); setImportChooserOpen(true); return; }
      if (e.code === 'KeyE' && !el?.isContentEditable) { e.preventDefault(); setAppDialog('export'); return; }
      if (appMode === 'show' && activeTab === 'bibles') {
        if (e.code === 'KeyH') { e.preventDefault(); setBibleSearchQuery(''); setBibleKeywordQuery(''); setShowBibleHistory(v => !v); return; }
        if (e.code === 'KeyF' || e.code === 'KeyB') {
          e.preventDefault();
          setShowBibleHistory(false);
          const box = document.querySelector<HTMLInputElement>(e.code === 'KeyF' ? '[data-bible-ref-search]' : '[data-bible-keyword-search]');
          box?.focus(); box?.select();
          return;
        }
      }
      return;
    }
    if (typing || ctrl || e.altKey) return;
    if (!e.shiftKey) {
      if (e.code === 'Digit1') { e.preventDefault(); setAppMode('show'); return; }
      if (e.code === 'Digit2') { e.preventDefault(); if (appMode !== 'design') openDesign(); return; }
      if (e.code === 'Digit3') { e.preventDefault(); setAppMode('mix'); return; }
      if (e.code === 'Backquote') { e.preventDefault(); setAppMode('stage'); return; }
      return;
    }
    const tabs = ['shows', 'media', 'overlays', 'templates', 'scripture', 'timers'] as const;
    const n = /^Digit([1-6])$/.exec(e.code);
    if (n) { e.preventDefault(); openBottomTab(tabs[Number(n[1]) - 1]); }
  };
  appKeysRef.current = appKeys as any;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (appKeysRef.current as any)(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keyboard Navigation Support & Live Production Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      // Delete: remove what was picked in the part of the window clicked last (Design, Mix and Stage handle their own)
      if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.altKey && appMode === 'show' && !isTyping(e.target)) {
        const area = deleteAreaRef.current;
        if ((area === 'slides' && deletePickedSlides()) || (area === 'setlist' && removeOpenSetlistItem()) || (area === 'shows' && deleteOpenShow())) {
          e.preventDefault();
          return;
        }
      }
      // K: play / pause the playback video (only while one is on)
      if ((e.key === 'k' || e.key === 'K') && !e.ctrlKey && !e.metaKey && !e.altKey && liveState.globalBackground?.playback) {
        e.preventDefault();
        window.dispatchEvent(new Event(PLAYBACK_TOGGLE_EVENT));
        return;
      }
      // Ctrl+O: start / stop presenting (the screens on or off)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyO') {
        e.preventDefault();
        togglePresenting();
        return;
      }
      // Pause / unpause an output: Ctrl+1, Ctrl+2… (normal outputs in order), Ctrl+` (stage screens).
      // A paused output keeps what it shows; what is sent next goes only to the others until it is unpaused.
      // (Screens are switched off only with the Presenting button, never by a key.)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (/^Digit[1-9]$/.test(e.code) || e.code === 'Backquote')) {
        e.preventDefault();
        const outs = (liveState.settings?.outputs || globalSettings.outputs) as OutputSettings[];
        const targets = e.code === 'Backquote'
          ? outs.filter(o => isStageOutput(o))
          : [outs.filter(o => !isStageOutput(o))[Number(e.code.slice(5)) - 1]].filter(Boolean);
        if (!targets.length) {
          setUndoToast({ text: e.code === 'Backquote' ? 'There is no stage screen to pause.' : `There is no Output ${e.code.slice(5)} to pause.`, at: Date.now(), kind: 'info', noUndo: true });
          return;
        }
        const pausing = liveState.lockedOutputs?.[targets[0].id] !== true;
        targets.forEach(o => { if ((liveState.lockedOutputs?.[o.id] === true) !== pausing) toggleLockOutput(o.id); });
        setUndoToast({ text: `${targets.map(o => o.name).join(', ')} ${pausing ? 'paused: what you send next won’t go there' : 'unpaused: keeps its picture until you send the next slide'}`, at: Date.now(), kind: 'info', noUndo: true });
        return;
      }
      if (e.key === 'F2' || ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        toggleClearText();
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        setGlobalBackground(null);
        return;
      }
      // Overlays come off only with F3 (Clear all leaves them)
      if (e.key === 'F3') {
        e.preventDefault();
        clearOverlays();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearAll();
        setGridChosen(prev => prev.size ? new Set() : prev);
        return;
      }

      // The arrows move through the open show's slides even while the Media or Audio tab is open
      const slideTab = activeTab === 'media' || activeTab === 'audio' ? lastSlideTabRef.current : activeTab;
      // FORWARD PROGRESSION (Space, PageDown, ArrowDown, ArrowRight)
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
         e.preventDefault();

         if (slideTab === 'setlist') {
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
         } else if (slideTab === 'songs') {
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

         if (slideTab === 'setlist') {
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
         } else if (slideTab === 'songs') {
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
  }, [activeTab, activeItemIndex, serviceSetlist, activeSetlistItemId, activeBibleData, activeBibleBookIndex, activeBibleChapterIndex, activeBibleVerseIndex, liveState, previewSlide, songsList, isShowingThreeColumns, gridChosen, appMode]);


  // The Bibles, opening the one that was open last time
  useEffect(() => {
    const showList = () => getBibleList().then(list => {
      setBibleList(list);
      let remembered: string | null = null;
      try { remembered = localStorage.getItem('activeBibleId'); } catch {}
      setActiveBibleId(list.find(b => b.id === remembered)?.id ?? list[0]?.id ?? null);
    });
    initDatabase().catch(err => console.warn('Bible storage', err)).finally(showList);
  }, []);

  useEffect(() => {
    try { if (activeBibleId) localStorage.setItem('activeBibleId', activeBibleId); } catch {}
  }, [activeBibleId]);

  // Load the chosen Bible. Switching Bibles stays at the same place (the same book, chapter and verse) and shows
  // it in preview without sending it live.
  useEffect(() => {
    if (!activeBibleId) {
      setActiveBibleData(null);
      setActiveBibleBookIndex(null);
      setActiveBibleChapterIndex(null);
      setActiveBibleVerseIndex(null);
      return;
    }
    const shownBefore = activeBibleData; // the Bible open until now (or an older copy of this one)
    let cancelled = false;
    getBible(activeBibleId).then(data => {
      if (cancelled || !data) return;
      setActiveBibleData(data);
      const hadPlace = bIndexRef.current !== null;
      const oldBook = hadPlace ? shownBefore?.books[bIndexRef.current!] : undefined;
      const oldChapter = oldBook && cIndexRef.current !== null ? oldBook.chapters[cIndexRef.current] : undefined;
      const oldVerse = oldChapter && vIndexRef.current !== null ? oldChapter.verses[vIndexRef.current] : undefined;
      const findOr = (found: number, fallback: number | null, count: number) =>
        found >= 0 ? found : Math.max(0, Math.min(fallback ?? 0, count - 1));

      const books = data.books;
      if (!books.length) { setActiveBibleBookIndex(null); setActiveBibleChapterIndex(null); setActiveBibleVerseIndex(null); return; }
      const bIdx = findOr(oldBook ? books.findIndex(b => b.name === oldBook.name) : -1, bIndexRef.current, books.length);
      const chapters = books[bIdx].chapters;
      const cIdx = chapters.length ? findOr(oldChapter ? chapters.findIndex(c => c.c === oldChapter.c) : -1, cIndexRef.current, chapters.length) : null;
      const verses = cIdx !== null ? chapters[cIdx].verses : [];
      let vFound = oldVerse ? verses.findIndex(v => v.v === oldVerse.v) : -1;
      // A verse this Bible folds into the one before it (GNT has Genesis 1:7 in 1:6): open that one
      if (vFound < 0 && oldVerse) for (let i = 0; i < verses.length && verses[i].v < oldVerse.v; i++) vFound = i;
      const vIdx = verses.length ? findOr(vFound, vIndexRef.current, verses.length) : null;
      setActiveBibleBookIndex(bIdx);
      setActiveBibleChapterIndex(cIdx);
      setActiveBibleVerseIndex(vIdx);

      if (hadPlace && cIdx !== null && vIdx !== null) {
        const b = books[bIdx], c = chapters[cIdx], v = verses[vIdx];
        setPreviewSlide({ id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' });
      }
    });
    return () => { cancelled = true; };
  }, [activeBibleId, bibleReload]);

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
    if (config?.outputType === 'ndi') {
      setUndoToast({ text: isTauri() ? `${config.name} is sent over NDI automatically while it's enabled. Its status is in Settings → Outputs.` : 'NDI outputs are sent by the FlowShow desktop app.', at: Date.now(), kind: 'info', noUndo: true });
      return;
    }
    if (!config?.displayId) {
        void showMessage(`Choose a screen for ${config?.name || outputId} first: Settings → Outputs → Target display.`);
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

    if (isTauri()) {
      try {
        const name = config.name || outputId;
        const result = await openOutputOnMonitor(label, url, name, config.displayId, () => askConfirm(
          `${name} will fill the screen FlowShow is on, so you won't see FlowShow until you close it.\n\nPress Esc (or click the output) to close it again.\n\nOpen it anyway?`,
          { okLabel: 'Open it' }
        ));
        // A black screen with no explanation: say why when nothing is being presented
        if (result === 'opened' && !liveState.isPresenting) {
          setUndoToast({ text: `${name} is open. It stays black until you start presenting (the Presenting button, top right).`, at: Date.now(), kind: 'info', noUndo: true });
        }
        return;
      } catch (err) {
        void showMessage(`Couldn't open ${config.name || outputId} on "${config.displayId}": ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    
    window.open(url, `FlowShow_${outputId}`, wFeatures);
  };

  const goLive = (slide: SlideDefinition) => {
      // A slide with background media (its own or carried on from an earlier slide) changes the background
      applySlideBackground(slide.id);
      // Text boxes added in Design mode wait off the screens until their slide goes live
      const released = releaseWaitingBoxes(slide);
      if (released !== slide) updateSlidesById(new Set([slide.id]), releaseWaitingBoxes);
      // The show's mix: the layers for this slide (layers that carry on keep playing; a new show's mix replaces the old one)
      setLiveState(prev => ({ ...prev, ...releaseHeld(prev), slide: released, clearText: false, clearedOutputs: {}, mix: liveMixFor(prev.mix, slide) }));
      findMixMedia(slide);
      setPreviewSlide(released);
  };
  
  /** A playback video: on every screen as the background, playing once with sound from this computer (the playback bar) */
  const startPlayback = (url: string, name: string) => setLiveState(prev => ({ ...prev, ...releaseHeld(prev), globalBackground: { url, type: 'video', fileName: name, playback: true }, clearedOutputs: {} }));
  /** It ended or was stopped: fade back to each screen's default background (the mix and overlays stay) */
  const endPlayback = (url: string) => setLiveState(prev => prev.globalBackground?.playback && prev.globalBackground.url === url ? { ...prev, globalBackground: null } : prev);
  /** A video from the Media tab or a setlist: playback videos play once with sound, the others are silent looping backgrounds */
  const showVideoOrPicture = (url: string, type: 'image' | 'video', media: { name?: string; path?: string; ref?: { folder: string; path: string[] } }) => {
    if (type === 'video' && isPlayback({ ...media, url })) startPlayback(url, media.name || 'Video');
    else setGlobalBackground(url, type);
  };
  /** A camera, screen or NDI source as the background on the screens (Media tab → Inputs) */
  const setLiveInputBackground = (input: LiveInput) => setLiveState(prev => ({ ...prev, ...releaseHeld(prev), globalBackground: { url: '', type: 'input', input, fileName: input.label }, clearedOutputs: {} }));
  const setGlobalBackground = (url: string | null, type: 'image' | 'video' = 'image') => setLiveState(prev => ({ ...prev, ...releaseHeld(prev), globalBackground: url ? { url, type } : null, clearedOutputs: {}, ...(url ? {} : { mix: clearedMix(prev.mix) }) }));

  // ─── Media Mixer: the live show's mix on the screens ───
  /** The show (song, declaration or presentation) a slide belongs to */
  const showOfSlide = (slideId: string) => songsList.find(song => song.slides.some(s => s.id === slideId)) || null;
  /**
   * What the mixer plays when this slide goes live: the layers of its show's mix for this slide.
   * Moving to another show fades the old mix out (or keeps it playing, if it is set to), and a show with its own mix takes over.
   * fresh: also bring back layers taken off with F1 / Clear all.
   */
  const liveMixFor = (prev: LiveMix | null | undefined, slide: SlideDefinition, opts: { fresh?: boolean; song?: PresentationItem | null; mixOverride?: ShowMix } = {}): LiveMix | null => {
    const song = opts.song !== undefined ? opts.song : showOfSlide(slide.id);
    const mix = opts.mixOverride ?? song?.mix;
    const showId = song?.id ?? null;
    const showChanged = (prev?.showId ?? null) !== showId;
    if (!song || !mix?.layers.length) {
      // Nothing playing: just note which show is on now (so layers taken off with F1 count again in a new show)
      if (!prev || !prev.layers.length) return prev ? { ...prev, showId: showChanged ? showId : prev.showId, suppressed: showChanged ? [] : prev.suppressed, exitFade: undefined } : null;
      if (!showChanged) return { ...prev, layers: [], exitFade: undefined, suppressed: [] };
      // Moving on from a show whose mix keeps playing: it carries on until a show with its own mix (or F1)
      if (prev.keepPlaying) return prev;
      return { ...prev, showId, layers: [], exitFade: prev.fadeOut ?? DEFAULT_SHOW_END_FADE, suppressed: [] };
    }
    const index = song.slides.findIndex(s => s.id === slide.id);
    const active = mixLayersAt(mix, song.slides, index);
    const suppressed = (!showChanged && !opts.fresh ? (prev?.suppressed || []) : []).filter(id => active.some(l => l.id === id));
    const layers: LiveMixLayer[] = active.filter(l => !suppressed.includes(l.id)).map(l => {
      // A layer that carries on keeps its address (so it keeps playing)
      const before = prev?.layers.find(x => x.id === l.id);
      const sameSource = before && JSON.stringify(before.source) === JSON.stringify(l.source);
      const url = l.source.kind === 'media' ? (sameSource && before?.url ? before.url : mixUrlNow(l.source.media) ?? undefined) : undefined;
      return { ...l, url };
    });
    return { showId, layers, keepPlaying: mix.keepPlaying, fadeOut: mix.fadeOut, exitFade: showChanged ? (prev?.fadeOut ?? DEFAULT_SHOW_END_FADE) : undefined, suppressed };
  };
  /** Media that isn't ready yet (from an added folder, or kept in FlowShow): find it, then put it on */
  const findMixMedia = (slide: SlideDefinition, song: PresentationItem | null = showOfSlide(slide.id), mixOverride?: ShowMix) => {
    const mix = mixOverride ?? song?.mix;
    if (!song || !mix) return;
    const index = song.slides.findIndex(s => s.id === slide.id);
    mixLayersAt(mix, song.slides, index).forEach(l => {
      if (l.source.kind !== 'media' || (mixUrlNow(l.source.media) && !l.source.media.storedId)) return;
      void findMixUrl(l.source.media).then(url => {
        if (!url) {
          setUndoToast({ text: `Mix: can't find "${l.source.kind === 'media' ? l.source.media.name : l.name}". Its folder isn't added, or the file was moved.`, at: Date.now(), kind: 'error' });
          return;
        }
        setLiveState(prev => prev.mix?.layers.some(x => x.id === l.id && x.url !== url)
          ? { ...prev, mix: { ...prev.mix, layers: prev.mix.layers.map(x => x.id === l.id ? { ...x, url } : x) } }
          : prev);
      });
    });
  };
  /** F1 / Clear all: the mix fades out; its layers stay off until their slides are over */
  const clearedMix = (m: LiveMix | null | undefined): LiveMix | null | undefined =>
    m && m.layers.length
      ? { ...m, layers: [], exitFade: m.fadeOut ?? DEFAULT_SHOW_END_FADE, suppressed: Array.from(new Set([...(m.suppressed || []), ...m.layers.map(l => l.id)])) }
      : m;
  /** Put a show's mix (as it is now) on the screens, when one of its slides is live */
  const sendMixToScreens = (song: PresentationItem, mixOverride?: ShowMix) => {
    const live = liveState.slide;
    if (!live || !song.slides.some(s => s.id === live.id)) return;
    setLiveState(prev => ({ ...prev, ...releaseHeld(prev), mix: liveMixFor(prev.mix, live, { fresh: true, song, mixOverride }) }));
    findMixMedia(live, song, mixOverride);
  };
  const changeShowMix = (showId: string, fn: (mix: ShowMix) => ShowMix) => {
    const song = songsList.find(s => s.id === showId);
    if (!song) return;
    const next = fn(song.mix || EMPTY_MIX);
    const kept = next.layers.length || next.keepPlaying || next.fadeOut !== undefined ? next : undefined;
    setSongsList(prev => prev.map(s => s.id === showId ? { ...s, mix: kept } : s));
    // What happens when the show ends applies at once to its mix on the screens (it changes nothing you can see)
    setLiveState(prev => prev.mix?.showId === showId && (prev.mix.keepPlaying !== kept?.keepPlaying || prev.mix.fadeOut !== kept?.fadeOut)
      ? { ...prev, mix: { ...prev.mix, keepPlaying: kept?.keepPlaying, fadeOut: kept?.fadeOut } }
      : prev);
    if (mixAutoSend) sendMixToScreens({ ...song, mix: kept }, kept ?? EMPTY_MIX);
  };
  const copyMixTo = (from: PresentationItem, toId: string) => {
    if (!from.mix?.layers.length) return;
    const portable = mixToSave(from.mix, from.slides);
    const target = songsList.find(s => s.id === toId);
    setSongsList(prev => prev.map(s => s.id === toId ? { ...s, mix: mixForSlides(portable, s.slides) } : s));
    setUndoToast({ text: `Mix copied to "${target?.title || 'the show'}"`, at: Date.now(), kind: 'info', noUndo: true });
  };
  const saveReusableMix = (from: PresentationItem, name: string) => {
    if (!from.mix?.layers.length) return;
    const saved: SavedMix = { id: `savedmix-${Date.now().toString(36)}`, name, mix: mixToSave(from.mix, from.slides), savedAt: Date.now() };
    setGlobalSettings(prev => ({ ...prev, savedMixes: [...(prev.savedMixes || []), saved] }));
    setUndoToast({ text: `Saved "${name}": use it in any show from Mix → Use a saved mix`, at: Date.now(), kind: 'info', noUndo: true });
  };
  const useSavedMix = (song: PresentationItem, id: string) => {
    const saved = (globalSettings.savedMixes || []).find(m => m.id === id);
    if (saved) changeShowMix(song.id, () => mixForSlides(saved.mix, song.slides));
  };
  /** The show that is open, for the Groups panel and the slide count: like getMixShow, and for a setlist song
   *  that isn't linked to the song library, the setlist item's own slides */
  const getOpenShow = (): PresentationItem | null => {
    const show = getMixShow();
    if (show || activeTab !== 'setlist') return show;
    const item = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
    return item?.type === 'song' && item.slides?.length ? { id: item.id, title: item.title, category: 'Songs', slides: item.slides } : null;
  };
  /** The show Mix mode works on: the one open in the Shows tab, or the open setlist item's song */
  const getMixShow = (): PresentationItem | null => {
    if (activeTab === 'setlist') {
      const item = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
      if (item?.songId) return songsList.find(s => s.id === item.songId) || null;
      const first = item?.slides?.[0];
      return first ? showOfSlide(first.id) : null;
    }
    return songsList[activeItemIndex] || null;
  };

  // ─── Slide backgrounds (drop media from the Media tab onto a slide) ───
  /** The slides a slide belongs to (the open setlist item's, or its song's) */
  const slideListOf = (slideId: string): SlideDefinition[] | null => {
    const shown = getShownSlides().slides;
    if (shown.some(s => s.id === slideId)) return shown;
    return songsList.find(song => song.slides.some(s => s.id === slideId))?.slides || null;
  };
  /** Change slides in the song library and in every setlist that has a copy of them (by slide id) */
  const updateSlidesEverywhere = (ids: Set<string>, fn: (s: SlideDefinition) => SlideDefinition) => {
    updateSlidesById(ids, fn);
    setProjectsState(prev => {
      let changed = false;
      const projects = prev.projects.map(p => {
        if (!p.items.some(it => it.slides?.some(s => ids.has(s.id)))) return p;
        changed = true;
        return { ...p, items: p.items.map(it => it.slides?.some(s => ids.has(s.id)) ? { ...it, slides: it.slides.map(s => ids.has(s.id) ? fn(s) : s) } : it) };
      });
      return changed ? { ...prev, projects } : prev;
    });
  };
  /** Take all media off slides: their background media and the pictures/videos added in Design mode (every screen) */
  const removeSlideMedia = (ids: string[]) => {
    if (!ids.length) return;
    updateSlidesEverywhere(new Set(ids), s => {
      const { background: _bg, ...rest } = s;
      let out: SlideDefinition = rest;
      for (const [outputId, d] of Object.entries(s.designs || {})) {
        if (d.media?.length) { const { media: _m, ...d2 } = d; out = withDesign(out, outputId, d2); }
      }
      return out;
    });
    setUndoToast({ text: `Media removed from ${ids.length === 1 ? 'the slide' : `${ids.length} slides`}`, at: Date.now(), kind: 'info', noUndo: true });
  };
  const setSlideBackground = (slideId: string, background: SlideBackground | undefined) =>
    updateSlidesEverywhere(new Set([slideId]), s => {
      const { background: _old, ...rest } = s;
      return background ? { ...rest, background } : rest;
    });
  /** Put the slide's background on the screens (nothing changes when the song has none up to this slide) */
  const applySlideBackground = (slideId: string) => {
    const slides = slideListOf(slideId);
    if (!slides) return;
    const at = slides.findIndex(s => s.id === slideId);
    const entry = at >= 0 ? slideBackgrounds(slides)[at] : null;
    if (!entry) return;
    // (Only this slide's own media: the background then stays until something replaces it)
    const { bg } = entry;
    const show = (url: string) => setLiveState(prev => prev.globalBackground?.url === url ? prev : { ...prev, globalBackground: { url, type: bg.type, fileName: bg.name } });
    if (bg.ref) {
      // From an added folder: find the file there again (a link from an earlier session no longer works)
      const ref = bg.ref;
      void resolveMediaRef(ref).then(url => {
        if (!url) { setUndoToast({ text: `Couldn't show the background "${bg.name || 'media'}": the folder "${ref.folder}" isn't added, or the file was moved`, at: Date.now(), kind: 'error' }); return; }
        show(url);
        // Remember the working link so the slide cards can show it
        const owner = slides[at];
        if (owner?.background && owner.background.url !== url) setSlideBackground(owner.id, { ...owner.background, url });
      });
      return;
    }
    show(bg.url);
  };
  /** Media dropped on a slide card: it becomes the background from that slide on */
  const dropMediaOnSlide = (e: React.DragEvent, slide: SlideDefinition | undefined) => {
    const raw = e.dataTransfer.getData(DRAG_MEDIA);
    if (!raw || !slide) return false;
    try {
      const m = JSON.parse(raw) as { name?: string; url: string; type: 'image' | 'video'; ref?: SlideBackground['ref'] };
      if (!m.url) return false;
      setSlideBackground(slide.id, { url: m.url, type: m.type === 'video' ? 'video' : 'image', name: m.name, ref: m.ref });
      setUndoToast({ text: `"${m.name || 'Media'}" added to this slide: it goes on when you select the slide`, at: Date.now(), kind: 'info', noUndo: true });
      // Already on the screens: the background changes now
      if (liveState.slide?.id === slide.id) setTimeout(() => applySlideBackground(slide.id), 0);
    } catch { return false; }
    return true;
  };
  const isMediaDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types || []).includes(DRAG_MEDIA);

  // ─── Marking several slides on the main grid ───
  /** Ctrl+click marks/unmarks a slide, Shift+click marks a run of slides; a plain click unmarks all and goes live */
  const clickGridSlide = (e: React.MouseEvent, slides: SlideDefinition[], i: number) => {
    const slide = slides[i];
    if (e.ctrlKey || e.metaKey) {
      setGridChosen(prev => { const next = new Set(prev); if (next.has(slide.id)) next.delete(slide.id); else next.add(slide.id); return next; });
      gridAnchor.current = i;
      return;
    }
    if (e.shiftKey) {
      const from = gridAnchor.current ?? slides.findIndex(s => s.id === (previewSlide?.id || liveState.slide?.id));
      const a = from >= 0 ? from : i;
      setGridChosen(new Set(slides.slice(Math.min(a, i), Math.max(a, i) + 1).map(s => s.id)));
      return;
    }
    gridAnchor.current = i;
    setGridChosen(prev => prev.size ? new Set() : prev);
    if (!slide.disabled) { setPreviewSlide(slide); goLive(slide); }
  };
  /** Delete key on the slide grid: the marked slides, or else the slide in Preview (Ctrl+Z brings them back) */
  const deletePickedSlides = () => {
    const shown = getShownSlides().slides;
    const ids = gridChosen.size ? shown.filter(s => gridChosen.has(s.id)).map(s => s.id)
      : previewSlide && shown.some(s => s.id === previewSlide.id) ? [previewSlide.id] : [];
    if (!ids.length) return false;
    const gone = new Set(ids);
    // A show keeps at least one (empty) slide
    const strip = (slides: SlideDefinition[]) => { const kept = slides.filter(s => !gone.has(s.id)); return kept.length ? kept : [{ ...slides[0], text: '' }]; };
    setSongsList(prev => prev.map(song => song.slides.some(s => gone.has(s.id)) ? { ...song, slides: strip(song.slides) } : song));
    setProjectsState(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.items.some(it => it.slides?.some(s => gone.has(s.id)))
        ? { ...p, items: p.items.map(it => it.slides?.some(s => gone.has(s.id)) ? { ...it, slides: strip(it.slides) } : it) }
        : p),
    }));
    setGridChosen(new Set());
    if (previewSlide && gone.has(previewSlide.id)) setPreviewSlide(null);
    setUndoToast({ text: `Deleted ${ids.length} slide${ids.length === 1 ? '' : 's'}`, at: Date.now() });
    return true;
  };
  /** Delete key on the setlist: take the open item out of the setlist (the song stays in the library) */
  const removeOpenSetlistItem = () => {
    const item = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
    if (!item) return false;
    setProjectsState(prev => ({ ...prev, projects: prev.projects.map(p => p.id === serviceSetlist.id ? { ...p, items: p.items.filter(i => i.id !== item.id) } : p) }));
    setActiveSetlistItemId(null);
    setUndoToast({ text: `Removed "${item.title}" from the setlist (it stays in your shows)`, at: Date.now(), kind: 'info', noUndo: true });
    return true;
  };
  /** Delete key on the Shows list: delete the selected show (asks first; Ctrl+Z brings it back) */
  const deleteOpenShow = () => {
    const song = songsList[activeItemIndex];
    if (!song) return false;
    void askConfirm(`Delete the show "${song.title}"? Ctrl+Z brings it back.`, { okLabel: 'Delete', danger: true }).then(ok => {
      if (ok) { deleteSong(song.id); setUndoToast({ text: `Deleted "${song.title}"`, at: Date.now() }); }
    });
    return true;
  };
  /** The slides a right-click acts on: all marked slides when the one clicked is marked, otherwise just that one */
  const gridMenuTargets = (index: number): SlideDefinition[] => {
    const slides = getShownSlides().slides;
    const s = slides[index];
    if (!s) return [];
    return gridChosen.has(s.id) && gridChosen.size > 1 ? slides.filter(x => gridChosen.has(x.id)) : [s];
  };
  const rightClickGridSlide = (e: React.MouseEvent, i: number) => {
    const s = getShownSlides().slides[i];
    // Right-clicking a slide that isn't marked works on that slide alone
    if (s && !gridChosen.has(s.id) && gridChosen.size) setGridChosen(new Set());
    handleContextMenu(e, 'slide', i);
  };

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

                        let vIdx = chapter.verses.findIndex(v => v.v === vNum);
                        // A verse some Bibles fold into the one before it (GNT has Genesis 1:7 in 1:6)
                        if (vIdx === -1) for (let i = 0; i < chapter.verses.length && chapter.verses[i].v < vNum; i++) vIdx = i;
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
           if (verse) foundText = verse.lines.join('\n');
           else foundText = `[Verse ${verseSearch} not found]`;
         } else foundText = `[Chapter ${chapterSearch} not found]`;
       } else foundText = `[Book ${bookSearch} not found]`;
     }
     const slide = { id: `auto-${Date.now()}`, type: 'scripture' as SlideType, text: foundText, source: sourceString };
     pushToBibleHistory(slide);
     goLive(slide);
  };

  // Import a Bible from an XML file and open it. Importing a file with the same name again replaces that Bible.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (file) await importBibleFile(file);
  };
  const importBibleFile = async (file: File) => {
    setIsUploading(true);
    try {
      const bible = await parseBibleXml(file);
      const replacing = bibleList.some(b => b.id === bible.id);
      await saveBible(bible);
      setBibleList(await getBibleList());
      if (bible.id === activeBibleId) setBibleReload(n => n + 1); else setActiveBibleId(bible.id);
      setShowBibleHistory(false);
      setBibleSearchQuery('');
      setBibleKeywordQuery('');
      setUndoToast({ text: `${replacing ? 'Updated' : 'Imported'} “${bible.name}”: ${bible.books.length} books, ${countVerses(bible).toLocaleString()} verses`, at: Date.now(), kind: 'info', noUndo: true });
    } catch (err) {
      console.warn('Bible import failed', err);
      const text = err instanceof BibleFileError ? err.message : `Couldn't import “${file.name}”: ${err instanceof Error ? err.message : String(err)}`;
      setUndoToast({ text, at: Date.now(), kind: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'song'|'bible'|'slide', id: string|number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  /** A show becomes a Song or a Declaration. Its slides then use that kind's template on every screen
   *  (Declarations: the Declarations template). Setlist copies follow. */
  const setShowCategory = (id: string, category: 'Songs' | 'Declarations') => {
    const show = songsList.find(s => s.id === id);
    if (!show || (show.category === 'Declarations' ? 'Declarations' : 'Songs') === category) return;
    const declaration = category === 'Declarations';
    setSongsList(prev => prev.map(s => s.id === id ? { ...s, category } : s));
    updateSlidesEverywhere(new Set(show.slides.map(s => s.id)), s => {
      const { declaration: _was, ...rest } = s;
      return declaration ? { ...rest, declaration: true } : rest;
    });
    setUndoToast({ text: `"${show.title}" is now a ${category === 'Songs' ? 'Song' : 'Declaration'}`, at: Date.now() });
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
     setLiveState(prev => ({ ...prev, ...releaseHeld(prev), clearText: !prev.clearText }));
     setPreviewSlide(null);
  };
  const clearAll = () => {
     setLiveState(prev => ({ ...prev, ...releaseHeld(prev), slide: undefined, globalBackground: null, clearText: false, clearedOutputs: {}, mix: clearedMix(prev.mix) }));
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
                 <div key={song.id} data-show-row draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_SONG, song.id); e.dataTransfer.effectAllowed = 'copy'; }} onContextMenu={(e) => handleContextMenu(e, 'song', song.id)} onClick={() => setActiveItemIndex(originalIndex)} className={`group px-4 py-3 cursor-pointer border-b border-white/5 flex items-center justify-between transition-colors ${activeItemIndex === originalIndex ? 'bg-blue-600/10 border-l-2 border-l-blue-500 text-white' : 'hover:bg-white/5 border-l-2 border-l-transparent text-neutral-400'}`}>
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
    if (activeTab === 'media') return <MediaLibrary onSelectBackground={setGlobalBackground} onPlayVideo={startPlayback} onSelectInput={setLiveInputBackground} activeInput={liveState.globalBackground?.type === 'input' ? liveState.globalBackground.input : null} />;
    if (activeTab === 'audio') return <AudioModule onVerseDetected={handleVerseDetected} />;

    if (activeTab === 'bibles') {
      const isSearchingKeyword = bibleKeywordQuery.trim().length > 0;
      // A compact card per verse so many fit at once: red when live, blue in preview, dashed for the one that's next
      const verseCard = (isLive: boolean, isPreview: boolean, isNext = false) =>
        `px-3 py-1.5 rounded-lg cursor-pointer border transition-all flex items-baseline gap-3 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : isNext ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300'}`;
      const verseLabel = (lit: boolean) => `text-[11px] font-bold shrink-0 text-right tabular-nums ${lit ? 'text-white/80' : 'text-neutral-500'}`;

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
                   placeholder="Ref (Joh 3 16)...  Ctrl+F"
                   data-bible-ref-search
                   className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-white placeholder:text-neutral-500"
                 />
              </div>
              <div className="relative flex-1 min-w-[200px]">
                 <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   value={bibleKeywordQuery} 
                   onChange={handleKeywordSearchChange}
                   placeholder="Keyword (God so loved)...  Ctrl+B"
                   data-bible-keyword-search
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
                 <Clock size={16} /> History <span className="text-[10px] font-mono opacity-60">Ctrl+H</span>
              </button>
              {/* Which Bible (right-click it to rename or delete), and importing another */}
              <div className="ml-auto flex items-center gap-2">
                 {bibleList.length > 0 && (
                    <select
                      value={activeBibleId || ''}
                      onChange={(e) => setActiveBibleId(e.target.value)}
                      onContextMenu={(e) => { if (activeBibleId) handleContextMenu(e, 'bible', activeBibleId); }}
                      className="bg-white/5 border border-white/10 rounded-lg text-sm px-3 py-2 text-white outline-none focus:border-white/20 cursor-pointer max-w-[220px]"
                      title="Which Bible to show · right-click to rename or delete it"
                    >
                      {bibleList.map(b => <option key={b.id} value={b.id} className="bg-[#121214]">{b.name}</option>)}
                    </select>
                 )}
                 <label
                   className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all whitespace-nowrap ${isUploading ? 'bg-white/5 text-neutral-500 cursor-wait' : 'bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 cursor-pointer'}`}
                   title="Add a Bible from an XML file (Zefania, OpenSong, Beblia, OSIS or USFX)"
                 >
                    {isUploading ? <Activity size={16} className="animate-spin" /> : <Upload size={16} />}
                    {isUploading ? 'Importing…' : 'Import Bible'}
                    <input type="file" accept=".xml,.xmm" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                 </label>
              </div>
           </div>

           {bibleList.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 bg-[#09090B]">
                 <BookOpen size={36} className="text-neutral-600" />
                 <h3 className="text-base font-bold text-white">No Bible yet</h3>
                 <p className="text-sm text-neutral-400 max-w-md leading-relaxed">Import a Bible XML file (Zefania, OpenSong, Beblia, OSIS or USFX) to search and show scripture.</p>
                 <label className={`mt-1 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold text-white transition-colors ${isUploading ? 'bg-pink-600/50 cursor-wait' : 'bg-pink-600 hover:bg-pink-500 cursor-pointer'}`}>
                    {isUploading ? <Activity size={15} className="animate-spin" /> : <Upload size={15} />}
                    {isUploading ? 'Importing…' : 'Import Bible'}
                    <input type="file" accept=".xml,.xmm" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                 </label>
              </div>
           ) : showBibleHistory ? (
              <div className="px-4 py-3 overflow-y-auto custom-scrollbar flex-1 bg-[#09090B]">
                 <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Clock size={14}/> Session History</h2>
                 {bibleHistory.length === 0 ? (
                    <div className="text-neutral-500 text-sm">No verses viewed in this session yet.</div>
                 ) : (
                    <div className="flex flex-col gap-1 max-w-5xl mx-auto">
                       {bibleHistory.map((slide, idx) => {
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         return (
                           <div
                              key={`${slide.id}-${idx}`}
                              onClick={() => handleJumpToVerse(slide, false)}
                              onDoubleClick={() => handleJumpToVerse(slide, true)} draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_SCRIPTURE, JSON.stringify(slide)); e.dataTransfer.effectAllowed = 'copy'; }}
                              className={verseCard(isLive, isPreview)}
                           >
                              <span className={`${verseLabel(isLive || isPreview)} w-24`}>{slide.source}</span>
                              <p className="text-sm whitespace-pre-wrap leading-snug">{slide.text}</p>
                           </div>
                         );
                       })}
                    </div>
                 )}
              </div>
           ) : isSearchingKeyword ? (
              <div className="px-4 py-3 overflow-y-auto custom-scrollbar flex-1 bg-[#09090B]">
                 {bibleKeywordResults.length === 0 ? (
                    <div className="text-center text-neutral-500 text-sm mt-10">No keyword matches found.</div>
                 ) : (
                    <div className="flex flex-col gap-1 max-w-5xl mx-auto">
                       {bibleKeywordResults.map((slide) => {
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         return (
                           <div
                              key={slide.id}
                              onClick={() => handleJumpToVerse(slide, false)}
                              onDoubleClick={() => handleJumpToVerse(slide, true)} draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_SCRIPTURE, JSON.stringify(slide)); e.dataTransfer.effectAllowed = 'copy'; }}
                              className={verseCard(isLive, isPreview)}
                           >
                              <span className={`${verseLabel(isLive || isPreview)} w-24`}>{slide.source}</span>
                              <p className="text-sm whitespace-pre-wrap leading-snug">{slide.text}</p>
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
                       <button key={`${idx}-${book.name}`} onClick={() => { setActiveBibleBookIndex(idx); setActiveBibleChapterIndex(0); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-left px-5 py-3 text-sm border-b border-white/5 transition-colors truncate ${activeBibleBookIndex === idx ? 'bg-blue-600/10 text-blue-400 font-semibold border-l-2 border-l-blue-500' : 'text-neutral-400 hover:bg-white/5 hover:text-white border-l-2 border-l-transparent'}`}>{book.name}</button>
                    ))}
                 </div>
                 <div className="w-20 border-r border-white/5 overflow-y-auto custom-scrollbar bg-[#121214] shrink-0" ref={chapterListRef}>
                    {activeBibleBookIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters.map((chapter, idx) => (
                       <button key={`${idx}-${chapter.c}`} onClick={() => { setActiveBibleChapterIndex(idx); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-center px-2 py-3 text-sm border-b border-white/5 transition-colors ${activeBibleChapterIndex === idx ? 'bg-blue-600/10 text-blue-400 font-semibold shadow-inner' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>{chapter.c}</button>
                    ))}
                 </div>
                 <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 bg-[#09090B]">
                    <div className="flex flex-col gap-1 max-w-5xl mx-auto" ref={verseListRef}>
                      {activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters[activeBibleChapterIndex]?.verses.map((verse, vIdx) => {
                         const slide: SlideDefinition = { id: `b-${activeBibleData.books[activeBibleBookIndex].name}-${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}-${verse.v}`, text: verse.lines.join('\n'), source: `${activeBibleData.books[activeBibleBookIndex].name} ${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}:${verse.v}`, type: 'scripture' };
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         const isNextLogical = activeBibleVerseIndex !== null && vIdx === activeBibleVerseIndex + 1;
                         
                         return (
                            <div
                               key={`${vIdx}-${verse.v}`}
                               onClick={() => handleVerseClick(slide, vIdx)}
                               onDoubleClick={() => handleVerseDoubleClick(slide, vIdx)} draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_SCRIPTURE, JSON.stringify(slide)); e.dataTransfer.effectAllowed = 'copy'; }}
                               className={verseCard(isLive, isPreview, isNextLogical)}
                            >
                               <span className={`${verseLabel(isLive || isPreview)} w-6`}>{verse.v}</span>
                               <p className="text-sm whitespace-pre-wrap leading-snug">{verse.lines.join('\n')}</p>
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
            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 content-start" data-delete-area="slides">
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
              <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 content-start" data-delete-area="slides">
                 {(() => { const slideBgs = slideBackgrounds(activeSong.slides); return activeSong.slides.map((slide, i) => {
                    const isLive = liveState.slide?.id === slide.id;
                    const isPreview = previewSlide?.id === slide.id;
                    
                    const currentSlideId = previewSlide?.id || liveState.slide?.id;
                    const currentIndex = activeSong.slides.findIndex(s => s.id === currentSlideId);
                    const isNextLogical = currentIndex !== -1 && i === currentIndex + 1;

                    return (
                       <div 
                         key={slide.id} draggable
                         onDragStart={(e) => { setDraggedSlideIndex(i); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => { e.preventDefault(); if (isMediaDrag(e)) e.dataTransfer.dropEffect = 'copy'; setDragOverSlideIndex(i); }} onDragLeave={() => setDragOverSlideIndex(prev => prev === i ? null : prev)} onDrop={(e) => { e.preventDefault(); if (dropMediaOnSlide(e, slide)) { setDraggedSlideIndex(null); setDragOverSlideIndex(null); return; } handleDropSlide(i); }}
                         onContextMenu={(e) => rightClickGridSlide(e, i)} onClick={(e) => clickGridSlide(e, activeSong.slides, i)} data-grid-slide={slide.id}
                         className={`group aspect-[16/9] rounded-xl cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden
                           ${slide.disabled ? 'opacity-30 cursor-not-allowed' : ''} ${isLive ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : isPreview ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : isNextLogical ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 shadow-lg'} ${dragOverSlideIndex === i ? 'border-dashed border-blue-400 opacity-70' : ''}
                         `}
                       >
                         <FixedStage className="w-full h-full pointer-events-none">
                            <SmartTextLayout text={slide.text} source={slide.source} type={slide.type} styleOverrides={applyGlobalStyles(slide, liveState.settings?.outputs.find(o => o.id === 'main'), liveState.settings)} />
                         </FixedStage>
                         
                         {/* Background media: this slide's own (from here on), or carried on from an earlier slide */}
                         {slideBgs[i] && (
                           <>
                             {slideBgs[i]!.bg.type === 'image' && (
                               <img src={slideBgs[i]!.bg.url} alt="" draggable={false} className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${slideBgs[i]!.own ? 'opacity-50' : 'opacity-25'}`} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                             )}
                             <div
                               className={`absolute bottom-1.5 left-1.5 z-10 max-w-[85%] flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border backdrop-blur-sm ${slideBgs[i]!.own ? 'bg-emerald-600/80 border-emerald-400/40 text-white' : 'bg-black/60 border-white/10 text-neutral-400'}`}
                               title={`Background media: ${slideBgs[i]!.bg.name || 'media'}. Selecting this slide puts it on, and it stays on until another background replaces it. Right-click → Remove media.`}
                               data-slide-bg={slideBgs[i]!.own ? 'own' : 'carried'}
                             >
                               {slideBgs[i]!.bg.type === 'video' ? <Video size={9} className="shrink-0" /> : <ImageIcon size={9} className="shrink-0" />}
                               {slideBgs[i]!.own && <span className="truncate">{slideBgs[i]!.bg.name || 'Background'}</span>}
                             </div>
                           </>
                         )}
                         {gridChosen.has(slide.id) && (
                           <div className="absolute inset-0 z-20 pointer-events-none rounded-[10px] ring-2 ring-inset ring-sky-400 bg-sky-400/10" data-grid-chosen>
                             <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center"><Check size={10} /></span>
                           </div>
                         )}
                         {/* Slide Number Badge */}
                         <div className="absolute top-3 left-3 text-[10px] font-bold text-neutral-500 bg-[#09090B]/80 px-2 py-1 rounded shadow-sm border border-white/10 backdrop-blur-md z-10">{i + 1}</div>
                       </div>
                    );
                 }); })()}
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
                          className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${liveState.lockedOutputs?.['main'] === true ? 'text-red-500' : 'text-neutral-500 hover:text-white'}`}
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
                    const isOutPaused = liveState.lockedOutputs?.[out.id] === true;
                    const isOutCleared = !!liveState.clearedOutputs?.[out.id];

                    return (
                        <div key={out.id} className="flex flex-col shrink-0 min-h-0 flex-1">
                           <div className="flex justify-between items-center mb-1.5 px-1">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-[#a1a1aa]">{out.name}</span>
                              <div className="flex items-center gap-1">
                                 <button onClick={() => toggleLockOutput(out.id)} className={`text-[10px] uppercase font-bold tracking-widest px-1 ${isOutPaused ? 'text-red-500' : 'text-neutral-600 hover:text-white transition-colors'}`}>{isOutPaused ? 'Paused' : 'Pause'}</button>
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
                                          {isOutPaused && (
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
    const isOutHeld = liveState.lockedOutputs?.[out.id] === 'held';
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
            {out.outputType === 'ndi' && <NdiBadge output={out as any} />}
          </div>
        </div>
        <div 
          onClick={() => openProjector(out.id)}
          className={`aspect-video w-full rounded-lg border-2 overflow-hidden relative bg-black cursor-pointer shadow-md transition-all ${
            isLive ? 'border-pink-500 shadow-[0_0_12px_color-mix(in_srgb,var(--color-pink-500)_35%,transparent)]' : 'border-white/10 hover:border-pink-500/50'
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
                overlays={isOutLocked ? (frozenState?.overlays || []) : overlaysFor(globalSettings.overlays, liveState.overlays, out.id)}
                mix={isOutLocked ? frozenState?.mix : liveState.mix}
                muted
              />
            )}

            {isOutCleared && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60"><EyeOff size={16} className="text-neutral-500" /></div>
            )}
            {isOutHeld && (
              <div className="absolute inset-0 z-30 pointer-events-none" data-output-held={out.id}>
                <span className="absolute top-1 left-1 bg-white/90 text-black text-[8px] font-bold tracking-widest px-1 py-0.5 rounded" title="Unpaused: it keeps this picture until you send the next slide, background or clear">
                  WAITS FOR NEXT SLIDE
                </span>
              </div>
            )}
            {isOutLocked && !isOutHeld && (() => {
              const normal = globalSettings.outputs.filter((o: OutputSettings) => !isStageOutput(o));
              const key = isStage ? 'Ctrl+`' : normal.findIndex((o: OutputSettings) => o.id === out.id) >= 0 && normal.findIndex((o: OutputSettings) => o.id === out.id) < 9 ? `Ctrl+${normal.findIndex((o: OutputSettings) => o.id === out.id) + 1}` : '';
              return (
                <div className="absolute inset-0 ring-2 ring-inset ring-amber-500 z-30 pointer-events-none" data-output-paused={out.id}>
                  <span className="absolute top-1 left-1 bg-amber-500 text-black text-[8px] font-bold tracking-widest px-1 py-0.5 rounded flex items-center gap-1">
                    <Lock size={8} /> PAUSED{key ? ` · ${key}` : ''}
                  </span>
                </div>
              );
            })()}
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
          <div className="relative" data-create-menu>
            <button
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setCreateMenuAt({ x: r.left, y: r.bottom + 6 }); setCreateMenuOpen(v => !v); }}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${createMenuOpen ? 'bg-pink-500 text-white' : 'bg-pink-600 hover:bg-pink-500 text-white'}`}
              title="New show, project, folder, project template, or import"
            >
              <Plus size={14} />
            </button>
            {createMenuOpen && (
              // Fixed to the window, so the sidebar's edge doesn't cut it off
              <div className="fixed z-[160] w-48 py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl" style={{ left: createMenuAt.x, top: createMenuAt.y }}>
                {[
                  { label: 'New show', Icon: Music, run: () => setIsAddSongModalOpen(true) },
                  { label: 'Project', Icon: FileText, run: () => newProject() },
                  { label: 'Folder', Icon: Folder, run: newFolder },
                  { label: 'Project template', Icon: LayoutTemplate, run: () => setIsTemplateGalleryOpen(true) },
                  { label: 'Import', Icon: Upload, run: () => setImportChooserOpen(true) },
                ].map(({ label, Icon, run }) => (
                  <button key={label} onClick={() => { setCreateMenuOpen(false); run(); }} className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs text-neutral-200 hover:bg-white/10 transition-colors">
                    <Icon size={13} className="text-neutral-400" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tree Section */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          <ProjectsPanel
            state={projectsState}
            onChange={setProjectsState}
            setlistOpen={activeTab === 'setlist'}
            activeItemId={activeSetlistItemId}
            onOpenProject={openProject}
            onOpenItem={openSetlistItem}
            getSong={(id) => songsList.find(s => s.id === id)}
            onNewProject={newProject}
          />
        </div>

      </div>
    );
  };

  // --- FOCUS MODE: only the slides, big. A project shows all its items' slides one after another. ---
  const renderFocusView = () => {
    const fromProject = activeTab === 'setlist';
    const sections: { title: string; slides: SlideDefinition[]; header?: boolean; color?: string }[] = fromProject
      ? serviceSetlist.items.map(it => it.type === 'header' ? { title: it.title, slides: [], header: true, color: it.headerColor } : { title: it.title, slides: it.slides || [] })
      : [{ title: songsList[activeItemIndex]?.title || '', slides: songsList[activeItemIndex]?.slides || [] }];
    const main = globalSettings.outputs.find(o => o.id === 'main') || globalSettings.outputs[0];
    return (
      <div className="flex-1 min-w-0 flex flex-col bg-black" data-focus-view>
        <div className="h-9 px-4 flex items-center gap-3 shrink-0">
          <span className="text-xs font-bold text-white">{fromProject ? serviceSetlist.name : sections[0].title}</span>
          <span className="text-[11px] text-neutral-500">Focus mode · click a slide to show it</span>
          <button onClick={() => setFocusMode(false)} className="ml-auto px-2.5 py-1 rounded text-[11px] font-semibold text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10" title="Ctrl+Shift+F">Leave focus mode</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-6 space-y-4">
          {sections.map((sec, si) => sec.header ? (
            <div key={si} className="pt-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: sec.color || '#ec4899' }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sec.color || '#ec4899' }} />{sec.title}
            </div>
          ) : sec.slides.length === 0 ? null : (
            <div key={si}>
              {fromProject && <div className="text-[11px] font-semibold text-neutral-400 mb-1.5">{sec.title}</div>}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {sec.slides.map((slide, i) => {
                  const live = liveState.slide?.id === slide.id;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      disabled={slide.disabled}
                      onClick={() => { setPreviewSlide(slide); goLive(slide); }}
                      className={`relative aspect-video rounded-lg overflow-hidden bg-[#09090b] text-left ring-2 ${live ? 'ring-red-500' : 'ring-transparent hover:ring-white/30'} disabled:opacity-40`}
                      data-focus-slide
                    >
                      <FixedStage className="w-full h-full pointer-events-none">
                        <SmartTextLayout text={slide.text} source={slide.source} type={slide.type} styleOverrides={applyGlobalStyles(slide, main, globalSettings)} className="w-full h-full" />
                      </FixedStage>
                      <span className="absolute top-1.5 left-1.5 text-[10px] font-bold text-neutral-300 bg-black/70 px-1.5 rounded">{i + 1}</span>
                      {slide.group && <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold uppercase text-white/80 bg-black/70 px-1.5 rounded">{slide.group}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
    if (appMode === 'mix') return renderMixWorkspace();

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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 content-start" data-delete-area="slides">
              {(() => { const slideBgs = slideBackgrounds(currentSlides); return currentSlides.map((slide, i) => {
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
                    onDragOver={(e) => { e.preventDefault(); if (isMediaDrag(e)) e.dataTransfer.dropEffect = 'copy'; setDragOverSlideIndex(i); }}
                    onDragLeave={() => setDragOverSlideIndex(prev => prev === i ? null : prev)}
                    onDrop={(e) => { e.preventDefault(); if (dropMediaOnSlide(e, slide)) { setDraggedSlideIndex(null); setDragOverSlideIndex(null); return; } handleDropSlide(i); }}
                    onContextMenu={(e) => rightClickGridSlide(e, i)}
                    onClick={(e) => clickGridSlide(e, currentSlides, i)}
                    data-grid-slide={slide.id}
                    className={`group aspect-video rounded-xl cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden bg-black shadow-lg ${
                      slide.disabled ? 'opacity-30 cursor-not-allowed' : ''
                    } ${
                      isLive 
                        ? 'border-pink-500 shadow-[0_0_20px_color-mix(in_srgb,var(--color-pink-500)_35%,transparent)] ring-1 ring-pink-500' 
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

                    {/* Background media: this slide's own (from here on), or carried on from an earlier slide */}
                    {slideBgs[i] && (
                      <>
                        {slideBgs[i]!.bg.type === 'image' && (
                          <img src={slideBgs[i]!.bg.url} alt="" draggable={false} className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${slideBgs[i]!.own ? 'opacity-50' : 'opacity-25'}`} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        <div
                          className={`absolute bottom-1.5 left-1.5 z-10 max-w-[85%] flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border backdrop-blur-sm ${slideBgs[i]!.own ? 'bg-emerald-600/80 border-emerald-400/40 text-white' : 'bg-black/60 border-white/10 text-neutral-400'}`}
                          title={`Background media: ${slideBgs[i]!.bg.name || 'media'}. Selecting this slide puts it on, and it stays on until another background replaces it. Right-click → Remove media.`}
                          data-slide-bg={slideBgs[i]!.own ? 'own' : 'carried'}
                        >
                          {slideBgs[i]!.bg.type === 'video' ? <Video size={9} className="shrink-0" /> : <ImageIcon size={9} className="shrink-0" />}
                          {slideBgs[i]!.own && <span className="truncate">{slideBgs[i]!.bg.name || 'Background'}</span>}
                        </div>
                      </>
                    )}
                    {gridChosen.has(slide.id) && (
                      <div className="absolute inset-0 z-20 pointer-events-none rounded-[10px] ring-2 ring-inset ring-sky-400 bg-sky-400/10" data-grid-chosen>
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center"><Check size={10} /></span>
                      </div>
                    )}
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
              }); })()}
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
  // Design mode works on the slide picked in its strip, otherwise it follows what's on air.
  // A Bible verse on air isn't a song slide: it is designed under "For scripture", so the lyrics side keeps the open song.
  const getDesignSlide = (outputId: string): SlideDefinition | null => {
    // A song slide: in a show that is a song (not a declaration), and not a Bible verse
    const isSongSlide = (sl: SlideDefinition | null | undefined): sl is SlideDefinition =>
      !!sl && !sl.declaration && songsList.some(song => song.category !== 'Declarations' && song.slides.some(x => x.id === sl.id));
    const picked = findSlideById(designSlideId);
    if (isSongSlide(picked)) return picked;
    const onAir = getOnAirSlide(outputId);
    const found = findSlideById(onAir?.id) || onAir;
    if (isSongSlide(found)) return found;
    // Otherwise the open show if it's a song, else the first song
    const open = songsList[activeItemIndex];
    if (open && open.category !== 'Declarations' && open.slides?.length) return open.slides[0];
    return songsList.find(song => song.category !== 'Declarations' && song.slides?.length)?.slides[0] ?? null;
  };

  // --- SCRIPTURE LOOK: each screen's scripture template, or its style's when the style sets one ---
  const scriptureSlotFor = (out: OutputSettings) => {
    const style = getStyleForOutput(out, globalSettings);
    return style?.scriptureTemplateId
      ? { style, templateId: style.scriptureTemplateId }
      : { style: undefined, templateId: screenScriptureTemplateId(out) };
  };
  // Declarations: the style's template when the style sets one (it would win anyway), otherwise the screen's own
  const declarationSlotFor = (out: OutputSettings) => {
    const style = getStyleForOutput(out, globalSettings);
    // Declarations have their own template: the style's, else the screen's, else the ready-made one (never the lyrics one)
    if (style?.declarationTemplateId) return { style, templateId: style.declarationTemplateId };
    return { style: undefined, templateId: out.declarationTemplateId || DEFAULT_DECLARATION_TEMPLATE_ID };
  };
  const setDeclarationTemplateFor = (out: OutputSettings, templateId: string) => {
    const { style } = declarationSlotFor(out);
    setGlobalSettings(prev => style
      ? { ...prev, styles: prev.styles.map(st => st.id === style.id ? { ...st, declarationTemplateId: templateId } : st) }
      : { ...prev, outputs: prev.outputs.map(o => o.id === out.id ? { ...o, declarationTemplateId: templateId } : o) });
  };
  const setScriptureTemplateFor = (out: OutputSettings, templateId: string) => {
    const { style } = scriptureSlotFor(out);
    setGlobalSettings(prev => style
      ? { ...prev, styles: prev.styles.map(st => st.id === style.id ? { ...st, scriptureTemplateId: templateId } : st) }
      : { ...prev, outputs: prev.outputs.map(o => o.id === out.id ? { ...o, scriptureTemplateId: templateId } : o) });
  };

  // One screen's background opacity (Design mode → Screen row), live on that screen only
  const setOutputBackgroundOpacity = (outputId: string, v: number) =>
    setGlobalSettings(prev => ({ ...prev, outputs: prev.outputs.map(o => o.id === outputId ? { ...o, backgroundOpacity: Math.round(v) } : o) }));

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
      const key = slide?.type === 'scripture' ? 'scriptureTemplateId' : slide?.declaration ? 'declarationTemplateId' : 'lyricsTemplateId';
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
        media: source?.media,
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
        declaration: neighbour?.declaration,
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
  // --- MIX MODE: the show's media layers, on the main screen ---
  const renderMixWorkspace = () => {
    const show = getMixShow();
    const mainId = mainScreenId(globalSettings.outputs);
    const out = globalSettings.outputs.find(o => o.id === mainId);
    const locked = !!liveState.lockedOutputs?.[mainId];
    const rawBg = locked ? liveState.frozenStates?.[mainId]?.bg : (liveState.globalBackground || out?.defaultBackground);
    const background = resolveOutputBackground(rawBg, out, globalSettings);
    return (
      <MixWorkspace
        show={show}
        screens={globalSettings.outputs.filter(o => !isStageOutput(o)).map(o => ({ id: o.id, name: o.name }))}
        mainScreenId={mainId}
        liveSlideId={liveState.slide?.id ?? null}
        liveMix={liveState.mix}
        autoSend={mixAutoSend}
        onAutoSend={setMixAutoSend}
        onChangeMix={(fn) => { if (show) changeShowMix(show.id, fn); }}
        onGoLive={(s) => { setPreviewSlide(s); goLive(s); }}
        onUpdateScreens={() => { if (show) sendMixToScreens(show); }}
        otherShows={songsList.filter(s => s.id !== show?.id).map(s => ({ id: s.id, title: s.title, hasMix: !!s.mix?.layers.length }))}
        onCopyMixTo={(id) => { if (show) copyMixTo(show, id); }}
        savedMixes={globalSettings.savedMixes || []}
        onSaveMix={(name) => { if (show) saveReusableMix(show, name); }}
        onUseSavedMix={(id) => { if (show) useSavedMix(show, id); }}
        onRenameSavedMix={(id, name) => setGlobalSettings(prev => ({ ...prev, savedMixes: (prev.savedMixes || []).map(m => m.id === id ? { ...m, name } : m) }))}
        onDeleteSavedMix={(id) => setGlobalSettings(prev => ({ ...prev, savedMixes: (prev.savedMixes || []).filter(m => m.id !== id) }))}
        renderScreen={(slide, layers, hideWords) => out ? (
          <AudienceOutputContent
            output={out}
            settings={globalSettings}
            slide={slide}
            background={background}
            muted
            designPreview
            wordsFaint
            noWords={!!hideWords}
            mix={{ layers }}
            overlays={overlaysFor(globalSettings.overlays, liveState.overlays, mainId)}
          />
        ) : null}
        onChangeDesignMedia={(slideId, mediaId, patch) => updateSlidesById(new Set([slideId]), s => {
          const d = s.designs?.[mainId] || {};
          const media = (d.media || []).flatMap(m => m.id !== mediaId ? [m] : patch ? [{ ...m, ...patch }] : []);
          return withDesign(s, mainId, { ...d, media: media.length ? media : undefined });
        })}
        onEditInDesign={(slideId) => { setDesignOutputId(mainId); openDesign(slideId); }}
        focus={mixFocus}
      />
    );
  };

  const renderDesignWorkspace = () => {
    // Design is for audience screens; stage screens get their look from Stage styles
    const outputs = globalSettings.outputs.filter(o => o.enabled && !isStageOutput(o));
    if (outputs.length === 0) {
      return <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">Enable a normal (audience) output in Settings to design it.</div>;
    }
    const out = outputs.find(o => o.id === designOutputId) || outputs[0];
    const locked = !!liveState.lockedOutputs?.[out.id];
    const onAirId = locked ? liveState.frozenStates?.[out.id]?.slide?.id : liveState.slide?.id;
    const style = getStyleForOutput(out, globalSettings);
    const rawBg = locked ? liveState.frozenStates?.[out.id]?.bg : (liveState.globalBackground || out.defaultBackground);
    const background = resolveOutputBackground(rawBg, out, globalSettings);
    const status = {
      presenting: !!liveState.isPresenting,
      textCleared: !!(liveState.clearedOutputs?.[out.id] || liveState.clearText),
      locked: liveState.lockedOutputs?.[out.id] === true,
    };

    // Overlays: designed over what this screen shows now
    if (designFor === 'overlay') {
      const list = globalSettings.overlays || [];
      const current = list.find(o => o.id === designOverlayId) || list[0];
      const onAir = getOnAirSlide(out.id);
      return (
        <OverlayDesignWorkspace
          overlays={list}
          overlayId={current?.id || null}
          onPick={setDesignOverlayId}
          onChange={saveOverlay}
          onNew={() => void createOverlay()}
          isOn={!!current && (liveState.overlays || []).includes(current.id)}
          onToggleOn={() => current && toggleOverlay(current.id)}
          onDesignFor={setDesignFor}
          renderUnder={() => <AudienceOutputContent output={out} settings={globalSettings} slide={onAir} background={background} muted />}
        />
      );
    }

    // For scripture / declarations: the screen's template for them, designed with one on air (or a sample)
    if (designFor === 'scripture' || designFor === 'declaration') {
      const declaration = designFor === 'declaration';
      const slot = declaration ? declarationSlotFor(out) : scriptureSlotFor(out);
      const template = getTemplateById(slot.templateId) || getTemplateById(declaration ? DEFAULT_DECLARATION_TEMPLATE_ID : DEFAULT_SCRIPTURE_TEMPLATE_ID)!;
      const onAir = getOnAirSlide(out.id);
      const openShow = songsList[activeItemIndex];
      const verse = declaration
        ? (onAir?.declaration ? onAir : previewSlide?.declaration ? previewSlide
          : (openShow?.category === 'Declarations' ? openShow.slides[0] : songsList.find(sg => sg.category === 'Declarations')?.slides[0]) || null)
        : (onAir?.type === 'scripture' ? onAir : previewSlide?.type === 'scripture' ? previewSlide : null);
      return (
        <ScriptureDesignWorkspace
          kind={designFor}
          outputs={outputs}
          selectedOutputId={out.id}
          onSelectOutput={setDesignOutputId}
          onDesignFor={setDesignFor}
          templates={inlineTemplates}
          template={template}
          scope={slot.style
            ? { kind: 'style', styleName: slot.style.name, screens: outputs.filter(o => o.styleId === slot.style!.id).map(o => o.name) }
            : { kind: 'screen' }}
          onUseTemplate={(templateId) => declaration ? setDeclarationTemplateFor(out, templateId) : setScriptureTemplateFor(out, templateId)}
          textHidden={style?.activeLayers.slide === false}
          styleName={style?.name}
          backgroundOpacity={out.backgroundOpacity ?? 80}
          onBackgroundOpacity={(v) => setOutputBackgroundOpacity(out.id, v)}
          status={status}
          verse={verse}
          verseOnAir={!!verse && verse.id === onAirId}
          renderOutput={(s, t) => (
            <AudienceOutputContent output={out} settings={globalSettings} slide={s} background={background} muted templateOverride={t} />
          )}
          onGoLive={(s) => goLive(s)}
        />
      );
    }

    const slide = getDesignSlide(out.id);
    const resolved = resolveSlideForOutput(slide, out, undefined, style);
    const song = getSongForSlide(slide);
    const setDesignOn = (ids: string[], design: SlideDesign | undefined) =>
      updateSlidesById(new Set(ids), s => withDesign(s, out.id, design));

    return (
      <LiveDesignWorkspace
        outputs={outputs}
        selectedOutputId={out.id}
        onSelectOutput={setDesignOutputId}
        onDesignFor={setDesignFor}
        templates={inlineTemplates}
        templateInfo={getOutputTemplateInfo(out.id, slide)}
        onAssignTemplate={(templateId) => handleAssignLiveTemplate(out.id, templateId, slide)}
        isDeclarationSlide={!!slide?.declaration}
        backgroundOpacity={out.backgroundOpacity ?? 80}
        onBackgroundOpacity={(v) => setOutputBackgroundOpacity(out.id, v)}
        look={{
          global: { ...(resolved.styleOverrides?.global || {}) },
          layout: { x: 0.05, y: 0.05, width: 0.9, height: 0.9, ...(resolved.styleOverrides?.layout || {}) },
          animation: resolved.animation,
          words: resolved.styleOverrides?.words,
          lines: resolved.styleOverrides?.lines,
          verticalAlign: resolved.styleOverrides?.verticalAlign,
        }}
        design={slide?.designs?.[out.id]}
        onChangeDesign={(fn) => { if (slide) updateSlidesById(new Set([slide.id]), s => withDesign(s, out.id, fn(s.designs?.[out.id] || {}))); }}
        onCopyDesign={(toIds) => { if (slide) setDesignOn(toIds, slide.designs?.[out.id]); }}
        onResetDesign={(ids) => setDesignOn(ids, undefined)}
        onRemoveMedia={removeSlideMedia}
        onOpenInMix={(slideId, mediaId) => {
          // Mix opens on that slide's show, with the picture picked
          const index = songsList.findIndex(s => s.slides.some(x => x.id === slideId));
          if (activeTab !== 'setlist' && index >= 0) setActiveItemIndex(index);
          setMixFocus({ slideId, mediaId, at: Date.now() });
          setAppMode('mix');
        }}
        textHidden={style?.activeLayers.slide === false}
        status={status}
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
            overlays={locked ? (liveState.frozenStates?.[out.id]?.overlays || []) : overlaysFor(globalSettings.overlays, liveState.overlays, out.id)}
            mix={song && slide ? { layers: mixLayersAt(song.mix, song.slides, song.slides.findIndex(x => x.id === slide.id)) } : null}
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
    // The show that is open: from the Shows tab, or the song of the open setlist item
    const song = getOpenShow();
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
        // Tags are song sections, so scripture templates (ready-made or your own) aren't offered
        templates={inlineTemplates.filter(t => t.category !== 'scripture')}
        templateId={song.groupLooks?.[groupMenu.group]?.templateId}
        currentSlideLabel={currentIndex >= 0 ? `slide ${currentIndex + 1}` : undefined}
        onSetTemplate={(templateId) => {
          handleSetGroupTemplate(song.id, groupMenu.group, templateId);
          // A screen whose style sets a template keeps showing that one
          const first = song.slides.find(s => s.group === groupMenu.group);
          const key = first?.type === 'scripture' ? 'scriptureTemplateId' : first?.declaration ? 'declarationTemplateId' : 'lyricsTemplateId';
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
    // The show that is open (Shows tab or setlist)
    const activeSong = getOpenShow();
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
          <button onClick={() => toggleLockOutput('main')} className={`p-1 rounded transition-colors ${liveState.lockedOutputs?.['main'] === true ? 'text-red-500 bg-red-500/10' : 'hover:text-white hover:bg-white/10'}`} title="Pause Output 1 (Ctrl+1): it keeps what it shows while you send to the others"><Lock size={14} /></button>
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
          <button onClick={() => setGlobalBackground(null)} title="Clear Background and the mix (F1)" className={`p-1.5 rounded transition-colors ${!liveState.globalBackground && !liveState.mix?.layers.length ? 'text-neutral-600' : 'text-neutral-300 hover:text-pink-400 hover:bg-white/5'}`}><ImageIcon size={15} /></button>
          <button onClick={toggleClearText} title="Clear Slide Text" className={`p-1.5 rounded transition-colors ${liveState.clearText ? 'text-pink-500 bg-pink-500/20 font-bold' : 'text-neutral-300 hover:text-pink-400 hover:bg-white/5'}`}><FileText size={15} /></button>
          <button onClick={clearOverlays} title="Clear Overlays (F3)" data-toolbar-clear-overlays className={`p-1.5 rounded transition-colors ${liveState.overlays?.length ? 'text-neutral-300 hover:text-pink-400 hover:bg-white/5' : 'text-neutral-600'}`}><Layers size={15} /></button>
          <button onClick={toggleMute} title="Mute Audio" className={`p-1.5 rounded transition-colors ${isVideoMuted ? 'text-neutral-600' : 'text-neutral-300 hover:text-pink-400 hover:bg-white/5'}`}><Music size={15} /></button>
          <button title="Timer" className="p-1.5 rounded text-neutral-400 hover:text-pink-400 hover:bg-white/5 transition-colors"><Clock size={15} /></button>
        </div>

        {/* A playback video's controls (its sound plays from this computer) */}
        {liveState.globalBackground?.playback && liveState.globalBackground.url && (
          <React.Fragment key={liveState.globalBackground.url}>
            <PlaybackBar
              url={liveState.globalBackground.url}
              name={liveState.globalBackground.fileName || 'Video'}
              onEnded={() => endPlayback(liveState.globalBackground!.url)}
              onStop={() => endPlayback(liveState.globalBackground!.url)}
            />
          </React.Fragment>
        )}

        {/* Current Item Status Indicator */}
        <div className="px-3 py-1.5 border-b border-[#262635] flex items-center justify-between text-xs text-neutral-400 shrink-0 bg-[#121218]">
          <span className="font-semibold text-white truncate max-w-[140px]">{activeSong?.title || 'Welcome'}</span>
          <span className="font-mono text-neutral-500 text-[11px]">{currentSlideNum}/{totalSlides}</span>
        </div>

        {appMode === 'design' && designFor !== 'lyrics' ? (
          // Designing a template (scripture or declarations): no groups here, so the panel says what is being designed
          <div className="flex-1 p-3 space-y-1.5 text-[11px] leading-relaxed" data-scripture-panel>
            <div className="text-[10px] uppercase font-bold text-neutral-500">{designFor === 'scripture' ? 'Scripture' : designFor === 'overlay' ? 'Overlays' : 'Declarations'}</div>
            <p className="text-neutral-400">{designFor === 'scripture'
              ? 'Scripture has no groups. Here you design how every Bible verse and its reference look on the screen.'
              : designFor === 'overlay'
              ? 'Here you design an overlay: pictures, videos and text that stay on the screens while slides and backgrounds change. Switch overlays on and off in the Overlays tab; F3 takes them all off.'
              : 'Here you design the Declarations template: how the slides of every Declaration show look on the screen.'}</p>
          </div>
        ) : (<>
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
                {activeSong && songsList.some(sg => sg.id === activeSong.id) ? (
                  <select
                    value={activeSong.category === 'Declarations' ? 'Declarations' : 'Songs'}
                    onChange={(e) => setShowCategory(activeSong.id, e.target.value as 'Songs' | 'Declarations')}
                    className="mt-0.5 bg-[#09090B] border border-white/10 text-neutral-200 rounded px-2 py-1 text-xs outline-none focus:border-pink-500 cursor-pointer"
                    title="Each kind uses its own template (Declarations: the Declarations template)"
                    data-show-category-select
                  >
                    <option value="Songs">Song</option>
                    <option value="Declarations">Declaration</option>
                  </select>
                ) : (
                  <span className="text-neutral-300">{activeSong?.category === 'Declarations' ? 'Declarations' : 'Songs'}</span>
                )}
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
        </>)}
      </div>
    );
  };

  // --- BOTTOM HORIZONTAL LIBRARY & BROWSER ---
  const renderBottomBrowser = () => {
    const filteredSongs = songsList.filter(song => {
      if (selectedCategory !== 'all' && song.category !== selectedCategory) return false;
      if (!songSearchQuery.trim()) return true;
      const q = songSearchQuery.toLowerCase();
      return song.title.toLowerCase().includes(q) || song.slides.some(s => s.text.toLowerCase().includes(q));
    });

    const activeSong = songsList[activeItemIndex] || songsList[0];
    const songsCount = songsList.filter(s => s.category === 'Songs').length;
    const declarationsCount = songsList.filter(s => s.category === 'Declarations').length;

    return (
      <div className="h-full bg-[#0c0c11] flex flex-col overflow-hidden select-none">
        {/* Horizontal Tab Strip across Top of Bottom Panel */}
        <div className="h-9 bg-[#101015] border-b border-[#262635] flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center space-x-1 lg:space-x-3 overflow-x-auto">
            {[
              { id: 'shows', label: 'Shows', icon: FileText },
              { id: 'media', label: 'Media', icon: ImageIcon },
              { id: 'overlays', label: 'Overlays', icon: Layers },
              { id: 'templates', label: 'Templates', icon: Sparkles },
              { id: 'scripture', label: 'Scripture', icon: BookOpen },
              { id: 'timers', label: 'Timers', icon: TimerIcon },
              // hidden until needed: audio, calendar, functions
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
                onClick={() => setSelectedCategory('Declarations')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === 'Declarations' ? 'bg-pink-500/15 text-pink-300 font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Mic size={13} />
                  <span>Declarations</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">{declarationsCount}</span>
              </button>

              <button 
                onClick={async () => {
                  const cat = await askText('Name for the new category', '', { okLabel: 'Create' });
                  if (cat) void showMessage(`Category "${cat}" created.`);
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
                      data-show-row
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData(DRAG_SONG, song.id); e.dataTransfer.effectAllowed = 'copy'; }}
                      title="Drag into a project to add it to the setlist"
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
              <div className="h-10 px-4 border-t border-[#262635] flex items-center justify-end shrink-0 bg-[#101015]">

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
                  <span className="text-neutral-300 italic">{activeSong?.category === 'Declarations' ? 'Declarations' : 'Songs'}</span>
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
            <MediaLibrary onSelectBackground={setGlobalBackground} onPlayVideo={startPlayback} onSelectInput={setLiveInputBackground} activeInput={liveState.globalBackground?.type === 'input' ? liveState.globalBackground.input : null} />
          </div>
        ) : bottomTab === 'audio' ? (
          <div className="flex-1 min-h-0 bg-[#0d0d12]">
            <AudioModule onVerseDetected={handleVerseDetected} />
          </div>
        ) : bottomTab === 'overlays' ? (
          <div className="flex-1 min-h-0 bg-[#0d0d12]">
            <OverlaysPanel
              overlays={globalSettings.overlays || []}
              groups={globalSettings.overlayGroups || []}
              activeIds={liveState.overlays || []}
              screens={globalSettings.outputs.filter(o => !isStageOutput(o)).map(o => ({ id: o.id, name: o.name }))}
              onChange={setOverlays}
              onChangeGroups={(overlayGroups) => setGlobalSettings(prev => ({ ...prev, overlayGroups }))}
              onToggle={toggleOverlay}
              onClearAll={clearOverlays}
              onEdit={editOverlay}
            />
          </div>
        ) : bottomTab === 'timers' ? (
          <div className="flex-1 min-h-0 bg-[#0d0d12]">
            <TimersPanel
              presets={globalSettings.timerPresets ?? DEFAULT_TIMER_PRESETS}
              onChangePresets={(timerPresets) => setGlobalSettings(prev => ({ ...prev, timerPresets }))}
              timer={liveState.timer}
              onStart={startTimer}
              onPauseResume={pauseResumeTimer}
              onStop={stopTimer}
              onAdjust={adjustTimer}
              flicker={globalSettings.timeUpFlicker !== false}
              onFlicker={setTimeUpFlicker}
            />
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
        <div role="status" className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 bg-neutral-900/95 border shadow-2xl pointer-events-none flex items-center gap-2 text-sm text-white max-w-[min(640px,calc(100vw-32px))] w-max ${undoToast.kind === 'error' ? 'rounded-xl border-red-500/40' : 'rounded-full border-white/10'}`}>
          {undoToast.kind === 'error'
            ? <Info size={14} className="text-red-400 shrink-0" />
            : undoToast.kind === 'info'
            ? <Check size={14} className="text-emerald-400 shrink-0" />
            : <RotateCcw size={14} className={`shrink-0 ${undoToast.text === 'Redone' ? '-scale-x-100' : ''}`} />}
          <span className="min-w-0">{undoToast.text}</span>
          {undoToast.kind !== 'error' && !undoToast.noUndo && <span className="text-[11px] text-neutral-500 shrink-0">Ctrl+Z undo · Ctrl+Y redo</span>}
        </div>
      )}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => { setIsSettingsModalOpen(false); setSettingsOpenTab(null); }} 
        settings={globalSettings} 
        onSave={setGlobalSettings}
        profilesApi={profilesApi}
        profileId={activeProfileId}
        openTab={settingsOpenTab}
        isPresenting={liveState.isPresenting}
        onTogglePresenting={togglePresenting}
        onToggleLockOutput={toggleLockOutput}
      />

      {/* TOP HEADER BAR (FreeShow Style) */}
      <header className="h-10 bg-[#09090b] border-b border-[#262635] grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 shrink-0 z-30 select-none" data-top-bar>
        {/* Left: Menu & Brand Logo (the left and right sides are the same width, so the mode buttons sit exactly in the middle) */}
        <div className="flex items-center gap-3 min-w-0 justify-self-start">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <TopMenu label="File" entries={[
              { label: 'Import…', shortcut: 'Ctrl+I', onClick: () => setImportChooserOpen(true), hint: 'Songs from FlowShow and other programs, documents, the clipboard, templates, profiles, a backup, or a Bible' },
              { label: 'Export…', shortcut: 'Ctrl+E', onClick: () => setAppDialog('export') },
            ]} />
            <input
              ref={fileImportRef}
              type="file"
              multiple
              className="hidden"
              accept={`${IMPORT_ACCEPT},.flowshow-songs,.fstemplates,.flowshow-profile,${BACKUP_EXTENSION},.xml,.json`}
              onChange={(e) => { const files: File[] = Array.from((e.target.files || []) as FileList); e.target.value = ''; void importAnyFiles(files); }}
              data-file-import
            />
            <TopMenu label="View" entries={[
              { label: 'Full screen', shortcut: 'F11', onClick: toggleFullscreen },
              { label: focusMode ? 'Leave focus mode' : 'Focus mode', shortcut: 'Ctrl+Shift+F', onClick: () => setFocusMode(v => !v) },
            ]} />
            <TopMenu label="Help" entries={[
              { label: 'Shortcuts', onClick: () => setAppDialog('shortcuts') },
              { label: 'Documentation', onClick: () => setAppDialog('docs') },
              { label: 'Quick start guide', onClick: () => setAppDialog('quickstart') },
              'divider',
              { label: 'About FlowShow', onClick: () => setAppDialog('about') },
            ]} />
            <ProfileMenu
              profiles={profiles}
              activeId={activeProfileId}
              onSwitch={(id) => switchProfile(id, globalSettings)}
              onDuplicate={async () => {
                const current = profiles.find(p => p.id === activeProfileId);
                const name = await askText('Name for the copy (it becomes the profile in use, ready to change)', `${current?.name || 'Main'} (copy)`, { okLabel: 'Make copy' });
                if (name) { profilesApi.onCreate(name, true, globalSettings); setUndoToast({ text: `Profile "${name}" in use (a copy of "${current?.name || 'Main'}")`, at: Date.now(), kind: 'info', noUndo: true }); }
              }}
              onNew={async () => {
                const name = await askText('Name for the new profile (FlowShow\u2019s starting setup)', 'New venue', { okLabel: 'Create' });
                if (name) profilesApi.onCreate(name, false, globalSettings);
              }}
              onExport={() => profilesApi.onExport(activeProfileId, globalSettings)}
              onImport={(file) => profilesApi.onImport(file).then(msg => msg.replace('Click "Switch to" to use it.', 'Choose it in the Profile menu to use it.'))}
              onManage={() => { setSettingsOpenTab('profiles'); setIsSettingsModalOpen(true); }}
              onMessage={(text) => setUndoToast({ text, at: Date.now(), kind: text.startsWith('Imported') ? 'info' : 'error', noUndo: true })}
            />
          </div>
          <span className="font-black text-pink-500 tracking-wider text-base ml-2">FlowShow</span>
        </div>

        {/* Center: Mode Tabs (Show | Design | Mix | Stage) */}
        <div className="flex items-center gap-1 bg-[#121218] p-0.5 rounded-lg border border-[#262635] justify-self-center" data-mode-tabs>
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
            onClick={() => setAppMode('mix')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              appMode === 'mix' ? 'text-pink-400 bg-pink-500/15 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
            title="Media Mixer: layers of pictures, videos and colour for a show"
            data-mode-mix
          >
            <Film size={12} />
            Mix
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
        <div className="flex items-center gap-2 justify-self-end">
          {/* Remote / Squiggle icon */}
          <button 
            onClick={() => void showMessage('FlowShow Remote is connected and listening.')}
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
            title={liveState.isPresenting ? 'Presenting: click (or Ctrl+O) to turn the screens off' : 'Not presenting: click (or Ctrl+O) to turn the screens on'}
          >
            <MonitorPlay size={16} />
          </button>
        </div>
      </header>

      {/* TOP SECTION: 3-COLUMN WORKSPACE (Projects | Slide Grid | Output Monitors) */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Focus mode keeps the output monitors, so you still see what is being sent */}
        {/* The same three places in both layouts, so switching Focus mode never rebuilds the output monitors */}
        {focusMode ? null : renderProjectsSidebar()}
        {focusMode ? renderFocusView() : renderCenterSlideArea()}
        {renderRightOutputsPanel()}
      </div>

      {/* DRAG HANDLE DIVIDER */}
      {!focusMode && <div
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
      </div>}

      {/* BOTTOM SECTION: HORIZONTAL LIBRARY & BROWSER (hidden in focus mode) */}
      <div
        style={{ height: bottomPanelCollapsed || focusMode ? 0 : bottomPanelHeight }}
        className="shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out"
      >
        {renderBottomBrowser()}
      </div>

      {/* FlowShow's own dialogs (names, yes / no questions, messages) */}
      <AppDialogHost />

      {/* Saved export: where it is */}
      {savedFile && (
        <div className="fixed bottom-5 right-5 z-[200] w-[380px] rounded-xl border border-white/10 bg-[#18181b] shadow-2xl p-4" role="status" data-saved-file>
          <div className="flex items-start gap-3">
            <Check size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white truncate" title={savedFile.name}>Saved {savedFile.name}</div>
              <div className="text-[11px] text-neutral-400 mt-0.5 break-all" data-saved-path>{savedFile.path.replace(/[\\/][^\\/]+$/, '')}</div>
            </div>
            <button type="button" onClick={() => setSavedFile(null)} className="p-1 rounded text-neutral-500 hover:text-white hover:bg-white/10" title="Close"><X size={14} /></button>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => revealFile(savedFile.path).catch(err => toast(String(err), true))}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1.5"
              data-show-in-folder
            >
              <Folder size={13} /> Show in folder
            </button>
          </div>
        </div>
      )}

      {/* CONTEXT MENUS */}
      {contextMenu && (
        <div className="fixed z-50 bg-[#18181B] border border-white/10 rounded-lg shadow-2xl overflow-hidden py-1.5 w-48 backdrop-blur-xl" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}
          data-context-menu
          ref={(el) => {
            // Keep the whole menu on screen: open upwards / leftwards when it would run off the edge
            if (!el) return;
            const r = el.getBoundingClientRect();
            if (contextMenu.y + r.height > window.innerHeight - 8) el.style.top = `${Math.max(8, window.innerHeight - r.height - 8)}px`;
            if (contextMenu.x + r.width > window.innerWidth - 8) el.style.left = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
          }}>
          {contextMenu.type === 'slide' ? (
             <>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { openDesign(getShownSlides().slides[contextMenu.id as number]?.id ?? null); setContextMenu(null); }}><Edit2 size={14}/> Edit</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleDuplicateSlide(contextMenu.id as number); setContextMenu(null); }}><Copy size={14}/> Duplicate</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleSplitSlide(contextMenu.id as number); setContextMenu(null); }}><Split size={14}/> Split</button>
               {(() => {
                 const targets = gridMenuTargets(contextMenu.id as number);
                 const withMedia = targets.filter(slideHasMedia);
                 return withMedia.length > 0 && (
                   <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" data-remove-slide-media onClick={() => { removeSlideMedia(withMedia.map(s => s.id)); setGridChosen(new Set()); setContextMenu(null); }}>
                     <ImageIcon size={14}/> Remove media{targets.length > 1 ? ` (${withMedia.length} slide${withMedia.length === 1 ? '' : 's'})` : ''}
                   </button>
                 );
               })()}
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleRemoveTemplate('slide', contextMenu.id as number); setContextMenu(null); }}><X size={14}/> Remove template (this slide)</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleRemoveTemplate('song', contextMenu.id as number); setContextMenu(null); }}><X size={14}/> Remove template (whole song)</button>
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 text-sm transition-colors flex items-center gap-2" onClick={() => { handleDeleteSlide(contextMenu.id as number); setContextMenu(null); }}><Trash size={14}/> Delete</button>
             </>
          ) : (
            <>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={async () => {
                   if (contextMenu.type === 'song') {
                      const song = songsList.find(s => s.id === contextMenu.id);
                      if (song) { const newName = await askText('Song name', song.title, { okLabel: 'Rename' }); if (newName && newName.trim()) setSongsList(prev => prev.map(s => s.id === contextMenu.id ? { ...s, title: newName.trim() } : s)); }
                   } else if (contextMenu.type === 'bible') {
                      const b = bibleList.find(b => b.id === contextMenu.id);
                      if (b) { const newName = await askText('Bible name', b.name, { okLabel: 'Rename' }); if (newName && newName.trim()) { getBible(contextMenu.id as string).then(bibleData => { if (bibleData) { bibleData.name = newName.trim(); saveBible(bibleData).then(() => { getBibleList().then(list => setBibleList(list)); if (activeBibleId === contextMenu.id) setActiveBibleData(bibleData); }); }}); }}
                   }
                   setContextMenu(null);
                 }}><Edit2 size={14}/> Rename {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
               {contextMenu.type === 'song' && (() => {
                 const show = songsList.find(s => s.id === contextMenu.id);
                 const current = show?.category === 'Declarations' ? 'Declarations' : 'Songs';
                 return (
                   <>
                     <div className="h-px w-full bg-white/5 my-1" />
                     <div className="px-4 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-neutral-500">Category</div>
                     {(['Songs', 'Declarations'] as const).map(c => (
                       <button key={c} className="w-full text-left px-4 py-1.5 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2"
                         onClick={() => { setShowCategory(String(contextMenu.id), c); setContextMenu(null); }} data-show-set-category={c}>
                         <span className="w-3.5">{current === c && <Check size={13} className="text-pink-400" />}</span>
                         {c === 'Songs' ? 'Song' : 'Declaration'}
                       </button>
                     ))}
                   </>
                 );
               })()}
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 text-sm transition-colors flex items-center gap-2" onClick={() => {
                   if (contextMenu.type === 'song') deleteSong(contextMenu.id); else if (contextMenu.type === 'bible') handleDeleteBible(contextMenu.id as string);
                   setContextMenu(null);
                 }}><Trash size={14}/> Delete {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
            </>
          )}
        </div>
      )}

      {appDialog === 'export' && (
        <ExportDialog
          onClose={() => setAppDialog(null)}
          onChoose={(c) => { void runExport(c); }}
          songTitle={songsList[activeItemIndex]?.title}
          songCount={songsList.length}
          templateCount={inlineTemplates.length}
          profileName={profiles.find(p => p.id === activeProfileId)?.name || 'Main'}
        />
      )}
      {appDialog === 'shortcuts' && <ShortcutsDialog onClose={() => setAppDialog(null)} />}
      {appDialog === 'quickstart' && <QuickStartDialog onClose={() => setAppDialog(null)} />}
      {appDialog === 'about' && <AboutDialog onClose={() => setAppDialog(null)} />}
      {appDialog === 'docs' && <DocumentationDialog onClose={() => setAppDialog(null)} />}
      {templateExport && <ExportTemplatesDialog templates={inlineTemplates} initialIds={templateExport === 'all' ? inlineTemplates.map(t => t.id) : []} onClose={() => setTemplateExport(null)} />}
      {templateImportFile && <ImportTemplatesDialog initialFile={templateImportFile} onClose={() => setTemplateImportFile(null)} onInstalled={() => getStoredTemplates().then(setInlineTemplates)} />}
      <ImportShowsModal
        isOpen={isImportOpen}
        pendingFiles={pendingShowFiles}
        onClose={() => { setIsImportOpen(false); setPendingShowFiles(undefined); }}
        onImport={addImportedShows}
      />
      {importChooserOpen && (
        <ImportChooser
          onClose={() => setImportChooserOpen(false)}
          onFiles={(kind, files) => void importChosenFiles(kind, files)}
          onPaste={(title, text, category) => addImportedShows([showFromText(title, text)], category)}
        />
      )}
      <AddSongModal
        isOpen={isAddSongModalOpen}
        onClose={() => setIsAddSongModalOpen(false)}
        onAddSong={(newSong) => {
          // A Declaration's slides are marked so screens use the Declarations template for them
          const declaration = newSong.category === 'Declarations';
          const show = { ...newSong, createdAt: new Date().toISOString(), slides: declaration ? newSong.slides.map(s => ({ ...s, declaration: true })) : newSong.slides };
          setSongsList(prev => [...prev, show]);
          setActiveTab('songs');
          setActiveItemIndex(songsList.length);
        }}
      />

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
/**
 * A background video on a screen. Always silent: a playback video's sound comes only from the playback bar's player,
 * which this follows (time, pause, loop); other videos loop on their own.
 */
function BackgroundVideo({ url, playback, videoRef, opacity }: { url: string; playback: boolean; videoRef?: React.RefObject<HTMLVideoElement>; opacity: number }) {
  const local = useRef<HTMLVideoElement | null>(null);
  usePlaybackFollower(local, playback ? url : null);
  return (
    <video
      ref={(el) => { local.current = el; if (videoRef) (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el; }}
      src={url}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      style={{ opacity }}
      autoPlay
      loop={!playback}
      muted
      playsInline
      data-bg-media
      data-playback={playback ? '' : undefined}
    />
  );
}

/** Mix mode's canvas: the words faint (a sheet of its own, still above the media) */
const FAINT_WORDS: React.CSSProperties = { position: 'absolute', inset: 0, opacity: 0.35, zIndex: 10, pointerEvents: 'none' };

function AudienceOutputContent({ output, settings, slide, background, hideBackground = false, hideText = false, videoRef, muted = false, scrollPreviewPos, highlightWordIndex, designPreview = false, templateOverride, overlays = [], mix, wordsFaint = false, noWords = false }: {
  /** The Media Mixer's layers (filtered here to the ones for this screen) */
  mix?: { layers: LiveMixLayer[]; exitFade?: number } | null;
  /** Mix mode's canvas: the words faint, so media can be placed around them */
  wordsFaint?: boolean;
  /** Leave the words out (Mix: working on the media alone) */
  noWords?: boolean;
  /** Overlays on this screen (they stay through clears; only F3 takes them off) */
  overlays?: Overlay[];
  output: OutputSettings | undefined;
  settings: GlobalSettings | undefined;
  slide: SlideDefinition | null | undefined;
  /** Design canvas only: draw the slide in this template (one being changed) instead of its own */
  templateOverride?: PresentationTemplate;
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
  // When the slide is taken away (Clear all), its words stay just long enough to fade out
  const lastSlide = useRef(slide);
  if (slide) lastSlide.current = slide;
  const shownSlide = slide || lastSlide.current;
  const resolved = shownSlide ? resolveSlideForOutput(shownSlide, output, undefined, style, templateOverride) : null;
  const design = shownSlide?.designs?.[output?.id || 'main'];
  const showText = !hideText && !!slide && style?.activeLayers.slide !== false;
  // Clearing fades (or uses the slide's own exit animation, when its design has one)
  const pageHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const slideExit = resolved?.animation?.exit;
  const clearSeconds = pageHidden ? 0 : slideExit && slideExit.type !== 'none' ? (slideExit.duration ?? 0.35) : 0.6;
  const bgKey = bg ? `${bg.type}|${bg.url || ''}|${bg.color || ''}|${bg.input ? inputKey(bg.input) : ''}` : '';
  // How strongly the background shows over black (Settings → Outputs → Background opacity)
  const bgOpacity = Math.min(100, Math.max(0, output?.backgroundOpacity ?? 80)) / 100;

  return (
    <>
      {/* The background fades out when cleared and crossfades when it changes */}
      <AnimatePresence initial={false}>
      {bg && (
      <motion.div
        key={bgKey}
        className="absolute inset-0 w-full h-full pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: clearSeconds, ease: 'easeOut' }}
        data-bg-layer
      >
      {bg?.type === 'color' && <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ backgroundColor: bg.color || '#000', opacity: bgOpacity }} />}

      {/* A camera, screen or NDI source */}
      {bg?.type === 'input' && bg.input && (
        <LiveInputView input={bg.input} quality="high" className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: bgOpacity }} showProblems={designPreview} />
      )}

      {bg?.url && bg.type === 'video' ? (
        <BackgroundVideo url={bg.url} playback={!!bg.playback} videoRef={videoRef} opacity={bgOpacity} />
      ) : bg?.url ? (
        <img src={bg.url} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity: bgOpacity }} alt="bg" data-bg-media />
      ) : null}
      </motion.div>
      )}
      </AnimatePresence>

      {/* Media Mixer: the show's layers, above the background (they blend with it) and under overlays and words */}
      <MixStack layers={mixLayersForScreen(mix?.layers, output?.id, settings?.outputs)} exitFade={mix?.exitFade} preview={designPreview} />

      {/* Overlays drawn under the words */}
      <OverlayLayer overlays={overlays} above={false} />

      {/* Pictures and videos: the template's, then this slide's own (above the background, under the words). They go with the words: Clear text and Clear all fade them out; clearing the background leaves them */}
      {shownSlide && <DesignMediaLayer items={[...(resolved?.styleOverrides?.media || []), ...(design?.media || [])]} preview={designPreview} cleared={!showText} fadeSeconds={clearSeconds} />}

      {/* data-text-layer lets the Design canvas tell which words belong to the lyrics */}
      {/* Cleared words stay in place and fade (or leave with the slide's exit), so clearing never cuts */}
      {shownSlide && resolved && !design?.hideLyrics && !noWords && (
        <div data-text-layer="lyrics" style={wordsFaint ? FAINT_WORDS : { display: 'contents' }}>
          <SmartTextLayout
            text={shownSlide.text}
            source={shownSlide.source}
            type={shownSlide.type}
            animation={resolved.animation}
            styleOverrides={resolved.styleOverrides}
            scrollPreviewPos={scrollPreviewPos}
            highlightWordIndex={highlightWordIndex}
            className="relative z-10 w-full h-full"
            cleared={!showText}
          />
        </div>
      )}

      {shownSlide && !noWords && design?.customBoxes?.filter(box => designPreview || isBoxOnScreen(box)).map(box => (
        <div key={box.id} data-text-layer={box.id} style={wordsFaint ? FAINT_WORDS : { display: 'contents' }}>
          <SmartTextLayout
            text={box.text}
            type="lyrics"
            animation={resolveCustomBoxAnimation(box)}
            styleOverrides={{ global: box.style, layout: box.layout, verticalAlign: box.verticalAlign }}
            className={`relative z-10 w-full h-full ${box.hidden ? 'opacity-30' : ''}`}
            cleared={!showText}
          />
        </div>
      ))}

      {/* Overlays drawn over the words */}
      <OverlayLayer overlays={overlays} above />

      {/* Mix borders: over everything (outside the border's window stays covered, words and overlays too) */}
      <MixStack layers={mixLayersForScreen(mix?.layers, output?.id, settings?.outputs)} exitFade={mix?.exitFade} preview={designPreview} top />

      {/* The screen's border (its Style): on every slide, over everything */}
      <ScreenBorderView border={screenBorderFor(output, settings)} />
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

  // Opened on the operator's own screen: show how to get back, and let a click close it too
  const onOperatorScreen = new URLSearchParams(window.location.search).get('operator') === '1';
  const [showHint, setShowHint] = useState(onOperatorScreen);
  const closeOutput = () => {
    if (isTauri()) {
      import('@tauri-apps/api/core').then(({ invoke }) => invoke('close_output_window', { label: `projector-${outputId}` })).catch(() => {});
    } else {
      window.close();
    }
  };
  // Esc always closes an output window (only the operator's keyboard can reach it)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeOutput(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [outputId]);
  useEffect(() => {
    if (!onOperatorScreen) return;
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    lockedRef.current = !!liveState.lockedOutputs?.[outputId];
  }, [liveState.lockedOutputs, outputId]);

  // Projector windows are separate pages: populate the template cache so style/custom templates resolve here.
  const [, setTemplatesVersion] = useState(0);
  useEffect(() => {
    getStoredTemplates().then(() => setTemplatesVersion(v => v + 1));
  }, [liveState.settings, liveState.slide]);
  useEffect(() => subscribeTemplates(() => setTemplatesVersion(v => v + 1)), []);
  // Fonts installed from template packages are needed on the screens too
  useEffect(() => { void loadInstalledFonts(); }, []);

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

  useEffect(() => { setSharedTimer(liveState.timer); }, [liveState.timer]);
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
    <div
      className={`w-screen h-screen bg-transparent flex flex-col items-center justify-center overflow-hidden relative select-none ${onOperatorScreen ? 'cursor-pointer' : 'cursor-none'}`}
      onClick={onOperatorScreen ? closeOutput : undefined}
      data-output-page
    >
      {onOperatorScreen && (showHint || !liveState.isPresenting) && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-black/80 border border-white/20 text-center shadow-2xl pointer-events-none" data-output-hint>
          <div className="text-white text-base font-semibold">Press Esc or click to close {outputConfig?.name || 'this output'}</div>
          {!liveState.isPresenting && <div className="text-neutral-400 text-sm mt-1">Nothing is being presented yet: in FlowShow, click the Presenting button (top right) and pick a slide.</div>}
        </div>
      )}
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
              overlays={isLocked ? (frozenState?.overlays || []) : overlaysFor(liveState.settings?.overlays, liveState.overlays, outputId)}
              mix={isLocked ? frozenState?.mix : liveState.mix}
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