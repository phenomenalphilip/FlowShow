import React, { useState } from 'react';
import { Plus, Trash, Pencil, Check, X, Sparkles, Image as ImageIcon, Layers } from 'lucide-react';
import { PresentationStyle } from '../App';
import { PresentationTemplate } from '../lib/templates';
import { InlineTemplateGrid } from './TemplateGalleryModal';

interface StylesManagerProps {
  styles: PresentationStyle[];
  templates: PresentationTemplate[];
  onAdd: () => void;
  onUpdate: (style: PresentationStyle) => void;
  onDelete: (id: string) => void;
  onReloadTemplates?: () => void;
}

type StyleField = keyof PresentationStyle;

export function StylesManager({ styles, templates, onAdd, onUpdate, onDelete, onReloadTemplates }: StylesManagerProps) {
  const [selectedId, setSelectedId] = useState<string>(styles[0]?.id || '');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [pickingTemplateFor, setPickingTemplateFor] = useState<'lyrics' | 'scripture' | null>(null);
  const [templateCategory, setTemplateCategory] = useState('all');

  const selected = styles.find(s => s.id === selectedId) || styles[0];

  const update = (patch: Partial<PresentationStyle>) => {
    if (!selected) return;
    onUpdate({ ...selected, ...patch });
  };

  const templateName = (id?: string) =>
    id ? (templates.find(t => t.id === id)?.name || id) : 'None';

  if (pickingTemplateFor) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b border-white/5 shrink-0">
          <button onClick={() => setPickingTemplateFor(null)} className="p-1.5 rounded hover:bg-white/5 text-neutral-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
          <span className="text-sm font-bold text-white">
            Select {pickingTemplateFor === 'lyrics' ? 'Lyrics' : 'Scripture'} Template for "{selected?.name}"
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <InlineTemplateGrid
            templates={templates}
            category={templateCategory}
            onCategoryChange={setTemplateCategory}
            onLoadTemplates={() => onReloadTemplates?.()}
            onEdit={() => {}}
            onApplyToSong={(t) => {
              update(pickingTemplateFor === 'lyrics'
                ? { lyricsTemplateId: t.id }
                : { scriptureTemplateId: t.id });
              setPickingTemplateFor(null);
            }}
            activeSongId="__style_picker__"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0 overflow-hidden">

      {/* LEFT: style list */}
      <div className="w-48 shrink-0 border-r border-white/5 flex flex-col bg-[#0a0a0f]">
        <div className="p-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Styles</span>
          <button
            onClick={onAdd}
            className="w-6 h-6 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white flex items-center justify-center transition-all"
            title="New style"
          >
            <Plus size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {styles.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left px-3 py-2.5 text-xs font-medium transition-all flex items-center gap-2 group ${
                selectedId === s.id
                  ? 'bg-blue-600/20 text-white border-r-2 border-blue-500'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span
                className="w-3 h-3 rounded-sm border border-white/20 shrink-0"
                style={{ backgroundColor: s.backgroundColor }}
              />
              <span className="truncate flex-1">{s.name}</span>
              {s.id !== 'default' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); if (selectedId === s.id) setSelectedId(styles[0]?.id || ''); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all"
                  title="Delete"
                >
                  <Trash size={11} />
                </button>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: style editor */}
      {selected ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
          {/* Name */}
          <div className="flex items-center gap-2">
            {editingName ? (
              <>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { update({ name: nameInput }); setEditingName(false); } if (e.key === 'Escape') setEditingName(false); }}
                  className="bg-[#1e1e28] border border-blue-500 rounded px-2 py-1 text-sm text-white outline-none flex-1"
                />
                <button onClick={() => { update({ name: nameInput }); setEditingName(false); }} className="p-1 hover:text-blue-400"><Check size={14} /></button>
                <button onClick={() => setEditingName(false)} className="p-1 hover:text-red-400"><X size={14} /></button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <button onClick={() => { setNameInput(selected.name); setEditingName(true); }} className="p-1 text-neutral-500 hover:text-white"><Pencil size={13} /></button>
              </>
            )}
          </div>

          {/* Background */}
          <Section title="Background">
            <Row label="Color">
              <input
                type="color"
                value={selected.backgroundColor}
                onChange={e => update({ backgroundColor: e.target.value })}
                className="h-8 w-14 cursor-pointer border-none bg-transparent rounded"
              />
              <span className="text-xs text-neutral-400 font-mono">{selected.backgroundColor}</span>
            </Row>
            <Row label="Transition">
              <select
                value={selected.transition}
                onChange={e => update({ transition: e.target.value as PresentationStyle['transition'] })}
                className="bg-[#1e1e28] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none cursor-pointer"
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="zoom">Zoom</option>
              </select>
            </Row>
            <Row label="Media fit">
              <select
                value={selected.mediaFit}
                onChange={e => update({ mediaFit: e.target.value as PresentationStyle['mediaFit'] })}
                className="bg-[#1e1e28] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none cursor-pointer"
              >
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="fill">Fill</option>
                <option value="none">None</option>
              </select>
            </Row>
            <Row label="Aspect ratio">
              <select
                value={selected.aspectRatio}
                onChange={e => update({ aspectRatio: e.target.value as PresentationStyle['aspectRatio'] })}
                className="bg-[#1e1e28] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none cursor-pointer"
              >
                <option value="16:9">16:9</option>
                <option value="4:3">4:3</option>
                <option value="1:1">1:1</option>
              </select>
            </Row>
          </Section>

          {/* Active Layers */}
          <Section title="Active layers">
            {(['background', 'slide', 'overlays'] as const).map(layer => (
              <React.Fragment key={layer}><Row label={layer.charAt(0).toUpperCase() + layer.slice(1)}>
                <Toggle
                  checked={selected.activeLayers[layer]}
                  onChange={v => update({ activeLayers: { ...selected.activeLayers, [layer]: v } })}
                />
              </Row></React.Fragment>
            ))}
          </Section>

          {/* Templates */}
          <Section title="Slide templates">
            <Row label="Lyrics / Songs">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-300 truncate max-w-[120px]">{templateName(selected.lyricsTemplateId)}</span>
                <button
                  onClick={() => setPickingTemplateFor('lyrics')}
                  className="p-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-white transition-all"
                  title="Pick lyrics template"
                >
                  <Sparkles size={12} />
                </button>
                {selected.lyricsTemplateId && (
                  <button onClick={() => update({ lyricsTemplateId: undefined })} className="p-1 hover:text-red-400 text-neutral-500 transition-colors">
                    <X size={12} />
                  </button>
                )}
              </div>
            </Row>
            <Row label="Scripture">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-300 truncate max-w-[120px]">{templateName(selected.scriptureTemplateId)}</span>
                <button
                  onClick={() => setPickingTemplateFor('scripture')}
                  className="p-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-white transition-all"
                  title="Pick scripture template"
                >
                  <Sparkles size={12} />
                </button>
                {selected.scriptureTemplateId && (
                  <button onClick={() => update({ scriptureTemplateId: undefined })} className="p-1 hover:text-red-400 text-neutral-500 transition-colors">
                    <X size={12} />
                  </button>
                )}
              </div>
            </Row>
          </Section>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
          Select a style or create one.
        </div>
      )}
    </div>
  );
}

// ─── Small layout helpers ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111118] border border-white/5 rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-white/5 bg-[#0d0d14]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{title}</span>
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-neutral-400">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-9 h-5 bg-neutral-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
    </label>
  );
}
