import React, { useRef, useState } from 'react';
import {
  Upload, ClipboardPaste, FileText, FileSpreadsheet, Music, Music2, Monitor, Presentation, FileType2, BookOpen,
  Library, ListMusic, Guitar, ScrollText, ArrowLeft, Package,
} from 'lucide-react';
import { Dialog } from './AppMenus';
import { IMPORT_SOURCES, ImportSource } from '../lib/importers';
import type { ShowCategory } from './AddSongModal';
import { openLibreOfficePage, pdfConverter } from '../lib/pages';

/** What a chosen file is meant to be: FlowShow's own files and Bibles go one way, songs from other programs another */
export type ImportKind = ImportSource | 'flowshow' | 'bible' | 'pdf' | 'powerpoint';

interface Tile {
  kind: ImportKind | 'clipboard';
  label: string;
  hint: string;
  Icon: typeof Upload;
  colour: string;
  accept?: string;
  /** Not available yet: shown, but can't be picked */
  soon?: string;
}

const src = (kind: ImportSource, Icon: typeof Upload, colour: string): Tile =>
  ({ kind, label: IMPORT_SOURCES[kind].label, hint: IMPORT_SOURCES[kind].hint, Icon, colour, accept: IMPORT_SOURCES[kind].accept });

const SECTIONS: { title: string; tiles: Tile[] }[] = [
  {
    title: 'FlowShow',
    tiles: [
      { kind: 'flowshow', label: 'FlowShow files', hint: 'songs, templates, profiles, backups', Icon: Package, colour: '#ec4899', accept: '.flowshow-songs,.fstemplates,.flowshow-profile,.flowshow-backup' },
      { kind: 'clipboard', label: 'Clipboard', hint: 'paste the words of a song', Icon: ClipboardPaste, colour: '#a78bfa' },
    ],
  },
  {
    title: 'Songs from other programs',
    tiles: [
      src('freeshow', Monitor, '#f472b6'),
      src('propresenter', Presentation, '#fb923c'),
      { kind: 'freeshow', label: 'EasyWorship', hint: 'coming soon', Icon: Library, colour: '#38bdf8', soon: 'EasyWorship import is being built. Send a sample file and your EasyWorship version to help finish it. For now, export the songs from EasyWorship as text files and use Text file.' },
      src('openlyrics', ListMusic, '#60a5fa'),
      src('opensong', Music2, '#c084fc'),
    ],
  },
  {
    title: 'Documents and text',
    tiles: [
      src('word', FileType2, '#3b82f6'),
      src('text', FileText, '#f59e0b'),
      src('chordpro', Guitar, '#facc15'),
      src('csv', FileSpreadsheet, '#22c55e'),
      { kind: 'pdf', label: 'PDF', hint: 'each page becomes a slide', Icon: ScrollText, colour: '#ef4444', accept: '.pdf' },
      { kind: 'powerpoint', label: 'PowerPoint', hint: 'each slide, as it looks', Icon: Presentation, colour: '#f97316', accept: '.pptx,.ppt,.pptm,.ppsx,.pps,.odp' },
    ],
  },
  {
    title: 'Scripture',
    tiles: [
      { kind: 'bible', label: 'Bible', hint: 'XML Bible (Zefania, Beblia, OSIS…)', Icon: BookOpen, colour: '#fbbf24', accept: '.xml' },
    ],
  },
];

/** File → Import: pick what to import, then choose the files (or paste the words) */
export function ImportChooser({ onClose, onFiles, onPaste }: {
  onClose: () => void;
  onFiles: (kind: ImportKind, files: File[]) => void;
  onPaste: (title: string, text: string, category: ShowCategory) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState<ImportKind | null>(null);
  const [soon, setSoon] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ShowCategory>('Songs');

  // PowerPoint needs PowerPoint or LibreOffice on this computer: warn before a file is even chosen
  const [needConverter, setNeedConverter] = useState(false);
  const choose = async (t: Tile) => {
    setSoon(null);
    setNeedConverter(false);
    if (t.soon) { setSoon(t.soon); return; }
    if (t.kind === 'powerpoint' && !(await pdfConverter())) { setNeedConverter(true); return; }
    if (t.kind === 'clipboard') {
      setPasting(true);
      // Fill in what's on the clipboard when the browser allows it; otherwise paste with Ctrl+V
      try { const clip = await navigator.clipboard.readText(); if (clip.trim()) setText(clip); } catch { /* paste by hand */ }
      return;
    }
    setPicking(t.kind);
    const input = inputRef.current!;
    input.accept = t.accept || '';
    input.click();
  };

  if (pasting) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    return (
      <Dialog title="Import from clipboard" icon={ClipboardPaste} onClose={onClose} wide>
        <div className="space-y-3" data-import-paste>
          <button type="button" onClick={() => setPasting(false)} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white"><ArrowLeft size={13} /> All import options</button>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={lines[0] ? `Title (${lines[0].slice(0, 40)})` : 'Title'} className="w-full bg-[#030303] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500" data-paste-title />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            rows={12}
            placeholder={'Paste the words here (Ctrl+V).\n\nLeave a blank line between verses. Labels such as "Verse 1" or "Chorus" on their own line are kept.'}
            className="w-full bg-[#030303] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500 font-mono resize-y"
            data-paste-text
          />
          <div className="flex items-center gap-2">
            <div className="flex bg-[#030303] rounded-lg p-1 border border-white/5">
              {(['Songs', 'Declarations'] as const).map(c => (
                <button key={c} type="button" onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${category === c ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>{c === 'Songs' ? 'Song' : 'Declaration'}</button>
              ))}
            </div>
            <button
              type="button"
              disabled={!lines.length}
              onClick={() => { onPaste(title.trim() || lines[0].slice(0, 60), text, category); onClose(); }}
              className="ml-auto px-5 py-2 rounded-lg text-sm font-bold bg-pink-600 hover:bg-pink-500 text-white disabled:opacity-40"
              data-paste-import
            >
              Import
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Import" icon={Upload} onClose={onClose} wide>
      <div className="space-y-5" data-import-chooser>
        {SECTIONS.map(section => (
          <div key={section.title}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{section.title}</span>
              <span className="flex-1 h-px bg-white/5" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {section.tiles.map(t => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => void choose(t)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-colors ${t.soon ? 'border-white/5 bg-white/[0.02] opacity-50 hover:opacity-70' : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/15'}`}
                  data-import-option={t.label}
                >
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.colour}22`, color: t.colour }}><t.Icon size={18} /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">{t.label}</span>
                    <span className="block text-[11px] text-neutral-500 truncate">{t.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {soon && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200" data-import-soon>{soon}</div>}
        {needConverter && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100 space-y-2" data-import-need-converter>
            <div className="text-sm font-bold text-amber-300">PowerPoint or LibreOffice needed</div>
            <p className="leading-relaxed">To bring in PowerPoint slides as they look, FlowShow needs PowerPoint or LibreOffice on this computer. LibreOffice is free: install it, then import again.</p>
            <p className="leading-relaxed text-amber-200/80">Or open the file in PowerPoint, choose File → Save As → PDF, and import the PDF.</p>
            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={() => void openLibreOfficePage()} className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-black font-semibold" data-get-libreoffice>Get LibreOffice (free)</button>
              <button type="button" onClick={() => setNeedConverter(false)} className="px-3 py-1.5 rounded-md text-amber-200 hover:bg-white/5">OK</button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-neutral-500 flex items-center gap-1.5"><Music size={12} /> A .zip of song files works too, from any of the song options.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files: File[] = Array.from((e.target.files || []) as FileList);
          e.target.value = '';
          if (files.length && picking) { onFiles(picking, files); onClose(); }
        }}
        data-import-chooser-input
      />
    </Dialog>
  );
}
