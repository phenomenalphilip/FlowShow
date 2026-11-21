/**
 * FlowShow's shared model: the types (slides, shows, outputs, styles, settings, live state), the defaults, and the
 * rules that decide how a slide looks on each screen (templates, styles, backgrounds). No screens or panels here.
 */
import { type DesignMedia } from './designMedia';
import { type Overlay } from './overlays';
import { type LiveInput } from './liveInputs';
import { type ScreenBorder, type LiveMix, type ShowMix, type SavedMix } from './mix';
import React from 'react';
import type { SlidePage } from './pages';
import { LiveTimer, TimerPreset } from './timers';
import { AppThemeId } from './themes';
import { AnimationConfig, PresentationTemplate, FALLBACK_ANIMATION, TextPosition } from './templates';
import { DEFAULT_LYRICS_STAGE_LAYOUT, DEFAULT_SCRIPTURE_STAGE_LAYOUT, StageLayout } from './stageLayouts';
import { getTemplateById, DEFAULT_SCRIPTURE_TEMPLATE_ID, DEFAULT_DECLARATION_TEMPLATE_ID } from './templates';

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
  /** A page of an imported PDF or PowerPoint: the slide is this picture (shown as it looks in the file) */
  page?: SlidePage;
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

export const DEFAULT_SETTINGS: GlobalSettings = {
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

export const CHANNEL_NAME = 'flowshow_presence_channel';

// Undo: changes closer together than this count as one step; keep this many steps
export const UNDO_MERGE_MS = 500;
export const UNDO_LIMIT = 100;



export type SongTemplateRefs = { id?: string; templateId?: string; outputTemplates?: { [outputId: string]: string } };
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

export type ResolvedLook = { styleOverrides: SlideDefinition['styleOverrides']; animation?: AnimationConfig };
export type WordStyles = { [wordIndex: number]: React.CSSProperties };

export const resolveCustomBoxAnimation = (box: CustomTextBox): AnimationConfig | undefined =>
  box.animation ? { ...FALLBACK_ANIMATION, ...box.animation } as AnimationConfig : undefined;

export const mergeWordStyles = (base: WordStyles | undefined, extra: WordStyles | undefined): WordStyles | undefined => {
  if (!extra) return base;
  const merged: WordStyles = { ...(base || {}) };
  for (const [key, style] of Object.entries(extra)) merged[Number(key)] = { ...(merged[Number(key)] || {}), ...style };
  return merged;
};

export const applySlideDesign = (base: ResolvedLook, design?: SlideDesign): ResolvedLook => {
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

export const resolveBaseLook = (
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
export const linkSlideToTemplate = (s: SlideDefinition, templateId: string): SlideDefinition => ({
  ...s,
  templateId,
  animation: undefined,
  styleOverrides: s.styleOverrides?.words ? { words: s.styleOverrides.words } : undefined
});

/** A design with nothing in it is dropped, so the slide shows its template */
export const hasDesignContent = (d: SlideDesign | undefined): d is SlideDesign => !!d && (
  !!d.layout || !!d.hideLyrics || !!d.verticalAlign || (d.customBoxes?.length ?? 0) > 0 || (d.media?.length ?? 0) > 0 ||
  Object.keys(d.global || {}).length > 0 || Object.keys(d.animation || {}).length > 0 ||
  Object.keys(d.words || {}).length > 0
);

/** A slide design without the parts a template sets (font, size, colours, position, motion); word styles and text boxes stay */
export const withoutOwnLook = (d: SlideDesign): SlideDesign => ({ ...d, global: undefined, layout: undefined, animation: undefined, verticalAlign: undefined });

/** The slide with its waiting text boxes put on the screens (the same slide object when none are waiting) */
export const releaseWaitingBoxes = (slide: SlideDefinition): SlideDefinition => {
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

export type RawBackground = { url?: string; color?: string; type: 'image' | 'video' | 'color' | 'ndi' | 'input' | 'none'; fileName?: string; input?: LiveInput; playback?: boolean } | null | undefined;

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

export const applyGlobalStyles = (
  slide: SlideDefinition | null,
  outputConfig?: OutputSettings,
  settings?: GlobalSettings
): SlideDefinition['styleOverrides'] => {
  const presStyle = getStyleForOutput(outputConfig, settings);
  return resolveSlideForOutput(slide, outputConfig, undefined, presStyle).styleOverrides;
};

/** Saved settings with FlowShow's defaults filled in (new default outputs and styles added) */
export const normaliseSettings = (val: any): GlobalSettings => {

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



/** The look given to a whole song section; slides tagged with the group later pick it up too */
export interface GroupLook {
  templateId?: string;
  outputTemplates?: { [outputId: string]: string };
  designs?: { [outputId: string]: SlideDesign };
}

export interface PresentationItem {
  id: string;
  title: string;
  /** A Song, a Declaration, or a Presentation (an imported PDF or PowerPoint: its slides are pictures) */
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

export const MOCK_SONGS: PresentationItem[] = [
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
