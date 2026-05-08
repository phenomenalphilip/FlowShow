import React, {
  useMemo,
  useEffect,
  useRef,
  useState
} from 'react';

import { tokenize, Token } from '../lib/TokenEngine';

interface SmartTextLayoutProps {
  text: string;
  source?: string;
  type?: 'lyrics' | 'bible' | string;
  className?: string;

  enableAutoFit?: boolean;

  styleOverrides?: {
    global?: React.CSSProperties & {
      '--font-scale'?: number;
      verticalAlign?: 'top' | 'center' | 'bottom';
    };

    words?: {
      [wordIndex: number]: React.CSSProperties;
    };

    layout?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };

  onWordClick?: (
    wordIndex: number,
    e: React.MouseEvent
  ) => void;

  selectedWordIndices?: number[];
}

export function SmartTextLayout({
  text,
  source,
  type,
  className = '',
  styleOverrides,
  onWordClick,
  selectedWordIndices,
  enableAutoFit = true
}: SmartTextLayoutProps) {

  const tokens = useMemo(
    () => tokenize(text, undefined, styleOverrides?.words),
    [text, styleOverrides]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);

  // ----------------------------
  // SMART FIT ENGINE
  // ----------------------------

  useEffect(() => {
    if (!enableAutoFit) {
      setScale(1);
      return;
    }

    if (!containerRef.current || !textContainerRef.current)
      return;

    const container = containerRef.current;
    const textElem = textContainerRef.current;

    requestAnimationFrame(() => {
      if (!container || !textElem) return;

      const containerWidth =
        container.clientWidth * 0.92;

      const containerHeight =
        container.clientHeight * 0.92;

      const textWidth = textElem.scrollWidth;
      const textHeight = textElem.scrollHeight;

      if (textWidth === 0 || textHeight === 0)
        return;

      const widthScale =
        containerWidth / textWidth;

      const heightScale =
        containerHeight / textHeight;

      let nextScale = Math.min(
        widthScale,
        heightScale
      );

      // Prevent extreme scaling
      nextScale = Math.max(
        0.3,
        Math.min(nextScale, 1.5)
      );

      setScale(nextScale);
    });

  }, [text, styleOverrides, enableAutoFit]);

  // ----------------------------
  // ALIGNMENT
  // ----------------------------

  const align =
    (styleOverrides?.global?.textAlign as string) ||
    'center';

  const verticalAlign =
    styleOverrides?.global?.verticalAlign ||
    'center';

  const horizontalMap: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
    justify: 'stretch'
  };

  const verticalMap: Record<string, string> = {
    top: 'flex-start',
    center: 'center',
    bottom: 'flex-end'
  };

  // ----------------------------
  // LAYOUT
  // ----------------------------

  const layoutStyle: React.CSSProperties =
    styleOverrides?.layout
      ? {
          position: 'absolute',
          left: `${styleOverrides.layout.x * 100}%`,
          top: `${styleOverrides.layout.y * 100}%`,
          width: `${styleOverrides.layout.width * 100}%`,
          height: `${styleOverrides.layout.height * 100}%`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: horizontalMap[align],
          justifyContent:
            verticalMap[verticalAlign]
        }
      : {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: horizontalMap[align],
          justifyContent:
            verticalMap[verticalAlign]
        };

  return (
    <div
      ref={containerRef}
      className={`
        ${
          styleOverrides?.layout
            ? 'absolute'
            : 'relative w-full h-full p-[5%]'
        }
        flex flex-col overflow-hidden
        ${className}
      `}
      style={layoutStyle}
    >
      <div
        ref={textContainerRef}
        className={`
          transition-transform duration-300 ease-out
          ${
            align === 'justify'
              ? 'w-full'
              : 'inline-block'
          }

          ${
            align === 'left'
              ? 'text-left'
              : align === 'right'
              ? 'text-right'
              : align === 'justify'
              ? 'text-justify'
              : 'text-center'
          }
        `}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${verticalAlign} ${align}`
        }}
      >
        <h1
          className={`
            font-display
            text-white
            ${
              align === 'justify'
                ? 'w-full block'
                : 'inline-block'
            }
          `}
          style={{
            textAlign: align as any,

            fontSize:
              styleOverrides?.global?.fontSize ||
              (type === 'bible'
                ? '3rem'
                : '4rem'),

            lineHeight:
              styleOverrides?.global?.lineHeight ||
              1.2,

            letterSpacing:
              styleOverrides?.global
                ?.letterSpacing ||
              (type === 'bible'
                ? 'normal'
                : '0.02em'),

            whiteSpace: 'pre-wrap',

            wordBreak: 'break-word',

            overflowWrap: 'break-word',

            ...styleOverrides?.global
          }}
        >
          {tokens.map((token: Token) => {

            const isClickable =
              !!onWordClick &&
              token.wordIndex !== undefined;

            const isSelected =
              isClickable &&
              selectedWordIndices?.includes(
                token.wordIndex as number
              );

            return (
              <span
                key={token.id}

                onClick={(e) => {
                  if (isClickable) {
                    e.stopPropagation();

                    onWordClick!(
                      token.wordIndex as number,
                      e
                    );
                  }
                }}

                className={`
                  transition-colors duration-200

                  ${
                    isClickable
                      ? 'cursor-pointer rounded hover:bg-white/10'
                      : ''
                  }

                  ${
                    isSelected
                      ? 'bg-blue-500/30 outline outline-1 outline-blue-500'
                      : ''
                  }
                `}

                style={token.computedStyles}
              >
                {token.value}
              </span>
            );
          })}
        </h1>

        {source && (
          <h2
            className="mt-6 text-2xl font-heading font-bold tracking-wide"
            style={{
              textAlign: align as any,
              color:
                styleOverrides?.global?.color ||
                '#fbbf24'
            }}
          >
            {source}
          </h2>
        )}
      </div>
    </div>
  );
}