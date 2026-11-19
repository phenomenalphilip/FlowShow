import React, { useState } from 'react';
import { Check, Copy, Download, Pencil, Plus, Trash, Upload, ArrowRightLeft } from 'lucide-react';
import type { ProfileRecord } from '../lib/profiles';
import { PROFILE_EXTENSION } from '../lib/profiles';

export interface ProfilesApi {
  profiles: ProfileRecord[];
  activeId: string;
  onSwitch: (id: string) => void;
  /** New profile: a copy of the current setup, or FlowShow's starting setup */
  onCreate: (name: string, copyCurrent: boolean) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  /** Returns a message to show */
  onImport: (file: File) => Promise<string>;
}

const btn = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

/** Settings → Profiles: a whole screen setup per venue, switch between them, export and import them */
export function ProfilesPanel({ profiles, activeId, onSwitch, onCreate, onRename, onDuplicate, onDelete, onExport, onImport }: ProfilesApi) {
  const [message, setMessage] = useState<string | null>(null);
  const create = (copyCurrent: boolean) => {
    const name = window.prompt(copyCurrent ? 'Name for the new profile (a copy of this setup)' : 'Name for the new profile (FlowShow’s starting setup)', 'New venue')?.trim();
    if (name) { onCreate(name, copyCurrent); setMessage(`Made "${name}" and switched to it. Your other profiles are unchanged.`); }
  };
  const rename = (p: ProfileRecord) => {
    const name = window.prompt('Profile name', p.name)?.trim();
    if (name && name !== p.name) onRename(p.id, name);
  };
  const remove = (p: ProfileRecord) => {
    if (window.confirm(`Delete the profile "${p.name}"? Its screens and styles are removed. Songs and templates stay.`)) onDelete(p.id);
  };
  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setMessage(await onImport(file));
  };

  return (
    <div className="space-y-5" data-profiles-panel>
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Profiles</h2>
        <p className="text-sm text-neutral-400 mt-1 max-w-2xl leading-relaxed">
          A profile keeps a whole screen setup: the outputs, styles, templates the screens use and stage layouts. Make one for each venue,
          then switch back to your main one when you return. Songs, Bibles and the template library are shared by all profiles.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => create(true)} className={`${btn} bg-pink-600 hover:bg-pink-500 text-white`}><Plus size={13} /> New profile (copy this setup)</button>
        <button type="button" onClick={() => create(false)} className={`${btn} bg-white/5 hover:bg-white/10 text-neutral-200`}><Plus size={13} /> New blank profile</button>
        <label className={`${btn} bg-white/5 hover:bg-white/10 text-neutral-200 cursor-pointer`}>
          <Upload size={13} /> Import profile…
          <input type="file" accept={`${PROFILE_EXTENSION},.json`} className="hidden" onChange={importFile} />
        </label>
      </div>
      {message && <div className="text-xs text-emerald-300" data-profiles-message>{message}</div>}
      <div className="rounded-xl border border-white/5 divide-y divide-white/5 overflow-hidden">
        {profiles.map(p => {
          const active = p.id === activeId;
          const screens = (active ? null : p.settings?.outputs?.length);
          return (
            <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${active ? 'bg-pink-500/10' : 'bg-[#111118]'}`} data-profile={p.name}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  {p.name}
                  {active && <span className="px-1.5 py-0.5 rounded bg-pink-600 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><Check size={10} /> In use</span>}
                </div>
                <div className="text-[11px] text-neutral-500">{screens != null ? `${screens} output${screens === 1 ? '' : 's'} · ` : ''}changed {new Date(p.updatedAt).toLocaleString()}</div>
              </div>
              {!active && <button type="button" onClick={() => { onSwitch(p.id); setMessage(`Switched to "${p.name}".`); }} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}><ArrowRightLeft size={13} /> Switch to</button>}
              <button type="button" onClick={() => rename(p)} className={`${btn} bg-white/5 hover:bg-white/10 text-neutral-300`} title="Rename"><Pencil size={13} /></button>
              <button type="button" onClick={() => onDuplicate(p.id)} className={`${btn} bg-white/5 hover:bg-white/10 text-neutral-300`} title="Duplicate"><Copy size={13} /></button>
              <button type="button" onClick={() => onExport(p.id)} className={`${btn} bg-white/5 hover:bg-white/10 text-neutral-300`} title="Export to a file (with the templates it uses)"><Download size={13} /></button>
              <button type="button" disabled={active} onClick={() => remove(p)} className={`${btn} bg-white/5 hover:bg-red-500/20 text-red-300`} title={active ? 'Switch to another profile first' : 'Delete'}><Trash size={13} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
