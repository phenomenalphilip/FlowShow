import React, { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { tokenize, Token } from '../lib/TokenEngine';
import { AnimationConfig } from '../lib/templates';

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
  disableAbsoluteLayout
}: SmartTextLayoutProps) {
  const renderedLines = useMemo(() => {
     if (lines) return lines.map(l => tokenize(l, undefined, styleOverrides?.words));
     if (text) return text.split('\n').map(l => tokenize(l, undefined, styleOverrides?.words));
     return [];
  }, [text, lines, styleOverrides]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

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
    
    setScale(1);
    
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
  }, [text, source, type, styleOverrides?.layout]);

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
    if (isScroll) {
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

  const startY = animation?.scrollStart ?? 100;
  const endY = animation?.scrollEnd ?? -100;
  const isLoop = animation?.scrollLoop !== false;
  const scrollDuration = animation?.duration || 12;

  const scrollAnimationProps = isScroll ? (
    isLoop ? {
      animate: { y: [`${startY}%`, `${endY}%`] },
      transition: {
        repeat: Infinity,
        duration: scrollDuration,
        ease: (animation?.easing === 'easeOut' || animation?.easing === 'easeInOut') ? animation.easing : 'linear',
        repeatType: 'loop' as const
      }
    } : {
      initial: { y: `${startY}%` },
      animate: { y: `${endY}%` },
      transition: {
        duration: scrollDuration,
        ease: (animation?.easing === 'easeOut' || animation?.easing === 'easeInOut') ? animation.easing : 'linear'
      }
    }
  ) : {
    animate: ambientMotion
  };

  const mainContent = (
    <div 
      ref={containerRef}
      className={`${posClass} flex flex-col justify-center overflow-hidden ${className.replace(/relative/g, '').replace(/w-full/g, '').replace(/h-full/g, '')}`}
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
          key={text || 'empty-slide'}
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
          {renderedLines.map((lineTokens, lineIdx) => {
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
                {lineTokens.map((token: Token) => {
                  const isClickable = (!!onWordClick || !!onWordMouseDown) && token.wordIndex !== undefined;
                  const isSelected = isClickable && selectedWordIndices?.includes(token.wordIndex as number);
                  
                  return (
                    <span 
                       key={token.id} 
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
                       style={token.computedStyles}
                    >
                      {token.value}
                    </span>
                  );
                })}
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
