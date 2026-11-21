import React, { useEffect, useRef, useState } from 'react';
import { useDeleteKey } from '../lib/deleteKey';
import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Eye, EyeOff, Image as ImageIcon, Plus, Trash2, Type } from 'lucide-react';
import { FixedStage } from './FixedStage';
import { DesignBox, InlineTextEditor } from './DesignCanvas';
import { SHADOW_PRESETS } from '../lib/designPresets';
import {
  DesignFor, DesignForSwitch, Divider, FontSelect, GroupLabel, SizeStepper, ColorField, TextPositionSwitch,
  WEIGHTS, selectCls, segBtn, smallBtn,
} from './DesignControls';
import { DesignMediaControls, chooseDesignMediaFile, newDesignMedia, type DesignMedia } from '../lib/designMedia';
import { NEW_OVERLAY_TEXT_LAYOUT, NEW_OVERLAY_TEXT_STYLE, Overlay, OverlayContent, OverlayText } from '../lib/overlays';

type Phase = 'draft' | 'commit';
type Sel = { kind: 'text' | 'media'; id: string } | null;
const parseNum = (v: unknown, fallback: number) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : fallback; };

/** Design mode for overlays: place pictures, videos and text anywhere; the screen's own picture shows under it */
export function OverlayDesignWorkspace({ overlays, overlayId, onPick, onChange, onNew, isOn, onToggleOn, onDesignFor, renderUnder }: {
  overlays: Overlay[];
  overlayId: string | null;
  onPick: (id: string) => void;
  /** Save a changed overlay (it updates on the screens at once if it is on) */
  onChange: (overlay: Overlay) => void;
  onNew: () => void;
  isOn: boolean;
  onToggleOn: () => void;
  onDesignFor: (v: DesignFor) => void;
  /** What the screen shows now (drawn under the overlay, so it can be placed around the words) */
  renderUnder: () => React.ReactNode;
}) {
  const saved = overlays.find(o => o.id === overlayId) || overlays[0];
  // A change being dragged: canvas only until it is let go
  const [draft, setDraft] = useState<Overlay | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showUnder, setShowUnder] = useState(true);
  const [guides, setGuides] = useState(true);
  useEffect(() => { setDraft(null); setSel(null); setEditing(null); }, [saved?.id]);

  const header = (
    <div className="h-11 px-3 border-b border-[#262635] bg-[#101015] flex items-center gap-3 shrink-0">
      <DesignForSwitch value="overlay" onChange={onDesignFor} />
      {overlays.length > 0 && <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Overlay</span>}
      {overlays.length > 0 && <select value={saved?.id || ''} onChange={(e) => onPick(e.target.value)} className={`${selectCls} max-w-[220px]`} disabled={!overlays.length} data-overlay-pick>
        {overlays.map(o => <option key={o.id} value={o.id}>{o.name}{o.group ? ` · ${o.group}` : ''}</option>)}
      </select>}
      <button type="button" onClick={onNew} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`}><Plus size={11} /> New overlay</button>
      {saved && (
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setShowUnder(v => !v)} className={`${smallBtn} bg-white/5 text-neutral-300 hover:bg-white/10 flex items-center gap-1`} title="Show what the screen shows now under the overlay">
            {showUnder ? <Eye size={11} /> : <EyeOff size={11} />} Screen under it
          </button>
          <button type="button" onClick={() => setGuides(v => !v)} className={`${smallBtn} ${guides ? 'bg-white/10 text-white' : 'bg-white/5 text-neutral-400'}`}>Guides</button>
          <button
            type="button"
            onClick={onToggleOn}
            className={`${smallBtn} flex items-center gap-1 ${isOn ? 'bg-pink-600 text-white' : 'bg-white/5 text-neutral-200 hover:bg-white/10'}`}
            title={isOn ? 'It is on the screens: click to take it off' : 'Put it on the screens'}
            data-overlay-onair
          >
            {isOn ? '● On the screens' : 'Put on screens'}
          </button>
        </div>
      )}
    </div>
  );

  // Delete removes the picked text or media (set below, once the overlay is known)
  const deleteRef = useRef<(() => boolean) | null>(null);
  useDeleteKey(() => deleteRef.current?.() ?? false);

  if (!saved) {
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#07070a]">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6" data-overlay-empty>
          <p className="text-sm text-neutral-400 max-w-md">No overlays yet. An overlay is a logo, frame, lower third or any picture or text that stays on the screens while slides and backgrounds change.</p>
          <button type="button" onClick={onNew} className="px-4 py-1.5 rounded-full text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1.5"><Plus size={13} /> New overlay</button>
        </div>
      </div>
    );
  }

  const shown = draft ?? saved;
  const texts = shown.texts;
  const media = shown.media;
  const selText = sel?.kind === 'text' ? texts.find(t => t.id === sel.id) : undefined;
  const selMedia = sel?.kind === 'media' ? media.find(m => m.id === sel.id) : undefined;

  const change = (fn: (o: Overlay) => Overlay, phase: Phase = 'commit') => {
    if (phase === 'draft') { setDraft(prev => fn(prev ?? saved)); return; }
    setDraft(null);
    onChange(fn(draft ?? saved));
  };
  const changeText = (id: string, patch: Partial<OverlayText>, phase: Phase = 'commit') =>
    change(o => ({ ...o, texts: o.texts.map(t => t.id === id ? { ...t, ...patch } : t) }), phase);
  const setTextStyle = (patch: React.CSSProperties, phase: Phase = 'commit') =>
    selText && changeText(selText.id, { style: { ...(selText.style || {}), ...patch } }, phase);
  const changeMedia = (id: string, patch: Partial<DesignMedia>, phase: Phase = 'commit') =>
    change(o => ({ ...o, media: o.media.map(m => m.id === id ? { ...m, ...patch } : m) }), phase);

  const addText = () => {
    const t: OverlayText = { id: `text-${Date.now().toString(36)}`, text: '', layout: { ...NEW_OVERLAY_TEXT_LAYOUT }, style: { ...NEW_OVERLAY_TEXT_STYLE } };
    change(o => ({ ...o, texts: [...o.texts, t] }));
    setSel({ kind: 'text', id: t.id });
    setEditing(t.id);
  };
  const addMedia = async () => {
    const file = await chooseDesignMediaFile();
    if (!file) return;
    const m = newDesignMedia(file);
    change(o => ({ ...o, media: [...o.media, m] }));
    setSel({ kind: 'media', id: m.id });
  };
  const replaceMedia = async (id: string) => {
    const file = await chooseDesignMediaFile();
    if (file) changeMedia(id, { type: file.type, name: file.name, path: file.path, storedId: file.storedId });
  };
  deleteRef.current = () => { if (!sel || editing) return false; removeSelected(); return true; };
  const removeSelected = () => {
    if (!sel) return;
    change(o => sel.kind === 'text' ? { ...o, texts: o.texts.filter(t => t.id !== sel.id) } : { ...o, media: o.media.filter(m => m.id !== sel.id) });
    setSel(null);
  };
  const moveMedia = (id: string, dir: 1 | -1) => change(o => {
    const list = [...o.media];
    const at = list.findIndex(m => m.id === id);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= list.length) return o;
    [list[at], list[to]] = [list[to], list[at]];
    return { ...o, media: list };
  });
  const saveText = (id: string, text: string) => {
    setEditing(null);
    if (!text.trim()) { change(o => ({ ...o, texts: o.texts.filter(t => t.id !== id) })); setSel(null); return; }
    changeText(id, { text });
  };
  const cancelText = (id: string) => {
    setEditing(null);
    // A new text that was never typed goes away
    if (!saved.texts.find(t => t.id === id)?.text.trim()) { change(o => ({ ...o, texts: o.texts.filter(t => t.id !== id) })); setSel(null); }
  };

  const g = selText?.style || {};
  const colorValue = /^#[0-9a-f]{6}$/i.test(String(g.color || '')) ? String(g.color) : '#ffffff';
  const shadowValue = String(g.textShadow || 'none');
  const editingText = editing ? texts.find(t => t.id === editing) : undefined;

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#07070a] select-none" data-overlay-designer>
      {header}
      <div className="px-3 py-2 space-y-2 border-b border-[#262635] bg-[#0d0d12] shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <GroupLabel fixed>Items</GroupLabel>
          {texts.map((t, i) => (
            <button key={t.id} type="button" onClick={() => setSel({ kind: 'text', id: t.id })} className={`${smallBtn} flex items-center gap-1 max-w-[160px] ${selText?.id === t.id ? 'bg-pink-600 text-white' : 'bg-[#1e1e28] text-neutral-300 hover:text-white'}`} data-overlay-item="text">
              <Type size={11} className="shrink-0" /> <span className="truncate">{t.text.split('\n')[0] || `Text ${i + 1}`}</span>
            </button>
          ))}
          {media.map((m, i) => (
            <button key={m.id} type="button" onClick={() => setSel({ kind: 'media', id: m.id })} className={`${smallBtn} flex items-center gap-1 ${selMedia?.id === m.id ? 'bg-pink-600 text-white' : 'bg-[#1e1e28] text-neutral-300 hover:text-white'}`} title={m.name} data-overlay-item="media">
              <ImageIcon size={11} /> {m.type === 'video' ? 'Video' : 'Picture'} {i + 1}
            </button>
          ))}
          <button type="button" onClick={addText} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} data-overlay-add-text><Plus size={11} /> Add text</button>
          <button type="button" onClick={() => void addMedia()} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`} data-design-add-media><ImageIcon size={11} /> Add media</button>
          <Divider />
          <button
            type="button"
            onClick={() => change(o => ({ ...o, aboveWords: o.aboveWords ? undefined : true }))}
            className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10 flex items-center gap-1`}
            title="Whether the overlay is drawn under or over the slide's words"
            data-overlay-layer
          >
            {shown.aboveWords ? <><ArrowUpToLine size={11} /> Over the words</> : <><ArrowDownToLine size={11} /> Under the words</>}
          </button>
          {sel && (
            <button type="button" onClick={removeSelected} className={`${smallBtn} bg-white/5 text-red-300 hover:bg-red-500/20 flex items-center gap-1`}><Trash2 size={11} /> Delete {sel.kind === 'text' ? 'text' : 'media'}</button>
          )}
        </div>

        {selText && (
          <div className="flex flex-wrap items-center gap-2" data-overlay-text-row>
            <GroupLabel fixed>Text</GroupLabel>
            <FontSelect value={String(g.fontFamily || '')} onChange={(v) => setTextStyle({ fontFamily: v })} />
            <SizeStepper value={parseNum(g.fontSize, 64)} onChange={(v) => setTextStyle({ fontSize: `${v}px` })} />
            <select value={String(g.fontWeight || '700')} onChange={(e) => setTextStyle({ fontWeight: e.target.value })} className={selectCls} title="Weight">
              {WEIGHTS.map(w => <option key={w} value={w}>Weight {w}</option>)}
            </select>
            <ColorField value={colorValue} onChange={(v, phase) => setTextStyle({ color: v }, phase)} />
            <button type="button" onClick={() => setTextStyle({ textTransform: g.textTransform === 'uppercase' ? 'none' : 'uppercase' })} className={`${segBtn(g.textTransform === 'uppercase')} rounded`} title="Uppercase">AA</button>
            <div className="flex rounded overflow-hidden">
              {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                <button key={a} type="button" onClick={() => setTextStyle({ textAlign: a })} className={segBtn((g.textAlign || 'center') === a)}><Icon size={13} /></button>
              ))}
            </div>
            <select value={SHADOW_PRESETS.some(s => s.value === shadowValue) ? shadowValue : '__custom'} onChange={(e) => setTextStyle({ textShadow: e.target.value })} className={`${selectCls} max-w-[170px]`} title="Shadow">
              {!SHADOW_PRESETS.some(s => s.value === shadowValue) && <option value="__custom" disabled>Shadow: custom</option>}
              {SHADOW_PRESETS.map(s => <option key={s.label} value={s.value}>Shadow: {s.label}</option>)}
            </select>
            <TextPositionSwitch value={selText.verticalAlign} onChange={(v) => changeText(selText.id, { verticalAlign: v })} />
            <button type="button" onClick={() => setEditing(selText.id)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10`}>Edit words</button>
          </div>
        )}
        {selMedia && (
          <div className="flex flex-wrap items-center gap-2" data-design-row="media">
            <GroupLabel fixed>Media</GroupLabel>
            <DesignMediaControls
              item={selMedia}
              onChange={(patch, phase) => changeMedia(selMedia.id, patch, phase)}
              onReplace={() => void replaceMedia(selMedia.id)}
              onRemove={removeSelected}
            />
            {media.length > 1 && (
              <>
                <Divider />
                <button type="button" onClick={() => moveMedia(selMedia.id, 1)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10`}>Forward</button>
                <button type="button" onClick={() => moveMedia(selMedia.id, -1)} className={`${smallBtn} bg-white/5 text-neutral-200 hover:bg-white/10`}>Backward</button>
              </>
            )}
          </div>
        )}
        {!sel && <p className="text-[11px] text-neutral-500">Add text or a picture/video, then drag it anywhere on the screen. Double-click text to change its words. Overlays stay on while slides and backgrounds change; F3 takes them off.</p>}
      </div>

      <div className="flex-1 min-h-0 p-3" data-design-canvas>
        <FixedStage className="w-full h-full">
          {(scale: number) => (
            <>
              <div className="absolute inset-0 bg-[#0c0c14] bg-[radial-gradient(#33334d_2px,transparent_2px)] [background-size:24px_24px]" />
              {showUnder && <div className="absolute inset-0 opacity-60 pointer-events-none">{renderUnder()}</div>}
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: shown.aboveWords ? 20 : 4 }}>
                <OverlayContent overlay={editingText ? { ...shown, texts: shown.texts.filter(t => t.id !== editingText.id) } : shown} />
              </div>
              {guides && media.filter(m => m.id !== selMedia?.id).map(m => (
                <React.Fragment key={m.id}>
                  <DesignBox rect={m.layout} scale={scale} movable label={`${m.type === 'video' ? 'Video' : 'Picture'} · drag to move · corners to resize`}
                    onSelect={() => setSel({ kind: 'media', id: m.id })}
                    onChange={(r) => changeMedia(m.id, { layout: r }, 'draft')} onChangeEnd={(r) => changeMedia(m.id, { layout: r }, 'commit')} />
                </React.Fragment>
              ))}
              {guides && texts.filter(t => t.id !== editing && t.id !== selText?.id).map(t => (
                <React.Fragment key={t.id}>
                  <DesignBox rect={t.layout} scale={scale} movable label="Text · drag to move · double-click to edit"
                    onSelect={() => setSel({ kind: 'text', id: t.id })}
                    onChange={(r) => changeText(t.id, { layout: r }, 'draft')} onChangeEnd={(r) => changeText(t.id, { layout: r }, 'commit')}
                    onDoubleClick={() => { setSel({ kind: 'text', id: t.id }); setEditing(t.id); }} />
                </React.Fragment>
              ))}
              {guides && selMedia && (
                <DesignBox rect={selMedia.layout} scale={scale} movable selected label={`${selMedia.type === 'video' ? 'Video' : 'Picture'} · drag to move · corners to resize`}
                  onSelect={() => setSel({ kind: 'media', id: selMedia.id })}
                  onChange={(r) => changeMedia(selMedia.id, { layout: r }, 'draft')} onChangeEnd={(r) => changeMedia(selMedia.id, { layout: r }, 'commit')} />
              )}
              {guides && selText && editing !== selText.id && (
                <DesignBox rect={selText.layout} scale={scale} movable selected label="Text · drag to move · double-click to edit"
                  onSelect={() => setSel({ kind: 'text', id: selText.id })}
                  onChange={(r) => changeText(selText.id, { layout: r }, 'draft')} onChangeEnd={(r) => changeText(selText.id, { layout: r }, 'commit')}
                  onDoubleClick={() => setEditing(selText.id)} />
              )}
              {editingText && (
                <InlineTextEditor
                  rect={editingText.layout}
                  scale={scale}
                  initialText={editingText.text}
                  placeholder="Type your text…"
                  hint={`Text in the overlay "${shown.name}"`}
                  sendsToScreen={isOn}
                  onSave={(text) => saveText(editingText.id, text)}
                  onCancel={() => cancelText(editingText.id)}
                />
              )}
            </>
          )}
        </FixedStage>
      </div>
    </div>
  );
}
