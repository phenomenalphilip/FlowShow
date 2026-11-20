import React, { useEffect, useRef, useState } from 'react';
import { X, Music, Library, Sparkles, Layers, UserCircle2, Database, Keyboard, BookOpen, Rocket, Info, ExternalLink } from 'lucide-react';
import { APP_AUTHOR, APP_NAME, APP_ORGANISATION, APP_VERSION, APP_YEAR, DOCS_URL, OPEN_SOURCE, UPDATE_URL } from '../lib/appInfo';

// ─── A menu in the top bar (File, View, Help) ───────────────────────────────

export type MenuEntry = { label: string; shortcut?: string; onClick?: () => void; disabled?: boolean; hint?: string } | 'divider';

export function TopMenu({ label, entries }: { label: string; entries: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    // Caught before the app's own shortcuts, so Escape closes the menu instead of clearing the screens
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('pointerdown', onPointer, true); window.removeEventListener('keydown', onKey, true); };
  }, [open]);
  return (
    <div className="relative" ref={ref} data-top-menu={label}>
      <button type="button" onClick={() => setOpen(v => !v)} className={`px-1 hover:text-white ${open ? 'text-white' : ''}`}>{label}</button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-[160] min-w-56 py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl">
          {entries.map((e, i) => e === 'divider'
            ? <div key={i} className="my-1 border-t border-white/10" />
            : (
              <button
                key={e.label}
                type="button"
                disabled={e.disabled}
                title={e.hint}
                onClick={() => { setOpen(false); e.onClick?.(); }}
                className="w-full px-3 py-1.5 flex items-center gap-4 text-left text-xs text-neutral-200 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap"
              >
                <span className="flex-1">{e.label}</span>
                {e.shortcut && <span className="text-[10px] text-neutral-500 font-mono">{e.shortcut}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Dialog frame ───────────────────────────────────────────────────────────

export function Dialog({ title, icon: Icon, onClose, children, wide = false }: { title: string; icon: typeof Info; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-app-dialog={title}>
      <div className={`bg-[#09090B] border border-white/10 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} flex flex-col overflow-hidden max-h-full`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><Icon size={17} className="text-pink-400" /> {title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── File → Export… ─────────────────────────────────────────────────────────

export type ExportChoice = 'song' | 'songs' | 'template' | 'templates' | 'profile' | 'database';

export function ExportDialog({ onClose, onChoose, songTitle, songCount, templateCount, profileName }: {
  onClose: () => void;
  onChoose: (choice: ExportChoice) => void;
  songTitle?: string;
  songCount: number;
  templateCount: number;
  profileName: string;
}) {
  const options: { id: ExportChoice; Icon: typeof Info; title: string; detail: string; disabled?: boolean }[] = [
    { id: 'song', Icon: Music, title: 'This song', detail: songTitle ? `“${songTitle}”` : 'Open a song first', disabled: !songTitle },
    { id: 'songs', Icon: Library, title: 'All songs', detail: `${songCount} shows, songs and declarations` },
    { id: 'template', Icon: Sparkles, title: 'A template', detail: 'Choose which, then save it as a package' },
    { id: 'templates', Icon: Layers, title: 'All templates', detail: `${templateCount} templates in one package` },
    { id: 'profile', Icon: UserCircle2, title: 'This profile', detail: `“${profileName}”: screens, styles, stage layouts and the templates they use` },
    { id: 'database', Icon: Database, title: 'Entire database', detail: 'A full backup: songs, projects, settings, profiles, templates, Bibles and fonts' },
  ];
  return (
    <Dialog title="Export" icon={Layers} onClose={onClose}>
      <div className="space-y-1.5" data-export-choices>
        {options.map(o => (
          <button key={o.id} type="button" disabled={o.disabled} onClick={() => { onClose(); onChoose(o.id); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-pink-500/40 text-left disabled:opacity-40 disabled:hover:bg-transparent">
            <o.Icon size={16} className="text-pink-400 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-white">{o.title}</span>
              <span className="block text-[11px] text-neutral-400 truncate">{o.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

// ─── Help ───────────────────────────────────────────────────────────────────

const SHORTCUTS: [string, [string, string][]][] = [
  ['Presenting', [
    ['Next slide', 'Space · → · ↓ · Page Down'],
    ['Previous slide', '← · ↑ · Page Up'],
    ['Screens on / off (present)', 'B · F1'],
    ['Clear the text', 'C · F2'],
    ['Clear the background', 'L · F3'],
    ['Clear everything', 'Esc'],
  ]],
  ['Editing', [
    ['Undo', 'Ctrl + Z'],
    ['Redo', 'Ctrl + Y · Ctrl + Shift + Z'],
    ['Save typed words (Design mode)', 'Ctrl + Enter'],
    ['Edit a slide’s words (Design mode)', 'Double-click the text'],
  ]],
  ['Scripture', [
    ['Finish the book or chapter while typing a reference', 'Space · →'],
    ['Show the verse typed', 'Enter'],
    ['Put a verse on the screens', 'Double-click it'],
  ]],
  ['View', [
    ['Focus mode', 'Ctrl + Shift + F'],
    ['Full screen', 'F11'],
  ]],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" icon={Keyboard} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {SHORTCUTS.map(([section, rows]) => (
          <div key={section}>
            <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 mb-1.5">{section}</div>
            {rows.map(([what, keys]) => (
              <div key={what} className="flex items-start justify-between gap-3 py-1 text-xs border-b border-white/5">
                <span className="text-neutral-300">{what}</span>
                <span className="font-mono text-[11px] text-pink-300 text-right shrink-0">{keys}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function QuickStartDialog({ onClose }: { onClose: () => void }) {
  const steps: [string, string][] = [
    ['Set up your screens', 'Settings (the gear, top right) → Outputs: add a screen for the projector, an NDI feed or a stage display, and choose Normal or Stage.'],
    ['Bring in your songs', 'Click + beside Projects → Import, or File → Import, for FreeShow, ProPresenter, Word and text files. Or + → New show to type one. Each show is a Song or a Declaration.'],
    ['Add a Bible', 'Open the Scripture tab → Import Bible (Zefania, OpenSong, Beblia, OSIS or USFX XML).'],
    ['Plan the service', '+ → Project makes a project for the service. Drag songs, media and verses into it, add section headers with a right-click, and drag to reorder.'],
    ['Choose the look', 'Pick templates in the Templates tab, or set them per screen in Settings → Styles. Use Design mode to style lyrics, declarations and scripture live, and the Stage tab for stage screens.'],
    ['Go live', 'Press B to turn the screens on. Click a slide (or use the arrow keys) to show it; C clears the text, Esc clears everything.'],
    ['Take it with you', 'Profile (top bar) keeps a screen setup per venue. File → Export saves songs, templates, profiles or a full backup.'],
  ];
  return (
    <Dialog title="Quick start" icon={Rocket} onClose={onClose} wide>
      <ol className="space-y-3">
        {steps.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-pink-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <div>
              <div className="text-sm font-semibold text-white">{title}</div>
              <p className="text-xs text-neutral-400 leading-relaxed">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={`About ${APP_NAME}`} icon={Info} onClose={onClose}>
      <div className="space-y-4 text-xs text-neutral-300" data-about>
        <div>
          <div className="text-2xl font-black text-pink-500 tracking-wide">{APP_NAME}</div>
          <div className="text-sm text-white font-semibold">Version {APP_VERSION}</div>
          <p className="mt-2 leading-relaxed">Made by {APP_AUTHOR} of {APP_ORGANISATION} ({APP_YEAR}).</p>
          <p className="text-neutral-500">© {APP_YEAR} {APP_ORGANISATION}. All rights reserved.</p>
        </div>
        <button
          type="button"
          disabled={!UPDATE_URL}
          onClick={() => UPDATE_URL && window.open(UPDATE_URL, '_blank')}
          className="w-full py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:bg-white/5 disabled:text-neutral-500"
          title={UPDATE_URL ? 'Get the newest version from the website' : 'Updates from the website are coming soon'}
        >
          <ExternalLink size={14} /> {UPDATE_URL ? 'Check for updates on the website' : 'Updates from the website: coming soon'}
        </button>
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 mb-1">Built with open-source software</div>
          <div className="grid grid-cols-2 gap-x-4 text-[11px] text-neutral-400">
            {OPEN_SOURCE.map(o => <div key={o.name} className="flex justify-between gap-2"><span>{o.name}</span><span className="text-neutral-500">{o.licence}</span></div>)}
          </div>
        </div>
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          Bible translations and song lyrics you import belong to their copyright holders. Make sure your church has the right
          licences (for example CCLI for songs) to show them.
        </p>
      </div>
    </Dialog>
  );
}

export const DocumentationDialog = ({ onClose }: { onClose: () => void }) => (
  <Dialog title="Documentation" icon={BookOpen} onClose={onClose}>
    <p className="text-sm text-neutral-300 leading-relaxed">
      {DOCS_URL ? <>The documentation is on our website.</> : <>The online documentation is coming soon. Until then, see Help → Quick start guide and Help → Shortcuts.</>}
    </p>
  </Dialog>
);
