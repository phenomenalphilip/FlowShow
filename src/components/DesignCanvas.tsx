import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Box position/size as fractions of the 1920×1080 canvas */
export type Rect = { x: number; y: number; width: number; height: number };
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const MIN_SIZE = 0.03;
const SNAP = 0.012;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** Box position as 0–100 of the free space: 0 = hugging the left/top edge, 50 = centred, 100 = right/bottom edge */
export const getPlacement = (r: Rect) => ({
  across: r.width >= 1 ? 50 : Math.round((r.x / (1 - r.width)) * 100),
  down: r.height >= 1 ? 50 : Math.round((r.y / (1 - r.height)) * 100),
});
export const placeAcross = (r: Rect, across: number): Partial<Rect> => ({ x: round4((clamp(across, 0, 100) / 100) * (1 - r.width)) });
export const placeDown = (r: Rect, down: number): Partial<Rect> => ({ y: round4((clamp(down, 0, 100) / 100) * (1 - r.height)) });
/** Change the box size while keeping it on screen */
export const resizeBox = (r: Rect, size: { width?: number; height?: number }): Partial<Rect> => {
  const width = round4(clamp(size.width ?? r.width, MIN_SIZE, 1));
  const height = round4(clamp(size.height ?? r.height, MIN_SIZE, 1));
  return { width, height, x: round4(clamp(r.x, 0, 1 - width)), y: round4(clamp(r.y, 0, 1 - height)) };
};

function nextRect(handle: Handle, s: Rect, dx: number, dy: number, snap: boolean) {
  let { x, y, width: w, height: h } = s;
  let snapX = false;
  let snapY = false;
  if (handle === 'move') {
    x = clamp(x + dx, 0, 1 - w);
    y = clamp(y + dy, 0, 1 - h);
    if (snap && Math.abs(x + w / 2 - 0.5) < SNAP) { x = 0.5 - w / 2; snapX = true; }
    if (snap && Math.abs(y + h / 2 - 0.5) < SNAP) { y = 0.5 - h / 2; snapY = true; }
  } else {
    if (handle.includes('w')) { const right = x + w; x = clamp(x + dx, 0, right - MIN_SIZE); w = right - x; }
    if (handle.includes('e')) { w = clamp(w + dx, MIN_SIZE, 1 - x); }
    if (handle.includes('n')) { const bottom = y + h; y = clamp(y + dy, 0, bottom - MIN_SIZE); h = bottom - y; }
    if (handle.includes('s')) { h = clamp(h + dy, MIN_SIZE, 1 - y); }
  }
  return { rect: { x: round4(x), y: round4(y), width: round4(w), height: round4(h) }, snapX, snapY };
}

const HANDLES: { h: Handle; left: string; top: string; cursor: string }[] = [
  { h: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
  { h: 'n', left: '50%', top: '0%', cursor: 'ns-resize' },
  { h: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
  { h: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
  { h: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
  { h: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
  { h: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
  { h: 'w', left: '0%', top: '50%', cursor: 'ew-resize' },
];

interface DesignBoxProps {
  rect: Rect;
  /** FixedStage scale (screen px per canvas px) */
  scale: number;
  label: string;
  /** false = outline only (double-click still works), no move/resize */
  movable: boolean;
  /** Highlighted as the box the toolbar is editing */
  selected?: boolean;
  /** Pressing the box picks it */
  onSelect?: () => void;
  /** Every frame while dragging */
  onChange: (rect: Rect) => void;
  /** Once when the drag ends, with the final box (only if it moved) */
  onChangeEnd?: (rect: Rect) => void;
  /** A press-and-release without dragging, with where it happened (e.g. to pick the word under it) */
  onClickThrough?: (clientX: number, clientY: number) => void;
  onDoubleClick?: () => void;
  /** Always-visible note on the box's top-right corner, e.g. that it isn't on the screen */
  tag?: { text: string; tone: 'amber' | 'grey' };
}

const DRAG_THRESHOLD_PX = 3;

/** Drag to move, drag edges/corners to resize. Snaps to the centre lines; hold Alt to place freely. Render inside a FixedStage canvas. */
export function DesignBox({ rect, scale, label, movable, selected = false, onSelect, onChange, onChangeEnd, onClickThrough, onDoubleClick, tag }: DesignBoxProps) {
  const drag = useRef<{ handle: Handle; x0: number; y0: number; start: Rect; moved: boolean } | null>(null);
  const pending = useRef<Rect | null>(null);
  const lastRect = useRef<Rect | null>(null);
  const frame = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onChangeEndRef = useRef(onChangeEnd);
  onChangeEndRef.current = onChangeEnd;
  const onClickThroughRef = useRef(onClickThrough);
  onClickThroughRef.current = onClickThrough;
  const [active, setActive] = useState(false);
  const [snaps, setSnaps] = useState({ x: false, y: false });

  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);

  const flush = () => {
    frame.current = null;
    if (pending.current) {
      onChangeRef.current(pending.current);
      pending.current = null;
    }
  };

  const begin = (handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect?.();
    if (!movable) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, x0: e.clientX, y0: e.clientY, start: rect, moved: false };
    lastRect.current = null;
    setActive(true);
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || scale <= 0) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const { rect: r, snapX, snapY } = nextRect(
      d.handle, d.start,
      (e.clientX - d.x0) / (CANVAS_W * scale),
      (e.clientY - d.y0) / (CANVAS_H * scale),
      !e.altKey
    );
    setSnaps(s => (s.x === snapX && s.y === snapY ? s : { x: snapX, y: snapY }));
    pending.current = r;
    lastRect.current = r;
    if (frame.current == null) frame.current = requestAnimationFrame(flush);
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (frame.current != null) cancelAnimationFrame(frame.current);
    flush();
    if (lastRect.current) onChangeEndRef.current?.(lastRect.current);
    else if (!d.moved && e.type === 'pointerup') onClickThroughRef.current?.(e.clientX, e.clientY);
    lastRect.current = null;
    setActive(false);
    setSnaps({ x: false, y: false });
  };

  // Sizes below are in screen px, converted to canvas px so the chrome looks the same at any zoom
  const px = (n: number) => n / Math.max(scale, 0.0001);
  const labelInside = rect.y < 0.05;

  return (
    <>
      {snaps.x && <div className="absolute top-0 bottom-0 pointer-events-none z-30" style={{ left: '50%', borderLeft: `${px(1)}px solid var(--color-pink-400)` }} />}
      {snaps.y && <div className="absolute left-0 right-0 pointer-events-none z-30" style={{ top: '50%', borderTop: `${px(1)}px solid var(--color-pink-400)` }} />}
      <div
        className="absolute z-20 group"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
          cursor: movable ? 'move' : 'text',
          outline: active || selected
            ? `${px(active ? 2 : 1.5)}px solid var(--color-pink-500)`
            : `${px(1.5)}px dashed rgba(255,255,255,0.45)`,
        }}
        onPointerDown={begin('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
      >
        <div
          className={`absolute left-0 whitespace-nowrap font-sans font-semibold pointer-events-none transition-opacity ${active ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}
          style={{
            ...(labelInside ? { top: px(4), left: px(4) } : { bottom: '100%', marginBottom: px(4) }),
            fontSize: px(11),
            padding: `${px(2)}px ${px(6)}px`,
            borderRadius: px(4),
            background: 'var(--color-pink-500)',
            color: '#fff',
          }}
        >
          {label}
        </div>
        {tag && (
          <div
            className="absolute right-0 whitespace-nowrap font-sans font-semibold pointer-events-none"
            style={{
              ...(labelInside ? { top: px(4), right: px(4) } : { bottom: '100%', marginBottom: px(4) }),
              fontSize: px(11),
              padding: `${px(2)}px ${px(6)}px`,
              borderRadius: px(4),
              background: tag.tone === 'amber' ? '#f59e0b' : '#52525b',
              color: tag.tone === 'amber' ? '#18181b' : '#fff',
            }}
          >
            {tag.text}
          </div>
        )}
        {movable && HANDLES.map(({ h, left, top, cursor }) => (
          <div
            key={h}
            onPointerDown={begin(h)}
            className={`absolute bg-white transition-opacity ${active || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            style={{
              left, top, cursor,
              width: px(10), height: px(10),
              marginLeft: -px(5), marginTop: -px(5),
              border: `${px(1.5)}px solid var(--color-pink-500)`,
              borderRadius: px(2),
            }}
          />
        ))}
      </div>
    </>
  );
}

interface InlineTextEditorProps {
  rect: Rect;
  scale: number;
  initialText: string;
  placeholder?: string;
  /** What is being edited, shown under the editor */
  hint?: string;
  /** false when saving doesn't put the text on a screen (e.g. a box waiting for Go live) */
  sendsToScreen?: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/** Edit text in place. Ctrl/Cmd+Enter or clicking away saves; Esc cancels. Nothing is sent until then. */
export function InlineTextEditor({ rect, scale, initialText, placeholder, hint = 'Editing the words on this slide', sendsToScreen = true, onSave, onCancel }: InlineTextEditorProps) {
  const [value, setValue] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);

  // Focus as soon as the box exists, so the very first keystroke lands in it
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save && value !== initialText) onSave(value);
    else onCancel();
  };

  const px = (n: number) => n / Math.max(scale, 0.0001);
  // Keep the editor comfortably large and inside the canvas, even for a thin lower-third box
  const w = Math.max(rect.width, 0.45);
  const h = Math.max(rect.height, 0.4);
  const left = clamp(rect.x, 0, 1 - w);
  const top = clamp(rect.y, 0, 1 - h);

  return (
    <div
      className="absolute z-40 flex flex-col"
      style={{ left: `${left * 100}%`, top: `${top * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
        }}
        onBlur={() => finish(true)}
        placeholder={placeholder}
        spellCheck
        className="flex-1 w-full resize-none outline-none text-white font-sans"
        style={{
          fontSize: px(18),
          lineHeight: 1.4,
          padding: px(12),
          background: 'rgba(9,9,11,0.94)',
          border: `${px(2)}px solid var(--color-pink-500)`,
          borderRadius: px(8),
        }}
      />
      <div className="font-sans text-neutral-300 self-start" style={{ fontSize: px(12), marginTop: px(6), padding: `${px(3)}px ${px(8)}px`, borderRadius: px(4), background: 'rgba(9,9,11,0.88)' }}>
        {hint} · Ctrl+Enter or click away to {sendsToScreen ? 'send' : 'save'} · Esc to cancel
      </div>
    </div>
  );
}
