import React, { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { tokenize, Token } from '../lib/TokenEngine';
import { AnimationConfig, getScrollPositions } from '../lib/templates';

/** A fixed "random" number in [0, 1) for each n, so effects look scattered but repeat the same way */
const pseudoRandom = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

interface SmartTextLayoutProps {
  text?: string;
  lines?: string[];
  source?: string;
  type?: 'lyrics' | 'scripture' | string;
  className?: string;
  styleOverrides?: {
    global?: React.CSSProperties & { '--font-scale'?: number };
    words?: { [wordIndex: number]: React.CSSProperties };
    lines?: { [lineIndex: number]: React.CSSProperties };
    layout?: { x: number; y: number; width: number; height: number };
    sourceGlobal?: React.CSSProperties & { '--font-scale'?: number };
    sourceLayout?: { x: number; y: number; width: number; height: number };
  };
  animation?: AnimationConfig;
  onWordClick?: (wordIndex: number, e: React.MouseEvent) => void;
  onWordMouseDown?: (wordIndex: number, e: React.MouseEvent) => void;
  onWordMouseEnter?: (wordIndex: number, e: React.MouseEvent) => void;
  onWordMouseUp?: (wordIndex: number, e: React.MouseEvent) => void;
  onLineClick?: (lineIndex: number, e: React.MouseEvent) => void;
  onLineMouseDown?: (lineIndex: number, e: React.MouseEvent) => void;
  selectedWordIndices?: number[];
  selectedLineIndices?: number[];
  disableAbsoluteLayout?: boolean;
  /** Vertical-scroll only: hold the text still with its centre at this screen position (% of height) */
  scrollPreviewPos?: number;
  /** Outline one word (Design mode word picking) */
  highlightWordIndex?: number;
}

export function SmartTextLayout({
  text,
  lines,
  source,
  type,
  className = '',
  styleOverrides,
  animation,
  onWordClick,
  onWordMouseDown,
  onWordMouseEnter,
  onWordMouseUp,
  onLineClick,
  onLineMouseDown,
  selectedWordIndices,
  selectedLineIndices,
  disableAbsoluteLayout,
  scrollPreviewPos,
  highlightWordIndex
}: SmartTextLayoutProps) {
  const renderedLines = useMemo(() => {
     const source = lines ?? (text ? text.split('\n') : []);
     // Number words across the whole slide (not per line) so a word style targets exactly one word
     let offset = 0;
     return source.map(l => {
       const tokens = tokenize(l, undefined, styleOverrides?.words, offset);
       offset += tokens.filter(t => (t.wordIndex ?? -1) >= 0).length;
       return tokens;
     });
  }, [text, lines, styleOverrides]);

  const perWordEffect = animation?.type === 'flicker' || animation?.type === 'bounce';
  const totalWords = useMemo(
    () => renderedLines.reduce((n, line) => n + line.filter(t => (t.wordIndex ?? -1) >= 0).length, 0),
    [renderedLines]
  );
  const totalLetters = useMemo(
    () => renderedLines.reduce((n, line) => n + line.filter(t => t.type !== 'whitespace').reduce((m, t) => m + Array.from(t.value).length, 0), 0),
    [renderedLines]
  );

  const isWordStack = animation?.type === 'word-stack';
  // Word stack: one word per row, punctuation kept with its word (opening marks join the next word)
  const stackWords = useMemo(() => {
    if (!isWordStack) return [];
    const groups: { id: string; tokens: Token[] }[] = [];
    let prefix: Token[] = [];
    renderedLines.forEach((line, li) => line.forEach((tok, ti) => {
      if (tok.type === 'whitespace') return;
      if (tok.type === 'punctuation') {
        const prev = line[ti - 1];
        const next = line[ti + 1];
        const opensNextWord = (!prev || prev.type === 'whitespace') && !!next && next.type !== 'whitespace';
        const last = groups[groups.length - 1];
        if (last && !opensNextWord) last.tokens.push(tok);
        else prefix.push(tok);
        return;
      }
      groups.push({ id: `${li}-${ti}`, tokens: [...prefix, tok] });
      prefix = [];
    }));
    if (prefix.length) groups.push({ id: 'tail', tokens: prefix });
    return groups;
  }, [renderedLines, isWordStack]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Value-based key: style objects are rebuilt every render, so compare by content to refit on live edits
  const fitStyleKey = JSON.stringify([styleOverrides?.global, styleOverrides?.lines, styleOverrides?.layout]);
  // Vertical-scroll geometry in unscaled canvas px: where the text centre sits at y=0, and the screen height
  const [scrollGeom, setScrollGeom] = useState<{ naturalCenter: number; screenH: number } | null>(null);
  const posToPx = (pos: number) => scrollGeom ? (pos / 100) * scrollGeom.screenH - scrollGeom.naturalCenter : null;
  const scrollPositions = getScrollPositions(animation);
  const scrollPxStart = posToPx(scrollPositions.start);
  const scrollPxEnd = posToPx(scrollPositions.end);
  const parkedPx = scrollPreviewPos !== undefined ? posToPx(scrollPreviewPos) : null;

  useEffect(() => {
    if (animation?.type !== 'vertical-scroll') return;
    if (!containerRef.current || !textContainerRef.current) return;

    const compute = () => {
      const container = containerRef.current;
      if (!container) return;
      // Find the FixedStage canvas (1920×1080) to work in unscaled canvas units
      let root: HTMLElement | null = container;
      while (root && !root.dataset.fixedStage) root = root.parentElement;
      const containerRect = container.getBoundingClientRect();
      const rootRect = root ? root.getBoundingClientRect() : containerRect;
      const screenH = root ? root.offsetHeight : container.offsetHeight;
      const stageScale = root && root.offsetHeight ? rootRect.height / root.offsetHeight : 1;
      if (!stageScale) return;

      // Text is vertically centred in the layout box at y=0
      const naturalCenter = (containerRect.top + containerRect.height / 2 - rootRect.top) / stageScale;
      setScrollGeom({ naturalCenter, screenH });
    };

    requestAnimationFrame(compute);
  }, [animation?.type, text, lines, styleOverrides?.layout]);

  // Smart FitText behavior
  useEffect(() => {
    if (!containerRef.current || !textContainerRef.current) return;

    // For vertical-scroll: allow text to remain large and flow without height compression
    if (animation?.type === 'vertical-scroll') {
      setScale(1);
      return;
    }

    const container = containerRef.current;
    const textElem = textContainerRef.current;
    // Layout sizes ignore the element's own transform, so measure without resetting scale (avoids flicker on live edits)
    requestAnimationFrame(() => {
       if (!container || !textElem) return;
       const computed = window.getComputedStyle(container);
       
       const contentWidth = container.clientWidth - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight);
       const contentHeight = container.clientHeight - parseFloat(computed.paddingTop) - parseFloat(computed.paddingBottom);
       
       const maxTextWidth = textElem.scrollWidth;
       const maxTextHeight = textElem.scrollHeight;
       
       if (maxTextWidth === 0 || maxTextHeight === 0) return;
       
       const scaleWidth = contentWidth / maxTextWidth;
       const scaleHeight = contentHeight / maxTextHeight;
       
       let newScale = Math.min(scaleWidth, scaleHeight);
       newScale = Math.min(newScale, 1.5);
       
       setScale(newScale);
    });
  }, [text, source, type, fitStyleKey, animation?.type]);

  const align = (styleOverrides?.global?.textAlign as string) || 'center';
  
  let alignItems = 'center';
  let origin = 'center center';
  
  if (align === 'left') {
     alignItems = 'flex-start';
     origin = 'center left';
  } else if (align === 'right') {
     alignItems = 'flex-end';
     origin = 'center right';
  } else if (align === 'justify') {
     alignItems = 'stretch';
     origin = 'center center';
  }

  const useAbsolute = !disableAbsoluteLayout;

  const layoutStyle: React.CSSProperties = useAbsolute ? {
    position: 'absolute',
    left: `${(styleOverrides?.layout?.x ?? 0.05) * 100}%`,
    top: `${(styleOverrides?.layout?.y ?? 0.05) * 100}%`,
    width: `${(styleOverrides?.layout?.width ?? 0.9) * 100}%`,
    height: `${(styleOverrides?.layout?.height ?? 0.9) * 100}%`,
    alignItems
  } : { alignItems };

  const posClass = useAbsolute ? 'absolute' : 'relative w-full h-full';
  const shouldRenderSeparateSource = source && useAbsolute && styleOverrides?.sourceLayout;

  const isScroll = animation?.type === 'vertical-scroll';

  // Animation variants generator for each line
  const getLineMotion = (lineIdx: number) => {
    // Scrolling moves the whole block; Flicker and Bounce animate each word or letter instead of lines
    if (isScroll || perWordEffect) {
      return {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        transition: { duration: 0 }
      };
    }

    if (!animation) {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.25 }
      };
    }

    const duration = animation.duration || 0.5;
    const delay = (animation.stagger ?? 0.06) * lineIdx;

    switch (animation.type) {
      case 'blur-in':
        return {
          initial: { opacity: 0, filter: 'blur(14px)', scale: 0.95 },
          animate: { opacity: 1, filter: 'blur(0px)', scale: 1 },
          transition: { duration, delay, ease: [0.16, 1, 0.3, 1] }
        };

      case 'kinetic-punch':
        return {
          initial: { opacity: 0, scale: 0.65, y: 25 },
          animate: { opacity: 1, scale: 1, y: 0 },
          transition: { type: 'spring', damping: 14, stiffness: 240, delay }
        };

      case 'mask-slide':
        return {
          initial: { opacity: 0, y: 35 },
          animate: { opacity: 1, y: 0 },
          transition: { duration, delay, ease: [0.16, 1, 0.3, 1] }
        };

      case 'golden-shimmer':
        return {
          initial: { opacity: 0, y: 15, filter: 'brightness(1.5)' },
          animate: { opacity: 1, y: 0, filter: 'brightness(1)' },
          transition: { duration, delay, ease: 'easeOut' }
        };

      case 'editorial-split':
        return {
          initial: { 
            opacity: 0, 
            y: lineIdx === 0 ? -18 : 30, 
            scale: lineIdx === 0 ? 1 : 0.92 
          },
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { type: 'spring', damping: 15, stiffness: 200, delay }
        };

      case 'neon-pulse':
        return {
          initial: { opacity: 0, scale: 0.92, filter: 'drop-shadow(0 0 0px #38bdf8)' },
          animate: { opacity: 1, scale: 1, filter: 'drop-shadow(0 0 16px #38bdf8)' },
          transition: { duration, delay, ease: 'easeOut' }
        };

      case 'acoustic-dissolve':
        return {
          initial: { opacity: 0, filter: 'blur(18px)', y: 8 },
          animate: { opacity: 1, filter: 'blur(0px)', y: 0 },
          transition: { duration, delay, ease: 'easeInOut' }
        };

      case 'opposing-drift':
        return {
          initial: { opacity: 0, x: lineIdx % 2 === 0 ? -45 : 45 },
          animate: { opacity: 1, x: 0 },
          transition: { duration, delay, ease: [0.16, 1, 0.3, 1] }
        };

      case 'lead-tracker':
        return {
          initial: { opacity: 0.35, scale: 0.98 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: 0.35, delay }
        };

      case 'rhythm-typewriter':
        return {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.22, delay }
        };

      default:
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: 0.25, delay }
        };
    }
  };

  // Continuous ambient loop (float drift or breathing glow)
  const ambientMotion = animation?.ambientLoop === 'drift' ? {
    y: [0, -5, 0],
    transition: { repeat: Infinity, duration: 4.5, ease: 'easeInOut' as const }
  } : animation?.ambientLoop === 'breathe' ? {
    scale: [1, 1.015, 1],
    opacity: [0.95, 1, 0.95],
    transition: { repeat: Infinity, duration: 3.8, ease: 'easeInOut' as const }
  } : undefined;

  const isLoop = animation?.scrollLoop !== false;
  const scrollDuration = animation?.duration || 12;
  const yStart = scrollPxStart ?? 0;
  const yEnd   = scrollPxEnd ?? 0;
  const scrollReady = scrollPxStart !== null && scrollPxEnd !== null;

  const scrollAnimationProps = isScroll ? (
    !scrollReady ? {
      initial: { opacity: 0 },
      animate: { opacity: 0 }
    } : parkedPx !== null ? {
      initial: false as const,
      animate: { y: parkedPx, opacity: 1 },
      transition: { duration: 0 }
    } : isLoop ? {
      animate: { y: [yStart, yEnd] },
      transition: {
        repeat: Infinity,
        duration: scrollDuration,
        ease: (animation?.easing === 'easeOut' || animation?.easing === 'easeInOut') ? animation.easing : 'linear',
        repeatType: 'loop' as const
      }
    } : {
      initial: { y: yStart },
      animate: { y: yEnd },
      transition: {
        duration: scrollDuration,
        ease: (animation?.easing === 'easeOut' || animation?.easing === 'easeInOut') ? animation.easing : 'linear'
      }
    }
  ) : {
    animate: ambientMotion
  };

  const renderToken = (token: Token, key: string, content?: React.ReactNode) => {
    const isClickable = (!!onWordClick || !!onWordMouseDown) && token.wordIndex !== undefined;
    const isSelected = isClickable && selectedWordIndices?.includes(token.wordIndex as number);
    return (
      <span
         key={key}
         onMouseDown={(e) => {
           if (isClickable && onWordMouseDown) {
             e.stopPropagation();
             onWordMouseDown(token.wordIndex as number, e);
           }
         }}
         onMouseEnter={(e) => {
           if (isClickable && onWordMouseEnter) {
             e.stopPropagation();
             onWordMouseEnter(token.wordIndex as number, e);
           }
         }}
         onMouseUp={(e) => {
           if (isClickable && onWordMouseUp) {
             e.stopPropagation();
             onWordMouseUp(token.wordIndex as number, e);
           }
         }}
         onClick={(e) => {
           if (isClickable) {
             e.stopPropagation();
             if (onWordClick) onWordClick(token.wordIndex as number, e);
           }
         }}
         className={`transition-colors duration-100 word-token ${isClickable ? 'cursor-pointer rounded hover:bg-white/10' : ''} ${isSelected ? 'bg-[#2563eb] text-white' : ''}`}
         data-word-index={(token.wordIndex ?? -1) >= 0 ? token.wordIndex : undefined}
         style={highlightWordIndex !== undefined && token.wordIndex === highlightWordIndex
           ? { ...token.computedStyles, outline: '4px solid #ec4899', outlineOffset: '6px', borderRadius: '6px' }
           : token.computedStyles}
      >
        {content ?? token.value}
      </span>
    );
  };

  // ─── Flicker / Bounce: each word animates on its own (each letter, when the slide is a single word) ───
  const letterMode = perWordEffect && totalWords === 1;
  const effectGap = animation?.stagger ?? (animation?.type === 'bounce' ? 0.12 : 0.08);
  const effectDuration = animation?.duration || (animation?.type === 'bounce' ? 0.8 : 0.9);

  const renderEffectUnit = (unit: number, count: number, key: string, child: React.ReactNode) => {
    // Flicker lights words in a scattered (but repeatable) order; Bounce goes in reading order
    const delay = animation?.type === 'flicker'
      ? 0.05 + pseudoRandom(unit + 1) * effectGap * Math.max(1, count)
      : 0.05 + unit * effectGap;
    const keepGoing = !!animation?.effectLoop;
    if (animation?.type === 'flicker') {
      return (
        <motion.span
          key={key}
          style={{ display: 'inline-block' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.15, 0.9, 0.3, 1] }}
          transition={{ duration: effectDuration, delay, times: [0, 0.15, 0.3, 0.5, 0.7, 1], ease: 'linear' }}
        >
          {keepGoing ? (
            <motion.span
              style={{ display: 'inline-block' }}
              animate={{ opacity: [1, 0.25, 1, 0.55, 1] }}
              transition={{ duration: 0.4, times: [0, 0.25, 0.5, 0.75, 1], repeat: Infinity, repeatDelay: 2 + pseudoRandom(unit + 7) * 4, delay: delay + effectDuration + pseudoRandom(unit + 3) * 3 }}
            >
              {child}
            </motion.span>
          ) : child}
        </motion.span>
      );
    }
    return (
      <motion.span
        key={key}
        style={{ display: 'inline-block' }}
        initial={{ y: '-0.9em', opacity: 0 }}
        animate={{ y: '0em', opacity: 1 }}
        transition={{ y: { type: 'spring', duration: effectDuration, bounce: 0.6, delay }, opacity: { duration: 0.12, delay } }}
      >
        {keepGoing ? (
          <motion.span
            style={{ display: 'inline-block' }}
            animate={{ y: ['0em', '-0.22em', '0em'] }}
            transition={{ duration: 0.7, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.5, delay: delay + effectDuration + unit * 0.1 }}
          >
            {child}
          </motion.span>
        ) : child}
      </motion.span>
    );
  };

  // `letterCursor` numbers the letters across the slide in letter mode
  const renderEffectLine = (lineTokens: Token[], letterCursor: { n: number }) => {
    let lastWord = 0;
    return lineTokens.map(token => {
      if (token.type === 'whitespace') return renderToken(token, token.id);
      if (letterMode) {
        if (token.type === 'word') {
          const letters = Array.from(token.value).map(ch => {
            const i = letterCursor.n++;
            return renderEffectUnit(i, totalLetters, `${token.id}-l${i}`, ch);
          });
          return renderToken(token, token.id, letters);
        }
        const i = letterCursor.n;
        letterCursor.n += Array.from(token.value).length;
        return renderEffectUnit(i, totalLetters, `fx-${token.id}`, renderToken(token, token.id));
      }
      // Punctuation moves with the word before it
      if ((token.wordIndex ?? -1) >= 0) lastWord = token.wordIndex as number;
      return renderEffectUnit(lastWord, totalWords, `fx-${token.id}`, renderToken(token, token.id));
    });
  };
  const letterCursor = { n: 0 };

  // Word stack timing: stagger = time between words, duration = length of each pop
  const wordGap = animation?.stagger ?? 0.35;
  const popDuration = animation?.duration ?? 0.35;
  const popOrigin = align === 'right' ? 'right center' : align === 'center' ? 'center center' : 'left center';

  const mainContent = (
    <div
      ref={containerRef}
      className={`${posClass} flex flex-col justify-center ${isScroll ? 'overflow-visible' : 'overflow-hidden'} ${className.replace(/relative/g, '').replace(/w-full/g, '').replace(/h-full/g, '')}`}
      style={layoutStyle}
    >
      <div 
        ref={textContainerRef}
        className={`transition-transform duration-300 ease-out ${align === 'justify' ? 'w-full' : 'inline-block'} text-${align}`}
        style={{ 
          transform: `scale(${scale})`,
          transformOrigin: origin
        }}
      >
        <motion.div 
          key={isScroll ? (parkedPx !== null ? `${text}|parked` : `${text}|${Math.round(yStart)}|${Math.round(yEnd)}`) : (text || 'empty-slide')}
          {...scrollAnimationProps}
          className={`font-display font-bold text-white uppercase ${align === 'justify' ? 'w-full block' : 'inline-block'} select-none`}
          style={{
            textAlign: align as any,
            fontSize: styleOverrides?.global?.fontSize || (type === 'scripture' ? '90px' : '110px'),
            lineHeight: 1.3,
            letterSpacing: type === 'scripture' ? 'normal' : '0.02em',
            textShadow: '0 8px 16px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.5)',
            ...styleOverrides?.global
          }}
        >
          {isWordStack ? stackWords.map((w, i) => (
            // Earlier words stay; later words wait their turn (they keep their space so nothing shifts)
            <motion.div
              key={w.id}
              initial={{ opacity: 0, scale: 0.35, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: popDuration, delay: 0.08 + i * wordGap, ease: [0.34, 1.56, 0.64, 1] }}
              className="block"
              style={{ transformOrigin: popOrigin }}
            >
              {w.tokens.map((token, ti) => renderToken(token, `${w.id}-${ti}`))}
            </motion.div>
          )) : renderedLines.map((lineTokens, lineIdx) => {
             const lineStyle = styleOverrides?.lines?.[lineIdx] || {};
             const isLineSelected = selectedLineIndices?.includes(lineIdx);
             const isLineClickable = !!onLineClick || !!onLineMouseDown;
             const motionProps = getLineMotion(lineIdx);

             return (
               <motion.div 
                 key={`line-${lineIdx}`} 
                 initial={motionProps.initial}
                 animate={motionProps.animate}
                 transition={motionProps.transition}
                 className={`min-h-[1em] ${isLineClickable ? 'cursor-pointer rounded' : ''} ${isLineSelected ? 'outline outline-2 outline-amber-400/70 outline-offset-2 bg-amber-400/10' : ''}`}
                 style={lineStyle}
                 onMouseDown={(e) => {
                   if (isLineClickable && onLineMouseDown) {
                     e.stopPropagation();
                     onLineMouseDown(lineIdx, e);
                   }
                 }}
                 onClick={(e) => {
                   if (isLineClickable && onLineClick) {
                     e.stopPropagation();
                     onLineClick(lineIdx, e);
                   }
                 }}
               >
                {perWordEffect
                  ? renderEffectLine(lineTokens, letterCursor)
                  : lineTokens.map((token: Token) => renderToken(token, token.id))}
               </motion.div>
             );
          })}
        </motion.div>

        {!shouldRenderSeparateSource && source && (
          <motion.h2 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-2xl font-heading font-bold text-amber-400 text-center tracking-wide"
            style={{
               textShadow: '0 4px 8px rgba(0,0,0,0.8)',
               ...styleOverrides?.global
            }}
          >
             {source}
          </motion.h2>
        )}
      </div>
    </div>
  );

  if (!shouldRenderSeparateSource) return mainContent;

  return (
    <>
      {mainContent}
      <SmartTextLayout 
          text={source} 
          type="lyrics" 
          animation={animation}
          styleOverrides={{ 
            global: styleOverrides.sourceGlobal || { color: '#fbbf24', fontWeight: 'bold' }, 
            layout: styleOverrides.sourceLayout 
          }} 
          disableAbsoluteLayout={false}
          className={className}
      />
    </>
  );
}
