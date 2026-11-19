import type React from 'react';

/**
 * Stage layouts: what a stage screen (facing the people on stage) shows. Unlike audience templates they
 * can show what comes next, the section name and the time, in plain text that appears all at once.
 * A Stage style picks one layout for lyrics and one for scripture.
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
}

export interface StageLayout {
  id: string;
  name: string;
  description: string;
  items: StageItem[];
}

export const DEFAULT_LYRICS_STAGE_LAYOUT = 'stage-lyrics';
export const DEFAULT_SCRIPTURE_STAGE_LAYOUT = 'stage-scripture';

const CLOCK: StageItem = {
  id: 'clock', kind: 'clock', rect: { x: 0.67, y: 0.03, width: 0.3, height: 0.07 },
  style: { fontSize: '46px', fontWeight: 700, color: '#d4d4d8', textAlign: 'right' },
};

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

export const getStageLayout = (id: string | undefined) => STAGE_LAYOUTS.find(l => l.id === id);

/** The layout a stage style uses for this slide; the ready-made ones when the style has none */
export const stageLayoutFor = (
  style: { lyricsStageLayoutId?: string; scriptureStageLayoutId?: string } | undefined,
  slide: { type?: string } | null | undefined,
): StageLayout => {
  const scripture = slide?.type === 'scripture';
  return getStageLayout(scripture ? style?.scriptureStageLayoutId : style?.lyricsStageLayoutId)
    || getStageLayout(scripture ? DEFAULT_SCRIPTURE_STAGE_LAYOUT : DEFAULT_LYRICS_STAGE_LAYOUT)!;
};
