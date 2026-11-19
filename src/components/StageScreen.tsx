import React, { useEffect, useState } from 'react';
import { SmartTextLayout } from './SmartTextLayout';
import type { SlideDefinition } from '../App';
import type { StageItem, StageLayout, StageRect } from '../lib/stageLayouts';

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
}

/** What a stage screen draws inside its FixedStage (1920×1080) */
export function StageScreen({ layout, slide, nextSlide, songTitle, background = '#000000', hideText = false }: StageScreenProps) {
  const current = hideText ? null : slide;
  return (
    <>
      <div className="absolute inset-0" style={{ background }} />
      {layout.items.map(item => (
        <React.Fragment key={item.id}>
          <StageItemView item={item} slide={current} nextSlide={current ? nextSlide : null} songTitle={songTitle} />
        </React.Fragment>
      ))}
    </>
  );
}

function StageItemView({ item, slide, nextSlide, songTitle }: {
  item: StageItem;
  slide: SlideDefinition | null | undefined;
  nextSlide: SlideDefinition | null | undefined;
  songTitle?: string;
}) {
  const style = { ...STAGE_TEXT, ...item.style };
  switch (item.kind) {
    case 'current-slide':
      return slide ? <SlideText rect={item.rect} slide={slide} style={style} /> : null;
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
            ? <SlideText rect={textRect} slide={nextSlide} style={style} />
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
    default:
      return null;
  }
}

/** Slide words, shrunk (or grown a little) to fill their box */
function SlideText({ rect, slide, style }: { rect: StageRect; slide: SlideDefinition; style: React.CSSProperties }) {
  return (
    <SmartTextLayout
      text={slide.text}
      type={slide.type === 'scripture' ? 'scripture' : 'lyrics'}
      styleOverrides={{ global: style, layout: rect }}
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
