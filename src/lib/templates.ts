import React from 'react';
import { get, set } from 'idb-keyval';

export type AnimationType = 
  | 'blur-in' 
  | 'kinetic-punch' 
  | 'mask-slide' 
  | 'golden-shimmer' 
  | 'lead-tracker' 
  | 'editorial-split' 
  | 'neon-pulse' 
  | 'acoustic-dissolve' 
  | 'opposing-drift' 
  | 'rhythm-typewriter'
  | 'vertical-scroll'
  | 'word-stack'
  | 'flicker'
  | 'bounce';

export interface AnimationConfig {
  type: AnimationType;
  duration: number; // in seconds
  stagger?: number; // delay between words/lines
  easing?: 'easeOut' | 'backOut' | 'easeInOut' | 'spring' | 'linear';
  ambientLoop?: 'breathe' | 'drift' | 'none';
  /** Flicker / Bounce: keep flickering or bouncing after the words have appeared */
  effectLoop?: boolean;
  /** @deprecated offset from layout centre; superseded by scrollStartPos/scrollEndPos */
  scrollStart?: number;
  /** @deprecated offset from layout centre; superseded by scrollStartPos/scrollEndPos */
  scrollEnd?: number;
  /** Screen position of the text's centre where scrolling starts, % of screen height (0 = top edge, 100 = bottom edge) */
  scrollStartPos?: number;
  /** Screen position of the text's centre where scrolling stops, % of screen height (0 = top edge, 100 = bottom edge) */
  scrollEndPos?: number;
  scrollLoop?: boolean; // whether to loop continuously
}

/** Used when a slide or text box picks a motion but nothing underneath it has one */
export const FALLBACK_ANIMATION: AnimationConfig = { type: 'blur-in', duration: 0.6, stagger: 0.06, easing: 'easeOut', ambientLoop: 'none' };

export const SCROLL_POS_MIN = -100;
export const SCROLL_POS_MAX = 200;

/** Absolute start/stop screen positions, converting legacy offsets (relative to screen centre). */
export function getScrollPositions(anim?: AnimationConfig): { start: number; end: number } {
  return {
    start: anim?.scrollStartPos ?? 50 + (anim?.scrollStart ?? 100),
    end: anim?.scrollEndPos ?? 50 + (anim?.scrollEnd ?? -100),
  };
}

export interface PresentationTemplate {
  id: string;
  name: string;
  category: 'worship' | 'high-energy' | 'broadcast' | 'scripture' | 'modern' | 'custom';
  tagline: string;
  description: string;
  styles: {
    global?: React.CSSProperties;
    lines?: { [lineIdx: number]: React.CSSProperties };
    layout?: { x: number; y: number; width: number; height: number };
    sourceGlobal?: React.CSSProperties;
    sourceLayout?: { x: number; y: number; width: number; height: number };
  };
  animation: AnimationConfig;
  backgroundPreview?: string;
  badge?: string;
  isCustom?: boolean;
}

export const STARTER_TEMPLATES: PresentationTemplate[] = [
  {
    id: 'cinematic-ambient',
    name: 'Cinematic Ambient',
    category: 'worship',
    tagline: 'Soft bloom & atmospheric float',
    description: 'Words bloom in with gentle depth-of-field blur and a continuous slow floating motion. Ideal for intimate worship ballads.',
    badge: 'Popular',
    styles: {
      global: {
        fontFamily: 'Inter, sans-serif',
        fontWeight: '600',
        color: '#f8fafc',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        textShadow: '0 10px 30px rgba(0,0,0,0.9), 0 0 20px rgba(255,255,255,0.15)',
        textAlign: 'center'
      },
      layout: { x: 0.08, y: 0.15, width: 0.84, height: 0.7 }
    },
    animation: {
      type: 'blur-in',
      duration: 0.8,
      stagger: 0.05,
      easing: 'easeOut',
      ambientLoop: 'drift'
    },
    backgroundPreview: 'radial-gradient(ellipse at center, #1e1b4b 0%, #030712 100%)'
  },
  {
    id: 'bold-declaration',
    name: 'Bold Declaration',
    category: 'high-energy',
    tagline: 'High impact kinetic punch',
    description: 'Heavy condensed typography slamming into view with energetic spring physics and word-stagger. Perfect for fast praise and youth services.',
    badge: 'High Impact',
    styles: {
      global: {
        fontFamily: 'Space Grotesk, sans-serif',
        fontWeight: '900',
        color: '#ffffff',
        letterSpacing: '-0.02em',
        textTransform: 'uppercase',
        textShadow: '0 8px 0px rgba(0,0,0,1), 0 20px 40px rgba(0,0,0,0.8)',
        textAlign: 'center'
      },
      layout: { x: 0.05, y: 0.1, width: 0.9, height: 0.8 }
    },
    animation: {
      type: 'kinetic-punch',
      duration: 0.35,
      stagger: 0.03,
      easing: 'spring',
      ambientLoop: 'none'
    },
    backgroundPreview: 'linear-gradient(135deg, #09090b 0%, #18181b 50%, #27272a 100%)'
  },
  {
    id: 'broadcast-lower-third',
    name: 'Broadcast Lower-Third',
    category: 'broadcast',
    tagline: 'Clean livestream & ATEM overlay',
    description: 'Anchored at the bottom 25% of the frame with a crisp accent bar and smooth sliding reveal. Designed for multi-camera streams.',
    badge: 'Livestream',
    styles: {
      global: {
        fontFamily: 'Inter, sans-serif',
        fontWeight: '700',
        color: '#ffffff',
        letterSpacing: '0.01em',
        textAlign: 'left',
        textShadow: '0 2px 8px rgba(0,0,0,0.9)',
        backgroundColor: 'rgba(0,0,0,0.65)',
        padding: '16px 28px',
        borderRadius: '12px',
        borderLeft: '6px solid #3b82f6'
      },
      layout: { x: 0.08, y: 0.72, width: 0.84, height: 0.22 }
    },
    animation: {
      type: 'mask-slide',
      duration: 0.5,
      stagger: 0.08,
      easing: 'easeOut',
      ambientLoop: 'none'
    },
    backgroundPreview: 'transparent'
  },
  {
    id: 'divine-scripture',
    name: 'Divine Scripture & Gold',
    category: 'scripture',
    tagline: 'Regal serif with warm golden aura',
    description: 'Timeless serif typography paired with warm gold accents and gentle shimmer bloom. Made for Scripture readings and sermons.',
    badge: 'Scripture',
    styles: {
      global: {
        fontFamily: 'Playfair Display, serif',
        fontWeight: '600',
        color: '#fef08a',
        letterSpacing: '0.01em',
        textAlign: 'center',
        textShadow: '0 4px 20px rgba(234,179,8,0.3), 0 8px 24px rgba(0,0,0,0.9)'
      },
      lines: {
        0: { fontStyle: 'italic', color: '#ffffff' }
      },
      sourceGlobal: {
        fontFamily: 'Inter, sans-serif',
        fontWeight: '800',
        color: '#fbbf24',
        letterSpacing: '0.15em',
        textTransform: 'uppercase'
      },
      layout: { x: 0.1, y: 0.15, width: 0.8, height: 0.6 },
      sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.12 }
    },
    animation: {
      type: 'golden-shimmer',
      duration: 0.9,
      stagger: 0.06,
      easing: 'easeInOut',
      ambientLoop: 'breathe'
    },
    backgroundPreview: 'radial-gradient(circle at center, #1c1917 0%, #0c0a09 100%)'
  },
  {
    id: 'lead-tracker',
    name: 'Lead Karaoke Tracker',
    category: 'worship',
    tagline: 'Congregational focus tracker',
    description: 'Current line or phrase glows at 100% white while surrounding lines sit at subtle 35% opacity. Keeps congregation in sync.',
    styles: {
      global: {
        fontFamily: 'Outfit, sans-serif',
        fontWeight: '700',
        color: '#ffffff',
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        textAlign: 'center'
      },
      layout: { x: 0.08, y: 0.15, width: 0.84, height: 0.7 }
    },
    animation: {
      type: 'lead-tracker',
      duration: 0.45,
      stagger: 0.1,
      easing: 'easeOut',
      ambientLoop: 'none'
    },
    backgroundPreview: 'linear-gradient(180deg, #09090b 0%, #1e1b4b 100%)'
  },
  {
    id: 'editorial-split',
    name: 'Editorial Split Hierarchy',
    category: 'modern',
    tagline: 'Magazine-grade headline contrast',
    description: 'First line is elegant light italic, second line is MASSIVE ultra-bold hero declaration with staggered reveal. The signature ProPresenter-killer look.',
    badge: 'Pro Look',
    styles: {
      global: {
        fontFamily: 'Space Grotesk, sans-serif',
        textAlign: 'center',
        textTransform: 'uppercase'
      },
      lines: {
        0: {
          fontFamily: 'Playfair Display, serif',
          fontWeight: '400',
          fontStyle: 'italic',
          color: '#94a3b8',
          letterSpacing: '0.08em',
          fontSize: '0.65em'
        },
        1: {
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: '900',
          color: '#ffffff',
          letterSpacing: '-0.02em',
          fontSize: '1.25em',
          textShadow: '0 0 35px rgba(59,130,246,0.4), 0 10px 20px rgba(0,0,0,0.9)'
        }
      },
      layout: { x: 0.05, y: 0.12, width: 0.9, height: 0.76 }
    },
    animation: {
      type: 'editorial-split',
      duration: 0.6,
      stagger: 0.15,
      easing: 'spring',
      ambientLoop: 'none'
    },
    backgroundPreview: 'radial-gradient(circle at bottom, #0f172a 0%, #020617 100%)'
  },
  {
    id: 'neon-pulse',
    name: 'Neon Horizon',
    category: 'high-energy',
    tagline: 'Vibrant dual-tone gradient & glow pulse',
    description: 'Cyan-to-violet gradient text with continuous gentle breathing glow. Built for modern LED video walls and dynamic stages.',
    styles: {
      global: {
        fontFamily: 'Outfit, sans-serif',
        fontWeight: '800',
        color: '#38bdf8',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        textAlign: 'center',
        textShadow: '0 0 25px rgba(56,189,248,0.6), 0 0 50px rgba(168,85,247,0.3)'
      },
      layout: { x: 0.06, y: 0.15, width: 0.88, height: 0.7 }
    },
    animation: {
      type: 'neon-pulse',
      duration: 0.5,
      stagger: 0.04,
      easing: 'easeOut',
      ambientLoop: 'breathe'
    },
    backgroundPreview: 'radial-gradient(circle at center, #1e1b4b 0%, #030712 100%)'
  },
  {
    id: 'acoustic-dissolve',
    name: 'Acoustic Blur-Dissolve',
    category: 'worship',
    tagline: 'Warm acoustic depth-of-field bloom',
    description: 'Soft off-white lettering blooming gently out of a soft lens blur with warm undertones. Made for acoustic, stripped-back sets.',
    styles: {
      global: {
        fontFamily: 'Inter, sans-serif',
        fontWeight: '500',
        color: '#f5f5f4',
        letterSpacing: '0.06em',
        textAlign: 'center',
        textShadow: '0 4px 15px rgba(0,0,0,0.8)'
      },
      layout: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 }
    },
    animation: {
      type: 'acoustic-dissolve',
      duration: 0.9,
      stagger: 0.08,
      easing: 'easeInOut',
      ambientLoop: 'none'
    },
    backgroundPreview: 'linear-gradient(180deg, #1c1917 0%, #0c0a09 100%)'
  },
  {
    id: 'opposing-drift',
    name: 'Opposing Kinetic Drift',
    category: 'modern',
    tagline: 'Dual-direction sliding dynamics',
    description: 'Odd lines glide in from the left and even lines glide in from the right with smooth deceleration and inertia settling.',
    styles: {
      global: {
        fontFamily: 'Space Grotesk, sans-serif',
        fontWeight: '700',
        color: '#ffffff',
        letterSpacing: '0.02em',
        textAlign: 'center',
        textTransform: 'uppercase'
      },
      layout: { x: 0.05, y: 0.15, width: 0.9, height: 0.7 }
    },
    animation: {
      type: 'opposing-drift',
      duration: 0.55,
      stagger: 0.1,
      easing: 'easeOut',
      ambientLoop: 'none'
    },
    backgroundPreview: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)'
  },
  {
    id: 'rhythm-typewriter',
    name: 'Rhythm Typewriter',
    category: 'modern',
    tagline: 'Cadenced word-by-word reveal',
    description: 'Clean monospace terminal aesthetic where words drop into place with precise musical cadence. Great for spoken word & rap praise.',
    styles: {
      global: {
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: '600',
        color: '#e2e8f0',
        letterSpacing: '0.02em',
        textAlign: 'center',
        textShadow: '0 2px 10px rgba(0,0,0,0.9)'
      },
      layout: { x: 0.08, y: 0.18, width: 0.84, height: 0.64 }
    },
    animation: {
      type: 'rhythm-typewriter',
      duration: 0.3,
      stagger: 0.08,
      easing: 'easeOut',
      ambientLoop: 'none'
    },
    backgroundPreview: 'linear-gradient(180deg, #09090b 0%, #18181b 100%)'
  },
  {
    id: 'word-stack-pop',
    name: 'Word Stack Pop',
    category: 'modern',
    tagline: 'Words stack and pop in one by one',
    description: 'Each word sits on its own line and pops in after the one before it, building the phrase vertically. Set the speed with "Time between words" and drag the stack to any side of the screen.',
    styles: {
      global: {
        fontFamily: 'Bebas Neue, sans-serif',
        fontWeight: '400',
        fontSize: '150px',
        color: '#ffffff',
        letterSpacing: '0.03em',
        lineHeight: '1',
        textTransform: 'uppercase',
        textAlign: 'left',
        textShadow: '0 8px 24px rgba(0,0,0,0.85)'
      },
      layout: { x: 0.06, y: 0.06, width: 0.4, height: 0.88 }
    },
    animation: {
      type: 'word-stack',
      duration: 0.35,
      stagger: 0.35,
      easing: 'backOut',
      ambientLoop: 'none'
    },
    backgroundPreview: 'radial-gradient(ellipse at left, #1e1b4b 0%, #030712 100%)'
  },
  {
    id: 'vertical-scroll-marquee',
    name: 'Vertical Teleprompter & Roll',
    category: 'worship',
    tagline: 'Smooth large-text vertical scroll',
    description: 'Continuous vertical rolling text from bottom to top with customizable start/stop positions and speed. Ideal for multi-stanza hymns, readings, and teleprompting.',
    badge: 'Marquee',
    styles: {
      global: {
        fontFamily: 'Inter, sans-serif',
        fontWeight: '800',
        fontSize: '44px',
        color: '#ffffff',
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        textAlign: 'center',
        textShadow: '0 8px 24px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.8)',
        lineHeight: 1.45
      },
      layout: { x: 0.08, y: 0.05, width: 0.84, height: 0.9 }
    },
    animation: {
      type: 'vertical-scroll',
      duration: 14,
      easing: 'linear',
      scrollStartPos: 150,
      scrollEndPos: -50,
      scrollLoop: true,
      ambientLoop: 'none'
    },
    backgroundPreview: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)'
  }
];

const CUSTOM_TEMPLATES_KEY = 'flowshow_custom_templates';
const TEMPLATE_OVERRIDES_KEY = 'flowshow_template_overrides';

let templateMemoryCache: PresentationTemplate[] = [...STARTER_TEMPLATES];

// ─── Template sync between windows ────────────────────────────────────────────
// Every window (control panel + projectors) keeps saved template changes in memory and
// shares them over a BroadcastChannel, so they reach the screens without a reload.
const TEMPLATE_CHANNEL = 'flowshow_template_channel';
const liveEdits: Record<string, PresentationTemplate> = {};
const deletedIds = new Set<string>();
const listeners = new Set<() => void>();

const templateChannel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(TEMPLATE_CHANNEL) : null;

const notifyTemplateListeners = () => listeners.forEach(fn => fn());

function putInCache(t: PresentationTemplate) {
  liveEdits[t.id] = t;
  deletedIds.delete(t.id);
  const idx = templateMemoryCache.findIndex(x => x.id === t.id);
  templateMemoryCache = idx >= 0
    ? templateMemoryCache.map(x => x.id === t.id ? t : x)
    : [...templateMemoryCache, t];
}

function removeFromCache(id: string) {
  delete liveEdits[id];
  deletedIds.add(id);
  templateMemoryCache = templateMemoryCache.filter(t => t.id !== id || STARTER_TEMPLATES.some(s => s.id === id));
  const starter = STARTER_TEMPLATES.find(s => s.id === id);
  if (starter) templateMemoryCache = templateMemoryCache.map(t => t.id === id ? starter : t);
}

if (templateChannel) {
  templateChannel.onmessage = (e) => {
    if (e.data?.type === 'TEMPLATE_UPDATED' && e.data.template) {
      putInCache(e.data.template);
      notifyTemplateListeners();
    } else if (e.data?.type === 'TEMPLATE_DELETED' && e.data.id) {
      removeFromCache(e.data.id);
      notifyTemplateListeners();
    }
  };
}

/** Re-render hook source: called whenever any template changes in this or another window. */
export function subscribeTemplates(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getCachedTemplates(): PresentationTemplate[] {
  return templateMemoryCache;
}

export async function getStoredTemplates(): Promise<PresentationTemplate[]> {
  try {
    const overrides = ((await get(TEMPLATE_OVERRIDES_KEY)) as Record<string, PresentationTemplate>) || {};
    const customList = ((await get(CUSTOM_TEMPLATES_KEY)) as PresentationTemplate[]) || [];

    const baseMerged = STARTER_TEMPLATES.map(t => overrides[t.id] ? { ...t, ...overrides[t.id] } : t);
    // Live edits not yet persisted (or received from another window) win over storage
    const merged = [...baseMerged, ...customList.filter(t => !deletedIds.has(t.id))].map(t => liveEdits[t.id] || t);
    const extraLive = Object.values(liveEdits).filter(t => !merged.some(m => m.id === t.id));
    templateMemoryCache = [...merged, ...extraLive];
    return templateMemoryCache;
  } catch (err) {
    console.warn('Failed to load templates from IndexedDB, falling back to starters', err);
    return STARTER_TEMPLATES;
  }
}

export async function saveTemplate(template: PresentationTemplate): Promise<PresentationTemplate[]> {
  putInCache(template);
  notifyTemplateListeners();
  templateChannel?.postMessage({ type: 'TEMPLATE_UPDATED', template });
  await persistTemplate(template);
  return await getStoredTemplates();
}

async function persistTemplate(template: PresentationTemplate): Promise<void> {
  const isStarter = STARTER_TEMPLATES.some(t => t.id === template.id);
  if (isStarter) {
    const overrides = ((await get(TEMPLATE_OVERRIDES_KEY)) as Record<string, PresentationTemplate>) || {};
    overrides[template.id] = template;
    await set(TEMPLATE_OVERRIDES_KEY, overrides);
  } else {
    const customList = ((await get(CUSTOM_TEMPLATES_KEY)) as PresentationTemplate[]) || [];
    const existingIdx = customList.findIndex(t => t.id === template.id);
    if (existingIdx >= 0) {
      customList[existingIdx] = { ...template, isCustom: true };
    } else {
      customList.push({ ...template, isCustom: true });
    }
    await set(CUSTOM_TEMPLATES_KEY, customList);
  }
}

export async function deleteTemplate(templateId: string): Promise<PresentationTemplate[]> {
  removeFromCache(templateId);
  notifyTemplateListeners();
  templateChannel?.postMessage({ type: 'TEMPLATE_DELETED', id: templateId });
  const isStarter = STARTER_TEMPLATES.some(t => t.id === templateId);
  if (isStarter) {
    const overrides = ((await get(TEMPLATE_OVERRIDES_KEY)) as Record<string, PresentationTemplate>) || {};
    delete overrides[templateId];
    await set(TEMPLATE_OVERRIDES_KEY, overrides);
  } else {
    const customList = ((await get(CUSTOM_TEMPLATES_KEY)) as PresentationTemplate[]) || [];
    const filtered = customList.filter(t => t.id !== templateId);
    await set(CUSTOM_TEMPLATES_KEY, filtered);
  }
  return await getStoredTemplates();
}

export function getTemplateById(id: string): PresentationTemplate | undefined {
  return templateMemoryCache.find(t => t.id === id) || STARTER_TEMPLATES.find(t => t.id === id);
}
