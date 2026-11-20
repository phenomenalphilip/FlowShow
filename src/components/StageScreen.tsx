import React, { useEffect, useState } from 'react';
import { SmartTextLayout } from './SmartTextLayout';
import type { TextPosition } from '../lib/templates';
import type { SlideDefinition } from '../App';
import { stageDrawOrder, type StageItem, type StageLayout, type StageRect } from '../lib/stageLayouts';
import { useStageMediaUrl } from '../lib/stageMedia';
import { mediaUrl } from '../lib/nativeFiles';
import { formatClock, timeLeft, useSharedTimer, useTicker } from '../lib/timers';

/** Plain, steady text for the stage: no shadow, no capitals unless the layout asks for them */
const STAGE_TEXT: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif', fontWeight: 700, color: '#ffffff', textTransform: 'none', textShadow: 'none', letterSpacing: 'normal', lineHeight: 1.2,
};
/** Height of the small label above the next slide, as a fraction of the screen */
const NEXT_LABEL_HEIGHT = 0.045;
const JUSTIFY: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };

const rectStyle = (r: StageRect): React.CSSProperties => ({
  left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%`,
});

export interface StageScreenProps {
  layout: StageLayout;
  slide: SlideDefinition | null | undefined;
  nextSlide: SlideDefinition | null | undefined;
  songTitle?: string;
  background?: string;
  /** The slide text is cleared on this screen */
  hideText?: boolean;
  /** Designing (not a real screen): a Timer item shows a sample time when no timer is running */
  sample?: boolean;
}

/** What a stage screen draws inside its FixedStage (1920×1080) */
export function StageScreen({ layout, slide, nextSlide, songTitle, background = '#000000', hideText = false, sample = false }: StageScreenProps) {
  const current = hideText ? null : slide;
  const timer = useSharedTimer();
  const now = useTicker(!!timer && timer.startedAt !== null, 250);
  const timeUp = !!timer && timeLeft(timer, now) <= 0;
  return (
    <>
      <div className="absolute inset-0" style={{ background }} />
      {/* Pictures and videos first, so the words are always on top of them */}
      {stageDrawOrder(layout.items).map(item => (
        <React.Fragment key={item.id}>
          <StageItemView item={item} slide={current} nextSlide={current ? nextSlide : null} songTitle={songTitle} sample={sample} />
        </React.Fragment>
      ))}
      {timeUp && !current && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85" data-stage-time-up>
          <span className={`font-black tracking-wider text-red-500 ${timer?.flicker !== false ? 'fs-flicker' : ''}`} style={{ fontSize: '300px', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>TIME UP</span>
        </div>
      )}
    </>
  );
}

function StageItemView({ item, slide, nextSlide, songTitle, sample }: {
  item: StageItem;
  slide: SlideDefinition | null | undefined;
  nextSlide: SlideDefinition | null | undefined;
  songTitle?: string;
  sample?: boolean;
}) {
  const style = { ...STAGE_TEXT, ...item.style };
  switch (item.kind) {
    case 'current-slide':
      return slide ? <SlideText rect={item.rect} slide={slide} style={style} position={item.verticalAlign} /> : null;
    case 'next-slide': {
      if (!slide) return null;
      const labelHeight = Math.min(NEXT_LABEL_HEIGHT, item.rect.height / 3);
      const labelRect = { ...item.rect, height: labelHeight };
      const textRect = { ...item.rect, y: item.rect.y + labelHeight, height: item.rect.height - labelHeight };
      // Say when the next slide starts a new section, e.g. "Next · Chorus"
      const newSection = nextSlide?.group && nextSlide.group !== slide.group ? ` · ${nextSlide.group}` : '';
      return (
        <>
          <StageLabel rect={labelRect} style={{ ...style, fontSize: '30px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.6 }}>
            {(item.text || 'Next') + newSection}
          </StageLabel>
          {nextSlide
            ? <SlideText rect={textRect} slide={nextSlide} style={style} position={item.verticalAlign} />
            : <StageLabel rect={textRect} style={{ ...style, fontSize: '40px', opacity: 0.35 }}>End</StageLabel>}
        </>
      );
    }
    case 'section':
      return <StageLabel rect={item.rect} style={style}>{slide?.group || (slide ? songTitle : '') || ''}</StageLabel>;
    case 'song-title':
      return <StageLabel rect={item.rect} style={style}>{slide ? songTitle || '' : ''}</StageLabel>;
    case 'reference':
      return <StageLabel rect={item.rect} style={style}>{slide?.source || ''}</StageLabel>;
    case 'clock':
      return <StageClock rect={item.rect} style={style} />;
    case 'text':
      return <StageLabel rect={item.rect} style={style}>{item.text || ''}</StageLabel>;
    case 'media':
      return <StageMedia item={item} />;
    case 'timer':
      return <StageTimer rect={item.rect} style={style} sample={sample} />;
    default:
      return null;
  }
}

/** A picture or video in its box, under the words */
function StageMedia({ item }: { item: StageItem }) {
  // A file on this computer (shown from where it is), or one kept in FlowShow by an older version
  const stored = useStageMediaUrl(item.media?.path ? undefined : item.media?.id);
  const url = item.media?.path ? mediaUrl(item.media.path) : stored;
  if (!url || !item.media) return null;
  const style: React.CSSProperties = {
    ...rectStyle(item.rect),
    opacity: Math.min(100, Math.max(0, item.opacity ?? 100)) / 100,
    objectFit: item.fit || 'cover',
  };
  return item.media.type === 'video'
    ? <video src={url} className="absolute z-0 pointer-events-none" style={style} autoPlay loop muted playsInline data-stage-media={item.id} />
    : <img src={url} className="absolute z-0 pointer-events-none" style={style} alt="" data-stage-media={item.id} />;
}

/** Slide words, shrunk (or grown a little) to fill their box */
function SlideText({ rect, slide, style, position }: { rect: StageRect; slide: SlideDefinition; style: React.CSSProperties; position?: TextPosition }) {
  return (
    <SmartTextLayout
      text={slide.text}
      type={slide.type === 'scripture' ? 'scripture' : 'lyrics'}
      styleOverrides={{ global: style, layout: rect, verticalAlign: position }}
      className="relative z-10 w-full h-full"
    />
  );
}

/** One line of text in a box; too long and it ends in "…" */
function StageLabel({ rect, style, children }: { rect: StageRect; style: React.CSSProperties; children: React.ReactNode }) {
  const { textAlign, ...rest } = style;
  return (
    <div
      className="absolute z-10 flex items-center overflow-hidden whitespace-nowrap"
      style={{ ...rectStyle(rect), justifyContent: JUSTIFY[String(textAlign || 'left')] || 'flex-start', ...rest }}
    >
      <span className="truncate">{children}</span>
    </div>
  );
}

/** The countdown in use: amber in the last minute, red when time is up; nothing when no timer is in use */
function StageTimer({ rect, style, sample }: { rect: StageRect; style: React.CSSProperties; sample?: boolean }) {
  const timer = useSharedTimer();
  const now = useTicker(!!timer && timer.startedAt !== null, 200);
  if (!timer) {
    return sample ? <StageLabel rect={rect} style={{ ...style, opacity: 0.35, fontVariantNumeric: 'tabular-nums' }}>5:00</StageLabel> : null;
  }
  const left = timeLeft(timer, now);
  const colour = left <= 0 ? '#ef4444' : left <= 60000 ? '#fbbf24' : style.color;
  return (
    <StageLabel rect={rect} style={{ ...style, color: colour, fontVariantNumeric: 'tabular-nums' }}>
      <span data-stage-timer className={left <= 0 && timer.flicker !== false ? 'fs-flicker' : undefined}>{left <= 0 ? 'TIME UP' : formatClock(left)}</span>
    </StageLabel>
  );
}

function StageClock({ rect, style }: { rect: StageRect; style: React.CSSProperties }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <StageLabel rect={rect} style={{ ...style, fontVariantNumeric: 'tabular-nums' }}>
      {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </StageLabel>
  );
}
