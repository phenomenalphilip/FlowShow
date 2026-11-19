import React, { useState } from 'react';
import { X, Upload, Activity, Check, AlertTriangle } from 'lucide-react';
import { IMPORT_ACCEPT, IMPORT_FORMATS, ImportedShow, importShowFiles } from '../lib/importers';
import type { ShowCategory } from './AddSongModal';

interface ImportShowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Add the imported shows to the library, as Songs or Declarations */
  onImport: (shows: ImportedShow[], category: ShowCategory) => void;
}

/** Import songs (or a whole song library) from FreeShow, ProPresenter, Word or text files */
export function ImportShowsModal({ isOpen, onClose, onImport }: ImportShowsModalProps) {
  const [category, setCategory] = useState<ShowCategory>('Songs');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ shows: ImportedShow[]; problems: string[] } | null>(null);
  if (!isOpen) return null;

  const close = () => { setDone(null); setBusy(false); onClose(); };
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files: File[] = Array.from((input.files || []) as FileList);
    input.value = '';
    if (!files.length) return;
    setBusy(true);
    setDone(null);
    try {
      const read = await Promise.all(files.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const result = await importShowFiles(read);
      if (result.shows.length) onImport(result.shows, category);
      setDone(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" data-import-shows>
      <div className="bg-[#09090B] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-full">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="text-lg font-bold text-white tracking-tight">Import songs</h2>
          <button onClick={close} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Import as</label>
            <div className="flex bg-[#030303] rounded-lg p-1.5 border border-white/5">
              {([['Songs', 'Songs'], ['Declarations', 'Declarations']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setCategory(value)}
                  className={`flex-1 text-sm font-semibold py-2 rounded-md transition-all ${category === value ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Choose one or more files: {IMPORT_FORMATS}. A Word document with a heading above each song imports every song in it.
            Groups (Verse 1, Chorus…) are kept, or worked out from the words.
          </p>
          <label className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-colors ${busy ? 'bg-pink-600/40 text-white/70 cursor-wait' : 'bg-pink-600 hover:bg-pink-500 text-white cursor-pointer'}`}>
            {busy ? <Activity size={16} className="animate-spin" /> : <Upload size={16} />}
            {busy ? 'Importing…' : 'Choose files…'}
            <input type="file" multiple accept={IMPORT_ACCEPT} className="hidden" onChange={pick} disabled={busy} />
          </label>
          {done && (
            <div className="space-y-2 text-xs" data-import-result>
              {done.shows.length > 0 && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200">
                  <div className="flex items-center gap-1.5 font-semibold mb-1"><Check size={13} /> Imported {done.shows.length} {done.shows.length === 1 ? 'show' : 'shows'}</div>
                  <ul className="space-y-0.5 text-emerald-100/80 max-h-40 overflow-y-auto">
                    {done.shows.map((s, i) => <li key={i}>{s.title} · {s.slides.length} slides{s.slides.some(x => x.group) ? ` · ${[...new Set(s.slides.map(x => x.group).filter(Boolean))].join(', ')}` : ''}</li>)}
                  </ul>
                </div>
              )}
              {done.problems.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold mb-1"><AlertTriangle size={13} /> Not imported</div>
                  <ul className="space-y-0.5 text-amber-100/80">{done.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="p-5 border-t border-white/5 flex justify-end">
          <button onClick={close} className="px-6 py-2.5 rounded-lg text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}
