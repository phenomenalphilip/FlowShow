/**
 * Overlays: designs (pictures, videos and text) that sit over the background and stay on while
 * backgrounds and slides change. Several can be on at once. Only F3 (Clear overlays) takes them off.
 * Transparent wherever they have nothing.
 */
import React from 'react';
import { DesignMediaLayer, type DesignMedia, type MediaRect } from './designMedia';
import { SmartTextLayout } from '../components/SmartTextLayout';
import type { TextPosition } from './templates';

export interface OverlayText {
  id: string;
  text: string;
  layout: MediaRect;
  style?: React.CSSProperties;
  verticalAlign?: TextPosition;
}

export interface Overlay {
  id: string;
  name: string;
  /** Group it is filed under in the Overlays tab (none = Ungrouped) */
  group?: string;
  media: DesignMedia[];
  texts: OverlayText[];
  /** Drawn over the slide's words instead of under them */
  aboveWords?: boolean;
  /** The screens it shows on (none = every audience screen) */
  outputIds?: string[];
}

export const NEW_OVERLAY_TEXT_STYLE: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif', fontSize: '64px', fontWeight: '700', color: '#ffffff',
  textAlign: 'center', textShadow: '0 2px 12px rgba(0,0,0,0.6)',
};
export const NEW_OVERLAY_TEXT_LAYOUT: MediaRect = { x: 0.05, y: 0.8, width: 0.9, height: 0.14 };

export const newOverlay = (name: string, group?: string): Overlay => ({
  id: `overlay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  name, group, media: [], texts: [],
});

/** The overlays switched on that show on this screen, in the order they are listed */
export function overlaysFor(all: Overlay[] | undefined, activeIds: string[] | undefined, outputId: string | undefined): Overlay[] {
  if (!all?.length || !activeIds?.length) return [];
  const on = new Set(activeIds);
  return all.filter(o => on.has(o.id) && (!o.outputIds?.length || !outputId || o.outputIds.includes(outputId)));
}

/** One overlay's pictures and text */
export function OverlayContent({ overlay, preview = false }: { overlay: Overlay; preview?: boolean }) {
  return (
    <>
      <DesignMediaLayer items={overlay.media} preview={preview} />
      {overlay.texts.filter(t => t.text.trim()).map(t => (
        <React.Fragment key={t.id}>
          <SmartTextLayout
            text={t.text}
            type="lyrics"
            styleOverrides={{ global: t.style, layout: t.layout, verticalAlign: t.verticalAlign }}
            className="relative z-10 w-full h-full"
          />
        </React.Fragment>
      ))}
    </>
  );
}

/** The overlays of one layer (under or over the words), each in its own full-screen sheet */
export function OverlayLayer({ overlays, above }: { overlays: Overlay[]; above: boolean }) {
  const shown = overlays.filter(o => !!o.aboveWords === above);
  if (!shown.length) return null;
  return (
    <>
      {shown.map(o => (
        <div key={o.id} className="absolute inset-0 pointer-events-none" style={{ zIndex: above ? 20 : 4 }} data-overlay={o.id}>
          <OverlayContent overlay={o} />
        </div>
      ))}
    </>
  );
}
