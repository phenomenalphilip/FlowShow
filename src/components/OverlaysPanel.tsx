import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, Check, Copy, FolderInput, Monitor, Pencil, Plus, Trash2, X } from 'lucide-react';
import { FixedStage } from './FixedStage';
import { Overlay, OverlayContent, newOverlay } from '../lib/overlays';
import { askConfirm, askText } from '../lib/appDialogs';

type Screen = { id: string; name: string };
type Menu =
  | { kind: 'overlay'; x: number; y: number; overlay: Overlay }
  | { kind: 'group'; x: number; y: number; group: string };

const ALL = '__all';
const UNGROUPED = '__none';

/** The Overlays tab: click an overlay to switch it on or off (several can be on); F3 takes them all off */
export function OverlaysPanel({ overlays, groups, activeIds, screens, onChange, onChangeGroups, onToggle, onClearAll, onEdit }: {
  overlays: Overlay[];
  /** Group names, kept even when empty */
  groups: string[];
  activeIds: string[];
  /** Audience screens an overlay can be limited to */
  screens: Screen[];
  onChange: (overlays: Overlay[]) => void;
  onChangeGroups: (groups: string[]) => void;
  onToggle: (id: string) => void;
  onClearAll: () => void;
  /** Open it in Design mode */
  onEdit: (id: string) => void;
}) {
  const [group, setGroup] = useState<string>(ALL);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sub, setSub] = useState<'group' | 'screens' | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => { setMenu(null); setSub(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('resize', close); };
  }, [menu]);

  const allGroups = Array.from(new Set([...groups, ...overlays.map(o => o.group).filter((g): g is string => !!g)]));
  const shown = overlays.filter(o => group === ALL || (group === UNGROUPED ? !o.group : o.group === group));
  const activeCount = overlays.filter(o => activeIds.includes(o.id)).length;
  const update = (id: string, fn: (o: Overlay) => Overlay) => onChange(overlays.map(o => o.id === id ? fn(o) : o));

  const addOverlay = async () => {
    const name = await askText('Name for the new overlay (for example Logo, Lower third, Live bug)', '', { okLabel: 'Create' });
    if (!name?.trim()) return;
    const o = newOverlay(name.trim(), group !== ALL && group !== UNGROUPED ? group : undefined);
    onChange([...overlays, o]);
    onEdit(o.id);
  };
  const addGroup = async () => {
    const name = await askText('Name for the new group (for example Easter, Youth night, Conference)', '', { okLabel: 'Create' });
    const n = name?.trim();
    if (!n || allGroups.includes(n)) return;
    onChangeGroups([...groups, n]);
    setGroup(n);
  };
  const moveToNewGroup = async (o: Overlay) => {
    const name = await askText('Name for the new group', '', { okLabel: 'Create and move' });
    const n = name?.trim();
    if (!n) return;
    if (!allGroups.includes(n)) onChangeGroups([...groups, n]);
    update(o.id, x => ({ ...x, group: n }));
  };
  const renameOverlay = async (o: Overlay) => {
    const name = await askText('Overlay name', o.name, { okLabel: 'Rename' });
    if (name?.trim()) update(o.id, x => ({ ...x, name: name.trim() }));
  };
  const duplicate = (o: Overlay) => {
    const copy = { ...JSON.parse(JSON.stringify(o)) as Overlay, id: newOverlay('').id, name: `${o.name} (copy)` };
    const at = overlays.findIndex(x => x.id === o.id);
    onChange([...overlays.slice(0, at + 1), copy, ...overlays.slice(at + 1)]);
  };
  const remove = async (o: Overlay) => {
    if (!(await askConfirm(`Delete the overlay "${o.name}"?`, { okLabel: 'Delete', danger: true }))) return;
    if (activeIds.includes(o.id)) onToggle(o.id);
    onChange(overlays.filter(x => x.id !== o.id));
  };
  const renameGroup = async (g: string) => {
    const name = await askText('Group name', g, { okLabel: 'Rename' });
    const n = name?.trim();
    if (!n || n === g) return;
    onChangeGroups(Array.from(new Set(groups.map(x => x === g ? n : x).concat(groups.includes(g) ? [] : [n]))));
    onChange(overlays.map(o => o.group === g ? { ...o, group: n } : o));
    if (group === g) setGroup(n);
  };
  const deleteGroup = async (g: string) => {
    const n = overlays.filter(o => o.group === g).length;
    if (!(await askConfirm(n ? `Delete the group "${g}"? Its ${n} overlay${n === 1 ? '' : 's'} move to Ungrouped (they are not deleted).` : `Delete the group "${g}"?`, { okLabel: 'Delete group' }))) return;
    onChangeGroups(groups.filter(x => x !== g));
    onChange(overlays.map(o => o.group === g ? { ...o, group: undefined } : o));
    if (group === g) setGroup(ALL);
  };
  const toggleScreen = (o: Overlay, id: string) => update(o.id, x => {
    const current = x.outputIds?.length ? x.outputIds : screens.map(s => s.id);
    const next = current.includes(id) ? current.filter(s => s !== id) : [...current, id];
    // Every screen (or none picked) = all screens
    return { ...x, outputIds: next.length === 0 || next.length === screens.length ? undefined : next };
  });

  const groupBtn = (id: string, label: string, count: number, isGroup = false) => (
    <button
      key={id}
      type="button"
      onClick={() => setGroup(id)}
      onContextMenu={isGroup ? (e) => { e.preventDefault(); setMenu({ kind: 'group', x: e.clientX, y: e.clientY, group: id }); } : undefined}
      className={`w-full px-3 py-1.5 rounded-lg text-left text-sm flex items-center justify-between ${group === id ? 'bg-pink-600/15 text-pink-300' : 'text-neutral-300 hover:bg-white/5'}`}
      title={isGroup ? 'Right-click to rename or delete the group' : undefined}
      data-overlay-group={label}
    >
      <span className="truncate">{label}</span>
      <span className="text-[11px] text-neutral-500 shrink-0 ml-2">{count}</span>
    </button>
  );
  const item = 'w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-left';

  return (
    <div className="h-full flex min-h-0" data-overlays-panel>
      {/* Groups */}
      <div className="w-52 shrink-0 border-r border-[#262635] p-2 flex flex-col gap-0.5 overflow-y-auto custom-scrollbar">
        {groupBtn(ALL, 'All', overlays.length)}
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-3 pt-3 pb-1">Groups</div>
        {allGroups.map(g => groupBtn(g, g, overlays.filter(o => o.group === g).length, true))}
        {overlays.some(o => !o.group) && allGroups.length > 0 && groupBtn(UNGROUPED, 'Ungrouped', overlays.filter(o => !o.group).length)}
        <button type="button" onClick={() => void addGroup()} className="px-3 py-1.5 text-sm text-pink-400 hover:text-pink-300 flex items-center gap-1.5" data-new-overlay-group>
          <Plus size={13} /> New group
        </button>
      </div>

      {/* Overlays */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3">
          {shown.length === 0 ? (
            <p className="text-xs text-neutral-500 leading-relaxed max-w-md">
              {overlays.length === 0
                ? 'No overlays yet. An overlay is a logo, frame, lower third or any picture or text that stays on screen while backgrounds and slides change. Click New overlay to make one.'
                : 'No overlays in this group. Right-click an overlay → Move to group.'}
            </p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
              {shown.map(o => {
                const on = activeIds.includes(o.id);
                const where = o.outputIds?.length ? screens.filter(s => o.outputIds!.includes(s.id)).map(s => s.name).join(', ') : 'All screens';
                return (
                  <div key={o.id} className="flex flex-col gap-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => onToggle(o.id)}
                      onDoubleClick={() => onEdit(o.id)}
                      onContextMenu={(e) => { e.preventDefault(); setSub(null); setMenu({ kind: 'overlay', x: e.clientX, y: e.clientY, overlay: o }); }}
                      className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${on ? 'border-pink-500 ring-1 ring-pink-500 shadow-[0_0_14px_color-mix(in_srgb,var(--color-pink-500)_35%,transparent)]' : 'border-white/10 hover:border-pink-500/40'}`}
                      title={`${on ? 'On: click to take it off' : 'Click to put it on the screens'} · double-click to edit · right-click for more`}
                      data-overlay-card={o.name}
                      data-on={on ? '' : undefined}
                    >
                      <div className="absolute inset-0 bg-[#0c0c14] bg-[radial-gradient(#33334d_1px,transparent_1px)] [background-size:8px_8px]" />
                      <FixedStage className="w-full h-full pointer-events-none">
                        <OverlayContent overlay={o} />
                      </FixedStage>
                      {on && <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-pink-600 text-white text-[9px] font-bold tracking-wider">ON</span>}
                      {o.aboveWords && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-neutral-300 text-[9px] font-semibold" title="Shows over the words">Over words</span>}
                    </button>
                    <div className="px-0.5 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{o.name}</div>
                      <div className="text-[10px] text-neutral-500 truncate">{where}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-[#262635] flex items-center justify-between shrink-0">
          <button
            type="button"
            disabled={activeCount === 0}
            onClick={onClearAll}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 hover:bg-white/10 text-neutral-200 flex items-center gap-1.5 disabled:opacity-30"
            title="Take every overlay off the screens (F3)"
            data-clear-overlays
          >
            <X size={12} /> Clear overlays (F3){activeCount ? ` · ${activeCount} on` : ''}
          </button>
          <button type="button" onClick={() => void addOverlay()} className="px-4 py-1.5 rounded-full text-xs font-bold bg-pink-600 hover:bg-pink-500 text-white flex items-center gap-1.5" data-new-overlay>
            <Plus size={13} /> New overlay
          </button>
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-[150] min-w-[200px] py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl text-xs text-neutral-200"
          style={{ left: Math.min(menu.x, window.innerWidth - 420), top: menu.y, transform: menu.y > window.innerHeight / 2 ? 'translateY(-100%)' : undefined }}
          onPointerDown={(e) => e.stopPropagation()}
          data-overlay-menu
        >
          {menu.kind === 'group' ? (
            <>
              <button type="button" className={item} onClick={() => { setMenu(null); void renameGroup(menu.group); }}><Pencil size={13} className="text-neutral-400" /> Rename group</button>
              <button type="button" className={`${item} text-red-300`} onClick={() => { setMenu(null); void deleteGroup(menu.group); }}><Trash2 size={13} /> Delete group</button>
            </>
          ) : (() => {
            const o = overlays.find(x => x.id === menu.overlay.id) || menu.overlay;
            return (
              <div className="flex items-start">
                <div className="min-w-[200px]">
                  <button type="button" className={item} onClick={() => { setMenu(null); onEdit(o.id); }}><Pencil size={13} className="text-neutral-400" /> Edit in Design</button>
                  <button type="button" className={item} onClick={() => { setMenu(null); void renameOverlay(o); }}><Pencil size={13} className="text-neutral-400" /> Rename</button>
                  <button type="button" className={item} onClick={() => { setMenu(null); duplicate(o); }}><Copy size={13} className="text-neutral-400" /> Duplicate</button>
                  <div className="h-px bg-white/5 my-1" />
                  <button type="button" className={item} onClick={() => update(o.id, x => ({ ...x, aboveWords: x.aboveWords ? undefined : true }))} data-overlay-above>
                    {o.aboveWords ? <ArrowDownToLine size={13} className="text-neutral-400" /> : <ArrowUpToLine size={13} className="text-neutral-400" />}
                    {o.aboveWords ? 'Show under the words' : 'Show over the words'}
                  </button>
                  <button type="button" className={`${item} ${sub === 'screens' ? 'bg-white/10' : ''}`} onClick={() => setSub(sub === 'screens' ? null : 'screens')} data-overlay-screens>
                    <Monitor size={13} className="text-neutral-400" /> Screens… <span className="ml-auto text-neutral-500">›</span>
                  </button>
                  <button type="button" className={`${item} ${sub === 'group' ? 'bg-white/10' : ''}`} onClick={() => setSub(sub === 'group' ? null : 'group')} data-overlay-move>
                    <FolderInput size={13} className="text-neutral-400" /> Move to group <span className="ml-auto text-neutral-500">›</span>
                  </button>
                  <div className="h-px bg-white/5 my-1" />
                  <button type="button" className={`${item} text-red-300`} onClick={() => { setMenu(null); void remove(o); }}><Trash2 size={13} /> Delete</button>
                </div>
                {sub === 'screens' && (
                  <div className="min-w-[180px] border-l border-white/10 py-1" data-overlay-screen-list>
                    <div className="px-3 py-1 text-[10px] uppercase tracking-widest text-neutral-500">Shows on</div>
                    {screens.map(s => {
                      const checked = !o.outputIds?.length || o.outputIds.includes(s.id);
                      return (
                        <button key={s.id} type="button" className={item} onClick={() => toggleScreen(o, s.id)} data-overlay-screen={s.name}>
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${checked ? 'bg-pink-600 border-pink-500' : 'border-white/30'}`}>{checked && <Check size={10} />}</span>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {sub === 'group' && (
                  <div className="min-w-[180px] border-l border-white/10 py-1">
                    <button type="button" className={item} onClick={() => { setMenu(null); update(o.id, x => ({ ...x, group: undefined })); }}>
                      <span className="w-3.5">{!o.group && <Check size={12} />}</span> Ungrouped
                    </button>
                    {allGroups.map(g => (
                      <button key={g} type="button" className={item} onClick={() => { setMenu(null); update(o.id, x => ({ ...x, group: g })); }} data-overlay-move-to={g}>
                        <span className="w-3.5">{o.group === g && <Check size={12} />}</span> {g}
                      </button>
                    ))}
                    <div className="h-px bg-white/5 my-1" />
                    <button type="button" className={item} onClick={() => { setMenu(null); void moveToNewGroup(o); }}><Plus size={12} /> New group…</button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
