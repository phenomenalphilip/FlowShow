/**
 * Making words easy to read over busy backgrounds:
 *  - Contrast: a dark outline and halo around the letters (0 = none … 100 = strongest)
 *  - Box: a colour filled behind the text box, with its own opacity
 * (How bright the background is belongs to each output: Settings → Outputs → Background opacity.)
 *
 * They are kept in the text style itself (as --fs-… values), so they work in templates, slide designs and
 * text boxes alike, and travel inside template packages.
 */
import type React from 'react';

export const CONTRAST_KEY = '--fs-contrast';
export const BOX_COLOR_KEY = '--fs-box-color';
export const BOX_OPACITY_KEY = '--fs-box-opacity';

const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};

export interface Readability { contrast: number; boxColor: string; boxOpacity: number }

export function readabilityOf(style?: React.CSSProperties | Record<string, unknown>): Readability {
  const s = (style || {}) as Record<string, unknown>;
  const color = String(s[BOX_COLOR_KEY] ?? '');
  return {
    contrast: Math.min(100, Math.max(0, num(s[CONTRAST_KEY], 0))),
    boxColor: /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000',
    boxOpacity: Math.min(100, Math.max(0, num(s[BOX_OPACITY_KEY], 0))),
  };
}

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** The extra text styling for a contrast level: an outline drawn behind the letters and a soft dark halo */
export function contrastStyle(contrast: number, textShadow?: unknown): React.CSSProperties {
  if (contrast <= 0) return {};
  const k = contrast / 100;
  const halo = `0 0 ${(0.04 + 0.16 * k).toFixed(3)}em rgba(0,0,0,${(0.35 + 0.55 * k).toFixed(2)}), 0 0 ${(0.02 + 0.05 * k).toFixed(3)}em rgba(0,0,0,${(0.5 + 0.5 * k).toFixed(2)})`;
  const base = textShadow && textShadow !== 'none' ? `${String(textShadow)}, ` : '';
  return {
    WebkitTextStroke: `${(0.01 + 0.05 * k).toFixed(3)}em rgba(0,0,0,${(0.5 + 0.45 * k).toFixed(2)})`,
    // The outline goes behind the letters, so they keep their shape and only gain a dark edge
    paintOrder: 'stroke fill',
    textShadow: base + halo,
  } as React.CSSProperties;
}

/** The fill behind a text box, or nothing */
export function boxFill(r: Readability): React.CSSProperties {
  if (r.boxOpacity <= 0) return {};
  return { backgroundColor: rgba(r.boxColor, r.boxOpacity / 100), borderRadius: 16 };
}
