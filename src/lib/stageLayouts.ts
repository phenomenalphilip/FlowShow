import type { TextPosition } from './templates';
import type React from 'react';
import type { SlideDefinition } from '../App';

/**
 * Stage layouts: what a stage screen (facing the people on stage) shows. Unlike audience templates they
 * can show what comes next, the section name and the time, in plain text that appears all at once.
 * A Stage style picks one layout for lyrics and one for scripture. Ready-made layouts live here;
 * layouts people design are kept in the settings (GlobalSettings.stageLayouts).
 */

/** Position and size as fractions of the 1920×1080 screen */
export type StageRect = { x: number; y: number; width: number; height: number };

export type StageItemKind =
  /** The words on the screen now */
  | 'current-slide'
  /** The words that come next */
  | 'next-slide'
  /** The slide's group (Verse 1, Chorus…), or else the song title */
  | 'section'
  | 'song-title'
  /** A Bible slide's reference (John 3:16) */
  | 'reference'
  | 'clock'
  /** Fixed text */
  | 'text';

export interface StageItem {
  id: string;
  kind: StageItemKind;
  rect: StageRect;
  style?: React.CSSProperties;
  /** 'text': what it says. 'next-slide': the label above it */
  text?: string;
  /** Where the words sit in the box when they don't fill it (default: middle) */
  verticalAlign?: TextPosition;
}

export interface StageLayout {
  id: string;
  name: string;
  description?: string;
  items: StageItem[];
}

/** What each kind of item is called, and how a new one starts out */
export const STAGE_ITEM_KINDS: Record<StageItemKind, { label: string; hint: string; start: Omit<StageItem, 'id' | 'kind'> }> = {
  'current-slide': {
    label: 'Current slide', hint: 'The words on the screen now',
    start: { rect: { x: 0.08, y: 0.2, width: 0.84, height: 0.5 }, style: { fontSize: '110px', color: '#ffffff', textAlign: 'center' } },
  },
  'next-slide': {
    label: 'Next slide', hint: 'The words coming next',
    start: { text: 'Next', rect: { x: 0.08, y: 0.72, width: 0.84, height: 0.22 }, style: { fontSize: '60px', color: '#fde68a', textAlign: 'center' } },
  },
  section: {
    label: 'Section name', hint: 'Verse 1, Chorus… (or the song title)',
    start: { rect: { x: 0.04, y: 0.04, width: 0.5, height: 0.07 }, style: { fontSize: '46px', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.08em' } },
  },
  'song-title': {
    label: 'Song title', hint: "The song's title",
    start: { rect: { x: 0.04, y: 0.04, width: 0.5, height: 0.07 }, style: { fontSize: '46px', fontWeight: 700, color: '#a5b4fc' } },
  },
  reference: {
    label: 'Bible reference', hint: 'John 3:16, on scripture slides',
    start: { rect: { x: 0.04, y: 0.04, width: 0.5, height: 0.08 }, style: { fontSize: '54px', fontWeight: 800, color: '#fbbf24' } },
  },
  clock: {
    label: 'Clock', hint: 'The time',
    start: { rect: { x: 0.7, y: 0.04, width: 0.26, height: 0.07 }, style: { fontSize: '46px', fontWeight: 700, color: '#d4d4d8', textAlign: 'right' } },
  },
  text: {
    label: 'Text', hint: 'Your own words',
    start: { text: 'Your text', rect: { x: 0.3, y: 0.45, width: 0.4, height: 0.1 }, style: { fontSize: '60px', color: '#ffffff', textAlign: 'center' } },
  },
};

export const DEFAULT_LYRICS_STAGE_LAYOUT = 'stage-lyrics';
export const DEFAULT_SCRIPTURE_STAGE_LAYOUT = 'stage-scripture';
export const DEFAULT_DECLARATION_STAGE_LAYOUT = 'stage-declaration';

const CLOCK: StageItem = {
  id: 'clock', kind: 'clock', rect: { x: 0.67, y: 0.03, width: 0.3, height: 0.07 },
  style: { fontSize: '46px', fontWeight: 700, color: '#d4d4d8', textAlign: 'right' },
};

/** Ready-made layouts (they can't be changed; editing one makes your own copy) */
export const STAGE_LAYOUTS: StageLayout[] = [
  {
    id: DEFAULT_LYRICS_STAGE_LAYOUT,
    name: 'Lyrics: now and next',
    description: 'Section name and time on top, the current slide large, the next slide below.',
    items: [
      { id: 'section', kind: 'section', rect: { x: 0.03, y: 0.03, width: 0.6, height: 0.07 }, style: { fontSize: '46px', fontWeight: 800, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.08em' } },
      CLOCK,
      { id: 'current', kind: 'current-slide', rect: { x: 0.03, y: 0.12, width: 0.94, height: 0.58 }, style: { fontSize: '120px', color: '#ffffff', textAlign: 'center' } },
      { id: 'next', kind: 'next-slide', text: 'Next', rect: { x: 0.03, y: 0.73, width: 0.94, height: 0.24 }, style: { fontSize: '64px', color: '#fde68a', textAlign: 'center' } },
    ],
  },
  {
    id: DEFAULT_DECLARATION_STAGE_LAYOUT,
    name: 'Declaration: now and next',
    description: 'The title and time on top, the current words of the declaration large, the next words below.',
    items: [
      { id: 'title', kind: 'song-title', rect: { x: 0.03, y: 0.03, width: 0.6, height: 0.07 }, style: { fontSize: '46px', fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em' } },
      CLOCK,
      { id: 'current', kind: 'current-slide', rect: { x: 0.03, y: 0.12, width: 0.94, height: 0.6 }, style: { fontSize: '110px', fontWeight: 700, color: '#ffffff', textAlign: 'center' } },
      { id: 'next', kind: 'next-slide', text: 'Next', rect: { x: 0.03, y: 0.75, width: 0.94, height: 0.22 }, style: { fontSize: '60px', color: '#c4b5fd', textAlign: 'center' } },
    ],
  },
  {
    id: DEFAULT_SCRIPTURE_STAGE_LAYOUT,
    name: 'Scripture: verse and next',
    description: 'The reference and time on top, the verse large, the next verse below.',
    items: [
      { id: 'reference', kind: 'reference', rect: { x: 0.03, y: 0.03, width: 0.64, height: 0.08 }, style: { fontSize: '54px', fontWeight: 800, color: '#fbbf24' } },
      CLOCK,
      { id: 'current', kind: 'current-slide', rect: { x: 0.03, y: 0.13, width: 0.94, height: 0.6 }, style: { fontSize: '86px', fontWeight: 600, color: '#ffffff', textAlign: 'left' } },
      { id: 'next', kind: 'next-slide', text: 'Next verse', rect: { x: 0.03, y: 0.76, width: 0.94, height: 0.21 }, style: { fontSize: '48px', color: '#a1a1aa', textAlign: 'left' } },
    ],
  },
  {
    id: 'stage-current',
    name: 'Current slide only',
    description: 'Just the current slide, as large as it fits.',
    items: [
      { id: 'current', kind: 'current-slide', rect: { x: 0.04, y: 0.05, width: 0.92, height: 0.9 }, style: { fontSize: '140px', color: '#ffffff', textAlign: 'center' } },
    ],
  },
];

const BUILT_IN_IDS = new Set(STAGE_LAYOUTS.map(l => l.id));
export const isReadyMadeStageLayout = (id: string) => BUILT_IN_IDS.has(id);

/** Ready-made layouts followed by the ones people made */
export const allStageLayouts = (custom: StageLayout[] = []) => [...STAGE_LAYOUTS, ...custom];

export const getStageLayout = (id: string | undefined, custom: StageLayout[] = []) =>
  id ? allStageLayouts(custom).find(l => l.id === id) : undefined;

/** The layout a stage style uses for this slide; the ready-made ones when the style has none (or it was deleted) */
export const stageLayoutFor = (
  style: { lyricsStageLayoutId?: string; scriptureStageLayoutId?: string; declarationStageLayoutId?: string } | undefined,
  slide: { type?: string; declaration?: boolean } | null | undefined,
  custom: StageLayout[] = [],
): StageLayout => {
  const scripture = slide?.type === 'scripture';
  // Declarations have a layout of their own (never the lyrics one), so the two can be designed apart
  if (slide?.declaration && !scripture) {
    return getStageLayout(style?.declarationStageLayoutId, custom) || getStageLayout(DEFAULT_DECLARATION_STAGE_LAYOUT)!;
  }
  return getStageLayout(scripture ? style?.scriptureStageLayoutId : style?.lyricsStageLayoutId, custom)
    || getStageLayout(scripture ? DEFAULT_SCRIPTURE_STAGE_LAYOUT : DEFAULT_LYRICS_STAGE_LAYOUT)!;
};

/** The three kinds of slides a stage style has a layout for */
export type StageSlot = 'lyrics' | 'declaration' | 'scripture';
export const STAGE_SLOT_FIELD: Record<StageSlot, 'lyricsStageLayoutId' | 'declarationStageLayoutId' | 'scriptureStageLayoutId'> = {
  lyrics: 'lyricsStageLayoutId', declaration: 'declarationStageLayoutId', scripture: 'scriptureStageLayoutId',
};
/** A slide of this kind, for choosing its layout */
export const stageSlotSlide = (slot: StageSlot) => slot === 'scripture' ? { type: 'scripture' } : { type: 'lyrics', declaration: slot === 'declaration' };
export const STAGE_SLOT_LABEL: Record<StageSlot, { title: string; noun: string }> = {
  lyrics: { title: 'Lyrics / Songs', noun: 'song' },
  declaration: { title: 'Declarations', noun: 'declaration' },
  scripture: { title: 'Scripture', noun: 'scripture' },
};

/** Sample slides for previews and for designing when nothing of that kind is live */
export const STAGE_SAMPLES: Record<'lyrics' | 'declaration' | 'scripture', { slide: SlideDefinition; next: SlideDefinition; songTitle?: string }> = {
  declaration: {
    slide: { id: 'sample-5', type: 'lyrics', declaration: true, text: 'I am the righteousness of God\nIn Christ Jesus' },
    next: { id: 'sample-6', type: 'lyrics', declaration: true, text: 'No weapon formed against me\nShall prosper' },
    songTitle: 'Our Confession',
  },
  lyrics: {
    slide: { id: 'sample-1', type: 'lyrics', group: 'Verse 1', text: 'Amazing grace, how sweet the sound\nThat saved a wretch like me' },
    next: { id: 'sample-2', type: 'lyrics', group: 'Chorus', text: 'My chains are gone\nI\'ve been set free' },
    songTitle: 'Amazing Grace',
  },
  scripture: {
    slide: { id: 'sample-3', type: 'scripture', source: 'John 3:16', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
    next: { id: 'sample-4', type: 'scripture', source: 'John 3:17', text: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.' },
  },
};
