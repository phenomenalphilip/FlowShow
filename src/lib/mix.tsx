/**
 * Media Mixer: layers of pictures, videos and colour that play under a show's words.
 *
 * A mix belongs to a show (a song, declaration or presentation) and travels with it to every setlist.
 * Each layer plays on some of the show's slides (a run of slides, every slide of a section, or the whole show).
 * When a slide goes live, the layers for that slide go on the screens (the main screen unless a layer says otherwise).
 * Layers that stay on from one slide to the next keep playing; they don't restart.
 * When the show ends the mix fades out, unless it is set to keep playing into the next show.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { mediaUrl } from './nativeFiles';
import { cachedStageMediaUrl, stageMediaUrl } from './stageMedia';
import { resolveMediaRef } from '../components/MediaLibrary';
import { LiveInputView, type LiveInput } from './liveInputs';

export type MixRect = { x: number; y: number; width: number; height: number };

/** A picture or video: on this computer (path), kept in FlowShow (storedId), or in an added media folder (ref) */
export interface MixMedia {
  type: 'image' | 'video';
  name: string;
  path?: string;
  storedId?: string;
  /** Where it is in an added media folder, so it is found again after a restart */
  ref?: { folder: string; path: string[] };
  /** The address it had when it was added (works until FlowShow closes) */
  url?: string;
}

export type MixSource =
  | { kind: 'media'; media: MixMedia }
  /** A camera, screen or NDI source, live */
  | { kind: 'input'; input: LiveInput }
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  /** A coloured frame round the screen (or round its box): thickness, glow and inner corner rounding in px on a 1920×1080 screen */
  | { kind: 'border'; color: string; width: number; glow: number; radius: number };

/** When a layer plays: a run of slides, every slide of one section (e.g. every Chorus), or the whole show */
export type MixSpan =
  | { kind: 'slides'; fromId: string; toId: string; from: number; to: number }
  | { kind: 'group'; group: string }
  | { kind: 'show' };

export type MixBlend = 'normal' | 'screen' | 'plus-lighter' | 'multiply' | 'overlay' | 'soft-light';
export const MIX_BLENDS: { value: MixBlend; label: string; hint: string }[] = [
  { value: 'normal', label: 'Normal', hint: 'Covers what is under it' },
  { value: 'screen', label: 'Screen', hint: 'Lightens: dark parts disappear (good for light rays, dust, flares)' },
  { value: 'plus-lighter', label: 'Add', hint: 'Adds light: a strong glow' },
  { value: 'multiply', label: 'Multiply', hint: 'Darkens: light parts disappear (good for textures, frames)' },
  { value: 'overlay', label: 'Overlay', hint: 'Adds contrast and colour' },
  { value: 'soft-light', label: 'Soft light', hint: 'A gentle tint' },
];

export interface MixEffects {
  /** 100 = unchanged */
  brightness?: number;
  contrast?: number;
  saturation?: number;
  /** px on a 1920×1080 screen */
  blur?: number;
  /** degrees */
  hue?: number;
  /** 0–100: darker edges */
  vignette?: number;
  /** Colour the layer with this colour (tintAmount 0–100: how strongly) */
  tint?: string;
  tintAmount?: number;
}

export interface MixLayer {
  id: string;
  name: string;
  source: MixSource;
  span: MixSpan;
  layout: MixRect;
  /** 0–100 */
  opacity: number;
  blend?: MixBlend;
  fit?: 'cover' | 'contain';
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  shape?: 'square' | 'rounded' | 'circle';
  effects?: MixEffects;
  /** Videos: loop (default on), speed (1 = normal), and where to start (seconds) */
  loop?: boolean;
  speed?: number;
  startAt?: number;
  /** Seconds to fade in when it starts and out when it stops */
  fadeIn?: number;
  fadeOut?: number;
  /** Kept in the mix but not played */
  hidden?: boolean;
  /** The screens it plays on (none = the main screen only) */
  outputs?: string[];
}

/** A show's mix. Layers are listed bottom first. */
export interface ShowMix {
  layers: MixLayer[];
  /** Keep playing into the next show (until a show with its own mix, or F1) instead of fading out */
  keepPlaying?: boolean;
  /** Seconds to fade out when the show ends */
  fadeOut?: number;
}

/** A mix saved to reuse in other shows */
export interface SavedMix { id: string; name: string; mix: ShowMix; savedAt: number }

/** A layer on the screens, with the address its media plays from */
export type LiveMixLayer = MixLayer & { url?: string };

/** What the screens are playing from the mixer */
export interface LiveMix {
  /** The show it belongs to (null when carried into something that isn't a show, like a Bible verse) */
  showId: string | null;
  layers: LiveMixLayer[];
  keepPlaying?: boolean;
  fadeOut?: number;
  /** How long the layers leaving now take to fade out (set when a show ends or the mix is cleared) */
  exitFade?: number;
  /** Layers taken off with F1 / Clear all: they stay off until their slides are over */
  suppressed?: string[];
}

export const EMPTY_MIX: ShowMix = { layers: [] };
export const DEFAULT_SHOW_END_FADE = 1.5;
export const NEW_MIX_BOX: MixRect = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };
export const FULL_SCREEN_RECT: MixRect = { x: 0, y: 0, width: 1, height: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const newMixId = () => `mixl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

type SlideLike = { id: string; group?: string };

// ─── When layers play ───

/** A run of slides, by slide (so it stays put when slides are added or moved), with numbers to fall back on */
export function slidesSpan(slides: SlideLike[], from: number, to: number): MixSpan {
  const f = clamp(Math.min(from, to), 0, Math.max(0, slides.length - 1));
  const t = clamp(Math.max(from, to), 0, Math.max(0, slides.length - 1));
  return { kind: 'slides', fromId: slides[f]?.id ?? '', toId: slides[t]?.id ?? '', from: f, to: t };
}

/** The first and last slide (numbers) of a run of slides */
export function spanRange(span: Extract<MixSpan, { kind: 'slides' }>, slides: SlideLike[]): { from: number; to: number } {
  const last = Math.max(0, slides.length - 1);
  const fi = slides.findIndex(s => s.id === span.fromId);
  const ti = slides.findIndex(s => s.id === span.toId);
  const from = fi >= 0 ? fi : clamp(span.from, 0, last);
  const to = ti >= 0 ? ti : clamp(span.to, 0, last);
  return from <= to ? { from, to } : { from: to, to: from };
}

export function layerPlaysAt(layer: MixLayer, slides: SlideLike[], index: number): boolean {
  if (index < 0 || index >= slides.length) return false;
  const span = layer.span;
  if (span.kind === 'show') return true;
  if (span.kind === 'group') return !!span.group && slides[index]?.group === span.group;
  const { from, to } = spanRange(span, slides);
  return index >= from && index <= to;
}

/** The runs of slides a layer plays on (one bar per run on the timeline) */
export function layerRuns(layer: MixLayer, slides: SlideLike[]): { from: number; to: number }[] {
  if (!slides.length) return [];
  if (layer.span.kind === 'show') return [{ from: 0, to: slides.length - 1 }];
  if (layer.span.kind === 'slides') return [spanRange(layer.span, slides)];
  const runs: { from: number; to: number }[] = [];
  slides.forEach((s, i) => {
    if (s.group !== (layer.span as { group: string }).group) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1) last.to = i; else runs.push({ from: i, to: i });
  });
  return runs;
}

/** The layers that play on one slide (bottom first) */
export const mixLayersAt = (mix: ShowMix | undefined | null, slides: SlideLike[], index: number): MixLayer[] =>
  (mix?.layers || []).filter(l => !l.hidden && layerPlaysAt(l, slides, index));

/** A mix moved onto other slides (Copy mix, saved mixes): runs keep their slide numbers, sections their names */
export function mixForSlides(mix: ShowMix, slides: SlideLike[], freshIds = true): ShowMix {
  return {
    ...mix,
    layers: mix.layers.map(l => ({
      ...JSON.parse(JSON.stringify(l)) as MixLayer,
      id: freshIds ? newMixId() : l.id,
      span: l.span.kind === 'slides' ? slidesSpan(slides, l.span.from, l.span.to) : l.span,
    })),
  };
}

/** A copy of a mix to keep (runs saved by slide number, so it fits any show) */
export function mixToSave(mix: ShowMix, slides: SlideLike[]): ShowMix {
  return {
    ...mix,
    layers: mix.layers.map(l => {
      const copy = JSON.parse(JSON.stringify(l)) as MixLayer;
      if (l.span.kind === 'slides') { const r = spanRange(l.span, slides); copy.span = { kind: 'slides', fromId: '', toId: '', from: r.from, to: r.to }; }
      return copy;
    }),
  };
}

// ─── Which screens ───

type OutputLike = { id: string; kind?: string };
/** The main screen: the first screen that isn't a stage screen */
export const mainScreenId = (outputs: OutputLike[] | undefined) => outputs?.find(o => o.kind !== 'stage')?.id ?? 'main';
export const layerScreens = (layer: MixLayer, outputs: OutputLike[] | undefined) =>
  layer.outputs?.length ? layer.outputs : [mainScreenId(outputs)];
export const mixLayersForScreen = <T extends MixLayer>(layers: T[] | undefined, outputId: string | undefined, outputs: OutputLike[] | undefined): T[] =>
  (layers || []).filter(l => layerScreens(l, outputs).includes(outputId || 'main'));

// ─── Finding the media ───

const refCache = new Map<string, string>();
const refKey = (r: { folder: string; path: string[] }) => `${r.folder}/${r.path.join('/')}`;
/** Remember a working address for media from an added folder (it lasts until FlowShow closes) */
export const rememberMixUrl = (media: MixMedia, url: string) => { if (media.ref && url) refCache.set(refKey(media.ref), url); };

/** The address to play media from, if it is known straight away */
export function mixUrlNow(media: MixMedia): string | null {
  if (media.path) return mediaUrl(media.path);
  if (media.storedId) return cachedStageMediaUrl(media.storedId);
  if (media.ref) { const c = refCache.get(refKey(media.ref)); if (c) return c; }
  return media.url || null;
}

/** The address to play media from, finding it again if needed (null if the file can't be found) */
export async function findMixUrl(media: MixMedia, skipOldAddress = false): Promise<string | null> {
  if (media.path) return mediaUrl(media.path);
  if (media.storedId) return stageMediaUrl(media.storedId);
  if (media.ref) {
    const cached = refCache.get(refKey(media.ref));
    if (cached && !skipOldAddress) return cached;
    const url = await resolveMediaRef(media.ref).catch(() => null);
    if (url) { refCache.set(refKey(media.ref), url); return url; }
  }
  return skipOldAddress ? null : media.url || null;
}

function useMixUrl(media: MixMedia | undefined, given?: string) {
  const [url, setUrl] = useState<string | null>(() => given ?? (media ? mixUrlNow(media) : null));
  const triedAgain = useRef(false);
  const key = media ? `${media.path || ''}|${media.storedId || ''}|${media.ref ? refKey(media.ref) : ''}|${media.url || ''}` : '';
  useEffect(() => {
    let alive = true;
    triedAgain.current = false;
    if (given) { setUrl(given); return; }
    if (!media) { setUrl(null); return; }
    const now = mixUrlNow(media);
    setUrl(now);
    if (!now || media.storedId) void findMixUrl(media).then(u => { if (alive && u) setUrl(u); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given, key]);
  // An old address that no longer works: look for the file again, once
  const onError = () => {
    if (!media?.ref || triedAgain.current) { setUrl(null); return; }
    triedAgain.current = true;
    void findMixUrl(media, true).then(u => setUrl(u));
  };
  return { url, onError };
}

// ─── Drawing the layers ───

export function mixFilter(e: MixEffects | undefined): string | undefined {
  if (!e) return undefined;
  const parts: string[] = [];
  if (e.brightness !== undefined && e.brightness !== 100) parts.push(`brightness(${e.brightness / 100})`);
  if (e.contrast !== undefined && e.contrast !== 100) parts.push(`contrast(${e.contrast / 100})`);
  if (e.saturation !== undefined && e.saturation !== 100) parts.push(`saturate(${e.saturation / 100})`);
  if (e.hue) parts.push(`hue-rotate(${e.hue}deg)`);
  if (e.blur) parts.push(`blur(${e.blur}px)`);
  return parts.length ? parts.join(' ') : undefined;
}

const pct = (v: number) => `${v * 100}%`;

function MixLayerView({ layer, preview }: { layer: LiveMixLayer; preview?: boolean }) {
  const media = layer.source.kind === 'media' ? layer.source.media : undefined;
  const { url, onError } = useMixUrl(media, layer.url);
  const videoRef = useRef<HTMLVideoElement>(null);
  const speed = clamp(layer.speed ?? 1, 0.1, 4);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed, url]);

  const opacity = clamp(layer.opacity ?? 100, 0, 100) / 100;
  const filter = mixFilter(layer.effects);
  const transforms = [
    layer.rotation ? `rotate(${layer.rotation}deg)` : '',
    layer.flipX ? 'scaleX(-1)' : '',
    layer.flipY ? 'scaleY(-1)' : '',
  ].filter(Boolean).join(' ');
  const box: React.CSSProperties = {
    position: 'absolute',
    left: pct(layer.layout.x), top: pct(layer.layout.y), width: pct(layer.layout.width), height: pct(layer.layout.height),
    transform: transforms || undefined,
    borderRadius: layer.shape === 'circle' ? '50%' : layer.shape === 'rounded' ? '4%' : undefined,
    overflow: 'hidden',
  };
  const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: layer.fit || 'cover', filter };

  let content: React.ReactNode = null;
  if (layer.source.kind === 'color') content = <div style={{ ...fill, background: layer.source.color }} />;
  else if (layer.source.kind === 'input') content = <LiveInputView input={layer.source.input} quality="high" fit={layer.fit || 'cover'} style={fill} showProblems={preview} />;
  else if (layer.source.kind === 'gradient') content = <div style={{ ...fill, background: `linear-gradient(${layer.source.angle}deg, ${layer.source.from}, ${layer.source.to})` }} />;
  else if (layer.source.kind === 'border') {
    // The hole in the middle is a rounded box; its huge outer shadow paints the frame, an inner shadow the glow
    const b = layer.source;
    const shadows = [`0 0 0 4000px ${b.color}`, b.glow > 0 ? `inset 0 0 ${b.glow}px ${b.glow / 2}px ${b.color}` : ''].filter(Boolean).join(', ');
    content = (
      <div style={{ ...fill, overflow: 'hidden' }} data-mix-border>
        <div style={{ position: 'absolute', inset: Math.max(0, b.width), borderRadius: Math.max(0, b.radius), boxShadow: shadows }} />
      </div>
    );
  }
  else if (!url) {
    content = preview ? (
      <div className="absolute inset-0 flex items-center justify-center text-center bg-black/50 border-4 border-dashed border-amber-400/80 text-amber-200 text-4xl font-semibold p-6" data-mix-missing>
        Can't find "{media?.name}"
      </div>
    ) : null;
  } else if (media?.type === 'video') {
    content = (
      <video
        ref={videoRef}
        src={url}
        style={fill}
        autoPlay
        muted
        playsInline
        loop={layer.loop !== false}
        onLoadedMetadata={(e) => { const v = e.currentTarget; if (layer.startAt) v.currentTime = layer.startAt; v.playbackRate = speed; }}
        onError={onError}
      />
    );
  } else {
    content = <img src={url} alt="" draggable={false} style={fill} onError={onError} />;
  }

  const fadeIn = layer.fadeIn ?? 1;
  const fadeOut = layer.fadeOut ?? 1;
  const tinted = (layer.source.kind === 'media' || layer.source.kind === 'input') && !!layer.effects?.tint && (layer.effects.tintAmount ?? 100) > 0;
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      style={{ mixBlendMode: (layer.blend || 'normal') as React.CSSProperties['mixBlendMode'] }}
      initial={{ opacity: 0 }}
      animate={{ opacity, transition: { duration: fadeIn, ease: 'easeOut' } }}
      variants={{ gone: (exitFade?: number) => ({ opacity: 0, transition: { duration: exitFade ?? fadeOut, ease: 'easeOut' } }) }}
      exit="gone"
      data-mix-layer={layer.id}
    >
      <div style={tinted ? { ...box, isolation: 'isolate' } : box}>
        {content}
        {/* Tint: the layer's light and dark, in the chosen colour (pictures, videos and inputs) */}
        {tinted && <div className="absolute inset-0" style={{ background: layer.effects!.tint, mixBlendMode: 'color', opacity: clamp(layer.effects!.tintAmount ?? 100, 0, 100) / 100 }} data-mix-tint />}
        {!!layer.effects?.vignette && (
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${clamp(layer.effects.vignette, 0, 100) / 100}) 100%)` }} />
        )}
      </div>
    </motion.div>
  );
}

/**
 * The mix on a screen: above the background, under overlays and the words. Layers fade in and out;
 * a layer that stays on keeps playing. Blend modes mix with the background below.
 */
export function MixStack({ layers, exitFade, preview = false }: { layers: LiveMixLayer[] | undefined; exitFade?: number; preview?: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none" data-mix-stack>
      <AnimatePresence custom={exitFade}>
        {(layers || []).map(l => React.createElement(MixLayerView as any, { key: l.id, layer: l, preview }))}
      </AnimatePresence>
    </div>
  );
}
