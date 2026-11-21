/**
 * Lists shared by the design tools (Design mode, the Template editor, Overlays, Stage): motions, layouts, shadows,
 * fonts, and the scroll marker drawn on previews. Kept apart from the Template editor so that loads only when opened.
 */
import React from 'react';
import type { AnimationType, AnimationConfig } from './templates';
import { FONT_OPTIONS } from './fonts';
export { FONT_OPTIONS };

export const MOTION_PRESETS: { type: AnimationType; label: string; desc: string }[] = [
  { type: 'blur-in', label: 'Blur Bloom', desc: 'Soft depth-of-field focus reveal' },
  { type: 'kinetic-punch', label: 'Kinetic Punch', desc: 'High energy spring overshoot' },
  { type: 'mask-slide', label: 'Mask Slide', desc: 'Sleek upward wipe mask' },
  { type: 'golden-shimmer', label: 'Luminous Shimmer', desc: 'Golden text radiance & bloom' },
  { type: 'lead-tracker', label: 'Lead Tracker', desc: 'Line-by-line vocal focus' },
  { type: 'editorial-split', label: 'Editorial Split', desc: 'Dual-scale magazine hierarchy' },
  { type: 'neon-pulse', label: 'Neon Pulse', desc: 'Electric glowing atmosphere' },
  { type: 'acoustic-dissolve', label: 'Acoustic Dissolve', desc: 'Warm cinematic film fade' },
  { type: 'opposing-drift', label: 'Opposing Drift', desc: 'Multi-directional kinetic reveal' },
  { type: 'rhythm-typewriter', label: 'Rhythm Typewriter', desc: 'Cadenced word typewriter' },
  { type: 'vertical-scroll', label: 'Vertical Scroll', desc: 'Large text roll from bottom to top' },
  { type: 'word-stack', label: 'Word Stack', desc: 'Words stack vertically and pop in one by one' },
  { type: 'flicker', label: 'Flicker', desc: 'Words flicker on like a neon sign' },
  { type: 'bounce', label: 'Bounce', desc: 'Words bounce in (letters bounce for a single word)' },
  { type: 'scroll-in', label: 'Scroll In', desc: 'The words glide in from an edge of the screen' },
  { type: 'karaoke', label: 'Karaoke Fill', desc: 'Each word fills with colour, one after another, at your pace' },
  { type: 'ticker', label: 'Ticker (Scroll Across)', desc: 'One line moving across, left or right, for announcements' },
];

/** Sensible settings when a box switches to a motion, so it doesn't keep settings meant for another motion */
export const MOTION_DEFAULTS: Partial<Record<AnimationType, Partial<AnimationConfig>>> = {
  'word-stack': { duration: 0.35, stagger: 0.35 },
  flicker: { duration: 0.9, stagger: 0.08, effectLoop: false },
  bounce: { duration: 0.8, stagger: 0.12, effectLoop: false },
  'vertical-scroll': { duration: 14, scrollStartPos: 150, scrollEndPos: -50, scrollLoop: true },
  'scroll-in': { duration: 0.9, fromEdge: 'bottom' },
  karaoke: { duration: 0.4, stagger: 0.5, karaokeColor: '#38bdf8' },
  ticker: { tickerDirection: 'left', tickerSpeed: 260, scrollLoop: true },
};
export const GENERIC_MOTION_DEFAULTS: Partial<AnimationConfig> = { duration: 0.6, stagger: 0.06 };

export const LAYOUT_PRESETS = [
  { label: 'Center Stage', layout: { x: 0.08, y: 0.15, width: 0.84, height: 0.7 } },
  { label: 'Lower Third (Broadcast)', layout: { x: 0.05, y: 0.65, width: 0.9, height: 0.28 } },
  { label: 'Cinematic Widescreen', layout: { x: 0.12, y: 0.25, width: 0.76, height: 0.5 } },
  { label: 'Top Header', layout: { x: 0.05, y: 0.08, width: 0.9, height: 0.25 } },
  { label: 'Minimal Lower', layout: { x: 0.1, y: 0.75, width: 0.8, height: 0.2 } },
];

export const SHADOW_PRESETS = [
  { label: 'None', value: 'none' },
  { label: 'Subtle Drop', value: '0 4px 12px rgba(0,0,0,0.8)' },
  { label: 'Heavy Contrast', value: '0 8px 0px rgba(0,0,0,1), 0 20px 40px rgba(0,0,0,0.9)' },
  { label: 'Ambient Bloom', value: '0 10px 30px rgba(0,0,0,0.9), 0 0 25px rgba(255,255,255,0.2)' },
  { label: 'Golden Glow', value: '0 0 35px rgba(234,179,8,0.4), 0 10px 20px rgba(0,0,0,0.9)' },
  { label: 'Neon Cyan', value: '0 0 30px rgba(56,189,248,0.5), 0 0 10px rgba(255,255,255,0.8)' }
];

// Shows on the editor preview where the text centre starts/stops. Off-screen positions pin to the edge.
export function ScrollMarker({ pos, color, label }: { pos: number; color: string; label: string }) {
  const offTop = pos < 0;
  const offBottom = pos > 100;
  const top = Math.min(100, Math.max(0, pos));
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-20"
      style={{ top: `${top}%`, borderTop: `4px dashed ${color}`, opacity: 0.85 }}
    >
      <span
        className="absolute left-4 px-3 py-1 rounded font-mono font-bold"
        style={{
          fontSize: 28,
          background: color,
          color: '#000',
          top: offBottom || top > 90 ? undefined : 6,
          bottom: offBottom || top > 90 ? 6 : undefined,
        }}
      >
        {label} {offTop ? `↑ ${pos}%` : offBottom ? `↓ ${pos}%` : `${pos}%`}
      </span>
    </div>
  );
}
