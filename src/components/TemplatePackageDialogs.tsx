import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, Upload, Check, AlertTriangle, Package, Type } from 'lucide-react';
import { PresentationTemplate } from '../lib/templates';
import {
  PACKAGE_EXTENSION, TemplatePackage, buildPackage, fontsUsedBy, installPackage, isFlowShowFont, readPackage, installAction,
} from '../lib/templatePackages';
import { FixedStage } from './FixedStage';
import { SmartTextLayout } from './SmartTextLayout';

const field = 'w-full bg-white/5 border border-white/10 rounded-lg text-sm px-3 py-2 text-white focus:outline-none focus:border-pink-500';
const label = 'block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1';

function Shell({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" data-template-package-dialog>
      <div className="bg-[#09090B] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-full">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2"><Package size={18} className="text-pink-400" /> {title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">{children}</div>
        <div className="p-5 border-t border-white/5 flex justify-end gap-3">{footer}</div>
      </div>
    </div>
  );
}

function Thumb({ t }: { t: PresentationTemplate }) {
  const scripture = t.category === 'scripture';
  return (
    <div className="aspect-video w-full relative overflow-hidden rounded" style={{ background: t.backgroundPreview || '#09090b' }}>
      <FixedStage className="w-full h-full pointer-events-none">
        <SmartTextLayout
          text={scripture ? 'For God so loved the world' : 'AMAZING GRACE\nHOW SWEET THE SOUND'}
          source={scripture ? 'John 3:16' : undefined}
          type={scripture ? 'scripture' : undefined}
          animation={{ ...t.animation, exit: undefined }}
          styleOverrides={{ ...t.styles }}
          className="w-full h-full"
        />
      </FixedStage>
    </div>
  );
}

/** Save templates as a package file other FlowShow users can install */
export function ExportTemplatesDialog({ templates, initialIds, onClose }: { templates: PresentationTemplate[]; initialIds?: string[]; onClose: () => void }) {
  // Starts with the template right-clicked, or else your own templates
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initialIds ?? templates.filter(t => t.isCustom).map(t => t.id)));
  const first = initialIds?.length === 1 ? templates.find(t => t.id === initialIds[0]) : undefined;
  const [info, setInfo] = useState({ name: first?.name || '', author: '', version: '1.0', description: first?.description || '', license: '', website: '' });
  const [fontFiles, setFontFiles] = useState<{ family: string; file: File }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const picked = templates.filter(t => chosen.has(t.id));
  const fonts = useMemo(() => fontsUsedBy(picked).filter(f => !isFlowShowFont(f)), [picked]);
  const toggle = (id: string) => setChosen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = async () => {
    if (!picked.length || !info.name.trim() || !info.author.trim()) { setMessage('Choose at least one template and give the package a name and an author.'); return; }
    setBusy(true);
    try {
      const blob = await buildPackage({ ...info, name: info.name.trim(), author: info.author.trim() }, picked, fontFiles);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${info.name.trim().replace(/[\\/:*?"<>|]/g, '')}${PACKAGE_EXTENSION}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setMessage(`Saved "${a.download}" with ${picked.length} template${picked.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setMessage(`Couldn't save the package: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(false); }
  };

  return (
    <Shell title="Export templates" onClose={onClose} footer={<>
      {message && <span className="mr-auto self-center text-xs text-neutral-300" data-export-message>{message}</span>}
      <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-white/5">Close</button>
      <button onClick={save} disabled={busy} className="px-6 py-2 rounded-lg text-sm font-bold bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-2 disabled:opacity-50"><Download size={15} /> Save package</button>
    </>}>
      <div>
        <span className={label}>Templates in the package ({picked.length})</span>
        <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
          {templates.map(t => (
            <button key={t.id} type="button" onClick={() => toggle(t.id)} className={`rounded-lg border p-1 text-left transition-colors ${chosen.has(t.id) ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 hover:border-white/30'}`}>
              <Thumb t={t} />
              <span className="flex items-center gap-1 mt-1 text-[10px] text-neutral-200 truncate">{chosen.has(t.id) && <Check size={10} className="text-pink-400 shrink-0" />}{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label><span className={label}>Package name</span><input className={field} value={info.name} onChange={e => setInfo({ ...info, name: e.target.value })} placeholder="e.g. Sunday Classics" /></label>
        <label><span className={label}>Author / company</span><input className={field} value={info.author} onChange={e => setInfo({ ...info, author: e.target.value })} placeholder="Your name or business" /></label>
        <label><span className={label}>Version</span><input className={field} value={info.version} onChange={e => setInfo({ ...info, version: e.target.value })} /></label>
        <label><span className={label}>Website (https://…)</span><input className={field} value={info.website} onChange={e => setInfo({ ...info, website: e.target.value })} /></label>
      </div>
      <label className="block"><span className={label}>Description</span><textarea className={`${field} h-16 resize-none`} value={info.description} onChange={e => setInfo({ ...info, description: e.target.value })} /></label>
      <label className="block"><span className={label}>Licence (what buyers may do with them)</span><textarea className={`${field} h-14 resize-none`} value={info.license} onChange={e => setInfo({ ...info, license: e.target.value })} placeholder="e.g. Licensed for use by one church. Not for resale." /></label>
      {fonts.length > 0 && (
        <div>
          <span className={label}>Fonts these templates need</span>
          <p className="text-[11px] text-neutral-500 mb-2">Other computers need these fonts. Include a font file only if its licence lets you share it.</p>
          <div className="space-y-1.5">
            {fonts.map(family => {
              const attached = fontFiles.find(f => f.family === family);
              return (
                <div key={family} className="flex items-center gap-2 text-xs">
                  <Type size={13} className="text-neutral-500" />
                  <span className="text-neutral-200 flex-1" style={{ fontFamily: `"${family}"` }}>{family}</span>
                  {attached ? <span className="text-emerald-300 truncate max-w-[180px]">{attached.file.name}</span> : <span className="text-amber-300">not included</span>}
                  <label className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-neutral-200 cursor-pointer">
                    {attached ? 'Change' : 'Include font file…'}
                    <input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) setFontFiles(prev => [...prev.filter(f => f.family !== family), { family, file }]); e.target.value = ''; }} />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Install a template package: shows what's in it first */
/** Install a template package: shows what's in it first. initialFile: a package already chosen (File → Import) */
export function ImportTemplatesDialog({ onClose, onInstalled, initialFile }: { onClose: () => void; onInstalled?: () => void; initialFile?: File }) {
  const [pkg, setPkg] = useState<TemplatePackage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File) => {
    setProblem(null); setDone(null); setPkg(null);
    try { setPkg(await readPackage(file)); } catch (err) { setProblem(err instanceof Error ? err.message : String(err)); }
  };
  const open = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await readFile(file);
  };
  useEffect(() => { if (initialFile) void readFile(initialFile); }, [initialFile]);
  const install = async () => {
    if (!pkg) return;
    setBusy(true);
    try {
      const r = await installPackage(pkg);
      setDone(`Installed "${pkg.package.name}": ${r.added} new, ${r.updated} updated${r.unchanged ? `, ${r.unchanged} already up to date` : ''}${r.fonts ? `, ${r.fonts} font${r.fonts === 1 ? '' : 's'}` : ''}.`);
      onInstalled?.();
    } catch (err) {
      setProblem(`Couldn't install: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(false); }
  };
  const actions = pkg ? pkg.templates.map(t => installAction(pkg, t)) : [];
  const updating = actions.filter(a => a !== 'add').length;
  const nothingToDo = !!pkg && actions.every(a => a === 'same');

  return (
    <Shell title="Import templates" onClose={onClose} footer={<>
      {done && <span className="mr-auto self-center text-xs text-emerald-300 flex items-center gap-1" data-import-message><Check size={13} /> {done}</span>}
      <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-white/5">Close</button>
      {pkg && !done && nothingToDo && <span className="mr-auto self-center text-xs text-neutral-400">Every template in this package is already installed and up to date.</span>}
      {pkg && !done && !nothingToDo && <button onClick={install} disabled={busy} className="px-6 py-2 rounded-lg text-sm font-bold bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-2 disabled:opacity-50"><Download size={15} /> {updating ? 'Install / update' : 'Install'}</button>}
    </>}>
      <label className="w-full py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-bold bg-white/5 hover:bg-white/10 text-white cursor-pointer border border-white/10">
        <Upload size={16} /> Choose a template package ({PACKAGE_EXTENSION})…
        <input type="file" accept={`${PACKAGE_EXTENSION},.json`} className="hidden" onChange={open} />
      </label>
      {problem && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 flex gap-2" data-import-problem><AlertTriangle size={14} className="shrink-0" /> {problem}</div>}
      {pkg && (
        <div className="space-y-3" data-package-preview>
          <div>
            <div className="text-base font-bold text-white">{pkg.package.name} <span className="text-xs font-normal text-neutral-400">version {pkg.package.version}</span></div>
            <div className="text-xs text-neutral-400">by {pkg.package.author}{pkg.package.website && <> · <span className="text-neutral-300">{pkg.package.website}</span></>}</div>
            {pkg.package.description && <p className="text-xs text-neutral-300 mt-1.5 whitespace-pre-wrap">{pkg.package.description}</p>}
          </div>
          {pkg.package.license && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] text-neutral-300 whitespace-pre-wrap"><span className="font-bold text-neutral-400 uppercase text-[10px] block mb-0.5">Licence</span>{pkg.package.license}</div>}
          <div className="grid grid-cols-4 gap-2">
            {pkg.templates.map(t => (
              <div key={t.id}>
                <Thumb t={t} />
                <div className="text-[10px] text-neutral-200 mt-1 truncate">{t.name}{actions[pkg.templates.indexOf(t)] === 'update' ? ' · update' : actions[pkg.templates.indexOf(t)] === 'same' ? ' · already installed' : ''}</div>
              </div>
            ))}
          </div>
          {pkg.fonts.length > 0 && (
            <div className="text-xs space-y-1">
              <span className={label}>Fonts</span>
              {pkg.fonts.map(f => (
                <div key={f.family} className="flex items-center gap-2">
                  <Type size={12} className="text-neutral-500" /> <span className="text-neutral-200 flex-1">{f.family}</span>
                  {f.file ? <span className="text-emerald-300">included, will be installed</span> : <span className="text-amber-300">not included: install it on this computer</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}
