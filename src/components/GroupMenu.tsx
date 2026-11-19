import React, { useEffect, useState } from 'react';
import { Check, ChevronLeft, LayoutTemplate, Copy } from 'lucide-react';
import type { PresentationTemplate } from '../lib/templates';
import { groupColors } from '../lib/slideGroups';

interface GroupMenuProps {
  x: number;
  y: number;
  group: string;
  slideCount: number;
  templates: PresentationTemplate[];
  /** The template the group uses, if one was set for it */
  templateId?: string;
  /** e.g. "slide 3"; undefined when there is no current slide in this song */
  currentSlideLabel?: string;
  onSetTemplate: (templateId: string) => void;
  onUseCurrentLook: () => void;
  onClose: () => void;
}

/** Right-click menu for a song group (Verse 1, Chorus…) in the Arrangement Groups panel */
export function GroupMenu({ x, y, group, slideCount, templates, templateId, currentSlideLabel, onSetTemplate, onUseCurrentLook, onClose }: GroupMenuProps) {
  const [view, setView] = useState<'main' | 'templates'>('main');

  useEffect(() => {
    // Caught before the app's own shortcuts, so Escape closes the menu instead of clearing the screens
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest('[data-group-menu]'))) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const c = groupColors(group);
  const currentTemplate = templates.find(t => t.id === templateId);
  const act = (fn: () => void) => () => { onClose(); fn(); };

  return (
    <div
      data-group-menu
      className="fixed z-[150] w-60 py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl text-xs text-neutral-200"
      style={{ left: Math.min(x, window.innerWidth - 250), top: Math.min(y, window.innerHeight - 360) }}
    >
      {view === 'main' ? (
        <>
          <div className="px-3 py-1.5 flex items-center gap-2 text-[11px] font-semibold">
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            <span className={c.text}>{group}</span>
            <span className="ml-auto text-neutral-500 font-normal">{slideCount} slide{slideCount === 1 ? '' : 's'}</span>
          </div>
          <div className="h-px bg-white/5 my-1" />
          <MenuItem onClick={() => setView('templates')}>
            <LayoutTemplate size={13} /> Template for {group}…
            {currentTemplate && <span className="ml-auto text-[10px] text-neutral-500 truncate max-w-[80px]">{currentTemplate.name}</span>}
          </MenuItem>
          <MenuItem disabled={!currentSlideLabel} onClick={act(onUseCurrentLook)}>
            <Copy size={13} /> {currentSlideLabel ? `Use the look of ${currentSlideLabel}` : 'Use the look of the current slide'}
          </MenuItem>
        </>
      ) : (
        <>
          <MenuItem onClick={() => setView('main')}><ChevronLeft size={13} /> Template for {group}</MenuItem>
          <div className="h-px bg-white/5 my-1" />
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            {templates.map(t => (
              <React.Fragment key={t.id}>
                <MenuItem onClick={act(() => onSetTemplate(t.id))}>
                  <span className="truncate">{t.name}</span>
                  {t.id === templateId && <Check size={12} className="ml-auto shrink-0" />}
                </MenuItem>
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ onClick, disabled = false, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
