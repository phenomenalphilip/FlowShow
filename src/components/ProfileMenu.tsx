import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Plus, Settings2, Upload, UserCircle2 } from 'lucide-react';
import type { ProfileRecord } from '../lib/profiles';
import { PROFILE_EXTENSION } from '../lib/profiles';

interface ProfileMenuProps {
  profiles: ProfileRecord[];
  activeId: string;
  onSwitch: (id: string) => void;
  onDuplicate: () => void;
  onNew: () => void;
  onExport: () => void;
  /** Returns a message to show */
  onImport: (file: File) => Promise<string>;
  onManage: () => void;
  onMessage: (text: string) => void;
}

/** The Profile menu in the top bar: the profiles (click one to switch to it), duplicate, new, export and import */
export function ProfileMenu({ profiles, activeId, onSwitch, onDuplicate, onNew, onExport, onImport, onManage, onMessage }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = profiles.find(p => p.id === activeId);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    // Caught before the app's own shortcuts, so Escape closes the menu instead of clearing the screens
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('pointerdown', onPointer, true); window.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const act = (fn: () => void) => () => { setOpen(false); fn(); };
  const item = 'w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs text-neutral-200 hover:bg-white/10 transition-colors';

  return (
    <div className="relative" ref={ref} data-profile-menu>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 px-1 hover:text-white ${open ? 'text-white' : ''}`}
        title={`Profile in use: ${active?.name || 'Main'}`}
      >
        Profile
        <span className="max-w-[110px] truncate px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-semibold text-pink-300">{active?.name || 'Main'}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-[160] w-64 py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl">
          <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase font-bold tracking-wider text-neutral-500">Profiles · click to switch</div>
          <div className="max-h-64 overflow-y-auto">
            {profiles.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={act(() => { if (p.id !== activeId) onSwitch(p.id); })}
                className={`${item} ${p.id === activeId ? 'text-white font-semibold' : ''}`}
                data-profile-item={p.name}
              >
                <span className="w-3.5 shrink-0">{p.id === activeId ? <Check size={13} className="text-pink-400" /> : <UserCircle2 size={13} className="text-neutral-500" />}</span>
                <span className="truncate flex-1">{p.name}</span>
                {p.id === activeId && <span className="text-[10px] text-pink-300">in use</span>}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-white/10" />
          <button type="button" onClick={act(onDuplicate)} className={item}><Copy size={13} className="text-neutral-400" /> Duplicate “{active?.name || 'Main'}”</button>
          <button type="button" onClick={act(onNew)} className={item}><Plus size={13} className="text-neutral-400" /> New blank profile…</button>
          <div className="my-1 border-t border-white/10" />
          <button type="button" onClick={act(onExport)} className={item} title="Settings, screens/outputs, styles, stage layouts and the templates they use"><Download size={13} className="text-neutral-400" /> Export this profile…</button>
          <button type="button" onClick={() => fileRef.current?.click()} className={item}><Upload size={13} className="text-neutral-400" /> Import a profile…</button>
          <input
            ref={fileRef}
            type="file"
            accept={`${PROFILE_EXTENSION},.json`}
            className="hidden"
            onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; setOpen(false); if (file) onMessage(await onImport(file)); }}
          />
          <div className="my-1 border-t border-white/10" />
          <button type="button" onClick={act(onManage)} className={item}><Settings2 size={13} className="text-neutral-400" /> Manage profiles…</button>
        </div>
      )}
    </div>
  );
}
